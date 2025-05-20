import React, { FC } from 'react';
import { Nav, Navbar } from 'react-bootstrap';
import { useBreakpoint } from './responsiveHelper';
import { AdaptiveContainer } from './adaptiveContainer';

export type FooterNavItemProps = {
    href: any;
    icon: any;
    active?: boolean | undefined;
    children?: string | undefined;
};

export const FooterNavItem: FC<FooterNavItemProps> = function FooterNavItem({
    href,
    icon,
    active = false,
    children = '',
}) {
    // const pathname = usePathname();

    const isFilepath = icon.includes('.');
    let iconElement;

    if (isFilepath) {
        iconElement = <img src={icon} alt="icon" className="me-lg-2" />;
    } else {
        iconElement = <span className={`lead me-lg-2 ${icon}`} />;
    }

    // const active = isActivePath(href, pathname);

    const link = (
        <Nav.Link
            // as={Link}
            href={href}
            // active={active} // has no effect when not pills or tabs
            className={`px-0 px-lg-3 d-flex align-items-center flex-column flex-lg-row ${active ? 'text-primary' : ''}`}
        >
            {iconElement}
            {children}
        </Nav.Link>
    );

    return <Nav.Item style={{ flex: 1 }}>{link}</Nav.Item>;
};

export const Footer: FC<any> = function Footer({ children }) {
    const { isDesktop } = useBreakpoint();

    return (
        // border-bottom
        <div className={isDesktop ? '' : 'border-top'}>
            <Navbar className={isDesktop ? '' : 'py-0'}>
                <AdaptiveContainer>
                    {isDesktop && <Navbar.Brand href="/">Le Brand</Navbar.Brand>}
                    <Nav className={isDesktop ? 'me-auto' : 'justify-content-center flex-nowrap w-100'}>{children}</Nav>
                </AdaptiveContainer>
            </Navbar>
        </div>
    );
};
