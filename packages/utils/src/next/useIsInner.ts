'use client';

import { useSelectedLayoutSegments } from 'next/navigation';

export const useIsInner = (): boolean => {
    const pathname = useSelectedLayoutSegments();
    return pathname.length > 0;
};
