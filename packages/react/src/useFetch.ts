'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

const unmountError = 'Component is unmounted after fetch completed';

/**
 * TODO useFetch https://use-http.com
 * TODO SWR?
 * TODO Tanstack Query?
 *
 * Uses same return array patterns as useActionState https://react.dev/reference/react/useActionState + error,
 * reason: simple var rename
 *
 * Function can be async, then it will be awaited and result set to state.
 *
 * Function can be sync, then it will be called args, and it should return another function,which will be called with
 * old data and result set to state. This is useful for pagination and merging data.
 *
 * @param {(...args: any[]) => Promise<R> | R | ((oldData: R) => Promise<R> | R))} fn
 * @param {any} defaultValue
 * @param fetchOnMount
 * @param throwAfterUnmount - throw if component is unmounted after fetch completed
 * @returns {[R, (...args: any[]) => Promise<R>, boolean, Error | undefined]} //, ReturnType<typeof useState>, ReturnType<typeof useState>
 */
export function useFetch<R>(
    fn: (...args: any[]) => Promise<R> | R | ((oldData: R) => Promise<R> | R),
    defaultValue: R,
    {
        fetchOnMount = false,
        throwAfterUnmount = false,
    }: {
        fetchOnMount?: boolean;
        throwAfterUnmount?: boolean;
    } = {},
): [
    R,
    (...args: Parameters<typeof fn>) => Promise<R>,
    boolean,
    Error | undefined,
    // ReturnType<typeof useState<R>>[1],
    // ReturnType<typeof useState<Error>>[1],
] {
    // An async function was passed to useActionState, but it was dispatched outside of an action context.
    // This is likely not what you intended. Either pass the dispatch function to an `action` prop, or dispatch manually inside `startTransition`
    const [isPending, startTransition] = useTransition();
    const [data, setData] = useState<R>(defaultValue);
    const [error, setError] = useState<Error>();
    const [loading, setLoading] = useState(fetchOnMount);
    const isMounted = useRef(false);
    const oldData = useRef(data);
    const throwAfterUnmountRef = useRef(throwAfterUnmount);

    const actionFn = useCallback(
        (...args: Parameters<typeof fn>) => {
            const res = fn(...args);

            const promise: Promise<R> = typeof res === 'function' ? (res as any)(oldData.current) : (res as Promise<R>);

            // https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition
            startTransition(async () => {
                try {
                    const newData = await promise;
                    if (!isMounted.current) {
                        if (throwAfterUnmountRef.current) throw new Error(unmountError);
                        return;
                    }
                    oldData.current = newData;
                    setData(newData);
                    setError(undefined);
                } catch (e) {
                    if (!isMounted.current) {
                        if (throwAfterUnmountRef.current) {
                            if (e.message !== unmountError) throw new Error('Component is unmounted', { cause: e });
                            else throw e;
                        }
                        return;
                    }
                    setError(e);
                } finally {
                    if (isMounted.current) {
                        setLoading(false);
                    }
                }
            });

            return promise;
        },
        [fn],
    );

    useEffect(() => {
        if (!fetchOnMount) return;
        actionFn().catch((e) => console.error('Fetch on mount failed', e)); // catch actually will never happen
    }, [fetchOnMount, fn, actionFn]);

    useEffect(() => {
        throwAfterUnmountRef.current = throwAfterUnmount;
    }, [throwAfterUnmount]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    });

    return [data, actionFn, isPending || loading, error]; // , setData, setError
}
