'use client';

import { useActionState, useCallback, useEffect, useState, startTransition } from 'react';

/**
 * @param {(state: Awaited<R>, payload?: any) => Promise<R> | R} action
 * @param {R} defaultValue
 * @param {boolean} fetchOnMount
 * @param {string} permalink
 * @returns {[R, (payload?: P) => Promise<R> | R, boolean]}>
 */
export function useFetchAction<S, P = undefined>(
    action: (state: Awaited<S>, payload?: P) => S | Promise<S>,
    defaultValue: Awaited<S>,
    {
        fetchOnMount = false,
        permalink = undefined,
    }: {
        fetchOnMount?: boolean;
        permalink?: string;
    } = {},
): [S, (payload: P) => void, boolean] {
    const [data, dispatchAction, isPending] = useActionState<S, P | undefined>(action, defaultValue, permalink);
    const [loading, setLoading] = useState(fetchOnMount);

    const dispatch = useCallback(
        (payload?: P) => {
            startTransition(() => {
                dispatchAction(payload);
                setLoading(false);
            });
        },
        [dispatchAction],
    );

    useEffect(() => {
        if (!fetchOnMount || !loading) return;
        dispatch(undefined);
    }, [fetchOnMount, dispatch, loading]);

    return [data, dispatch, isPending || loading];
}
