'use client';

import React from 'react';

export function useBreakpoint() {
    const [breakpoint, setBreakpoint] = React.useState('xs');

    React.useEffect(() => {
        const updateBreakpoint = () => {
            const width = window.innerWidth;
            if (width < 576) {
                setBreakpoint('xs');
            } else if (width < 768) {
                setBreakpoint('sm');
            } else if (width < 992) {
                setBreakpoint('md');
            } else if (width < 1200) {
                setBreakpoint('lg');
            } else if (width < 1400) {
                setBreakpoint('xl');
            } else {
                setBreakpoint('xxl');
            }
        };

        updateBreakpoint();
        window.addEventListener('resize', updateBreakpoint);

        return () => {
            window.removeEventListener('resize', updateBreakpoint);
        };
    }, []);

    const isMobile = ['xs', 'sm', 'md'].includes(breakpoint);

    return { breakpoint, isMobile, isDesktop: !isMobile };
}

export function ResponsiveHelper() {
    return (
        <span className="small position-fixed bottom-0 z-3" style={{ fontSize: '9px', right: 1, lineHeight: 1 }}>
            <small className="d-block d-sm-none">XS</small>
            <small className="d-none d-sm-block d-md-none">SM</small>
            <small className="d-none d-md-block d-lg-none">MD</small>
            <small className="d-none d-lg-block d-xl-none">LG</small>
            <small className="d-none d-xl-block d-xxl-none">XL</small>
            <small className="d-none d-xxl-block">XXL</small>
        </span>
    );
}
