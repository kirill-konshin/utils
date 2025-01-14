'use client';

import { useCallback, useState, useTransition } from 'react';

export function useFetch<R>(
    fn: (...args: any[]) => Promise<R>,
    defaultValue: R | null = null,
): [R | null, typeof fn, boolean, Error | undefined] {
    // An async function was passed to useActionState, but it was dispatched outside of an action context.
    // This is likely not what you intended. Either pass the dispatch function to an `action` prop, or dispatch manually inside `startTransition`
    const [isPending, startTransition] = useTransition();
    const [data, setData] = useState<R | null>(defaultValue);
    const [error, setError] = useState<Error>();

    const actionFn = useCallback(
        (...args: Parameters<typeof fn>) => {
            const promise = fn(...args);
            // https://react.dev/reference/react/useTransition#react-doesnt-treat-my-state-update-after-await-as-a-transition
            startTransition(() => promise.then(setData).catch(setError));
            return promise;
        },
        [fn],
    );

    return [data, actionFn, isPending, error];
}
