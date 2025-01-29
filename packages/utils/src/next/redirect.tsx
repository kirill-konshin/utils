'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Redirect({ to, replace }: { to: string; replace?: boolean }) {
    const router = useRouter();
    useEffect(() => {
        router[replace ? 'replace' : 'push'](to as any);
    }, [replace, router, to]);
    return null;
}
