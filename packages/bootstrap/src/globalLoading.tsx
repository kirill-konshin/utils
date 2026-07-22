import React, { type FC, memo } from 'react';

// import { useLoading, useLoadingTimeout } from '../redux/loadingSlice';
import { Loading } from './loading';

export type GlobalLoadingProps = { loading: boolean };

export const GlobalLoading: FC<GlobalLoadingProps> = memo(function GlobalLoading({ loading }) {
    // const { loading } = useLoading();

    // useLoadingTimeout(15000); // escape latch if something is stuck

    if (!loading) return null;

    return (
        <div className="position-absolute d-flex align-items-center justify-content-center start-0 top-0 z-3 size-100 bg-white">
            <Loading />
        </div>
    );
});
