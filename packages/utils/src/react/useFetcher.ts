import { useCallback, useEffect, useRef, useState } from 'react';

export function useFetcher<T = any>(
    cb,
    // eslint-disable-next-line no-unused-vars
    { fetchOnMount = false, onError }: { fetchOnMount?: boolean; onError?: (e: Error) => void } = {}
) {
    const [loading, setLoading] = useState(fetchOnMount);
    const [error, setError] = useState<Error | null>(null);
    const [data, setData] = useState<T | null>(null);

    const isMounted = useRef(false);

    const trigger = useCallback(
        async (...args) => {
            try {
                setLoading(true);
                setError(null);
                const res = await cb(args);
                if (!isMounted.current) return;
                setData(res);
                return res;
            } catch (e) {
                console.error('Fetch failed', e);
                if (!isMounted.current) return;
                setError(e);
                (onError as any)?.(e);
            } finally {
                if (isMounted.current) setLoading(false);
            }
        },
        [cb, onError]
    );

    useEffect(() => {
        if (fetchOnMount) {
            trigger().catch((e) => console.error('Fetch on mount failed', e)); // catch actually will never happen
        }
    }, [fetchOnMount, cb, trigger]);

    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
        };
    });

    return { loading, error, data, trigger };
}
