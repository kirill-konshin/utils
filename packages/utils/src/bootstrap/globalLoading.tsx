import React from 'react';
// import { useLoading, useLoadingTimeout } from '../redux/loadingSlice';
import { Loading } from './loading';

export function GlobalLoading({ loading }: { loading: boolean }) {
    // const { loading } = useLoading();

    // useLoadingTimeout(15000); // escape latch if something is stuck

    if (!loading) return null;

    return (
        <div className="bg-white position-absolute top-0 start-0 w-100 h-100 z-3 d-flex align-items-center justify-content-center">
            <Loading />
        </div>
    );
}
