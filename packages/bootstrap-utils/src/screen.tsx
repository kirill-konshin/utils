import { Button, Navbar, Nav, Stack } from 'react-bootstrap';
import React from 'react';
import { useBreakpoint } from './responsiveHelper';
import { AdaptiveContainer } from './adaptiveContainer';
// import { useRouter } from 'next/navigation';

export function Screen({
    backBtn,
    backCb,
    backIcon,
    forwardBtn,
    forwardIcon,
    forwardCb,
    footer,
    header,
    children,
    noContentPadding = false,
    contentClassName = '',
    title = '',
    centerContent = false,
    noHeader = false,
    noFooter = false,
    // noFolders = false,
}: {
    backBtn?;
    backCb?;
    backIcon?;
    forwardBtn?;
    forwardIcon?;
    forwardCb?;
    children: any;
    contentClassName?: string;
    noContentPadding?: boolean;
    header?: any;
    footer?: any;
    title?: any;
    centerContent?: boolean;
    noHeader?: boolean;
    noFooter?: boolean;
    // noFolders?: boolean;
}) {
    // const router = useRouter();

    backBtn =
        backBtn ||
        (backCb ? (
            // backCb === true ? () => router.back() : backCb
            <Button onClick={backCb} variant="nav">
                {
                    <>
                        <span className={backIcon || 'bi-chevron-left icon-thick'} />
                        <span className="d-none d-lg-inline ms-2">Back</span>
                    </>
                }
            </Button>
        ) : null);

    forwardBtn =
        forwardBtn ||
        (forwardCb ? (
            <Button onClick={forwardCb}>{forwardIcon ? <span className={forwardIcon}></span> : 'Next'}</Button>
        ) : null);

    const { isMobile, isDesktop } = useBreakpoint();

    // useLoadingTimeout(1000); // less jerky UI

    return (
        <div className={`d-flex flex-column flex-grow-1 flex-lg-grow-0 ${isMobile ? 'vh-100' : ''}`} data-id="screen">
            {/* HEADER */}

            {/* FIXME postition fixed does not assign z-index automatically https://getbootstrap.com/docs/4.0/layout/overview/#z-index*/}
            {!noHeader && (
                <header className="shadow-sm border-bottom" data-id="header">
                    {/*{!noFolders && <FolderBar />}*/}

                    {isDesktop && !noFooter && footer}

                    {title && (
                        <Navbar expand className={'main-nav ' + (isDesktop ? 'border-bottom' : '')}>
                            <AdaptiveContainer className="gap-2">
                                {backBtn && <Nav className="hstack gap-3">{backBtn}</Nav>}
                                <Navbar.Brand className="me-auto">{title}</Navbar.Brand>
                                {forwardBtn && <Nav className="hstack gap-3">{forwardBtn}</Nav>}
                            </AdaptiveContainer>
                        </Navbar>
                    )}

                    {header}
                </header>
            )}

            {/* CONTENT */}

            <AdaptiveContainer
                as="main"
                className={[
                    isMobile ? 'overflow-y-auto overflow-x-hidden' : 'gap-3',
                    `flex-grow-1 d-flex flex-column`,
                    centerContent ? 'align-items-center justify-content-center' : 'justify-content-start',
                    contentClassName,
                    noContentPadding ? 'p-0' : 'py-3',
                ]
                    .filter(Boolean)
                    .join(' ')}
                data-id="content"
            >
                {children}

                {/* Repeat screen buttons at the bottom on desktop */}
                {isDesktop && !noFooter && (
                    <>
                        {footer}

                        {/* TODO Possibly introduce a prop desktopFooterBeforeButtons */}
                        {(forwardBtn || backBtn) && (
                            // Navbar screws up the popper
                            <Stack gap={3} direction="horizontal">
                                {/* No container since already in container */}
                                {backBtn && <Nav className="hstack gap-3">{backBtn}</Nav>}
                                {forwardBtn && <Nav className="hstack gap-3 flex-grow-1">{forwardBtn}</Nav>}
                            </Stack>
                        )}
                    </>
                )}
            </AdaptiveContainer>

            {/* FOOTER */}

            {!noFooter && (
                <footer className="shadow-lg border-top d-block d-lg-none" data-id="footer">
                    {footer}
                </footer>
            )}
        </div>
    );
}
