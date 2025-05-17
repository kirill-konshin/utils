import React, { useCallback, useMemo, useState, JSX } from 'react';
import { Button, Modal, ModalProps, Offcanvas, OffcanvasProps, Stack } from 'react-bootstrap';

export type UseModalArgs = { onClose?: any; showOnMount?: boolean };

export type UseModalProps = {
    children?: any;
    show?: boolean;
    onSubmit?: (e: any) => void;
    submitButton?: string | any;
    cancelButton?: string | any;
    offcanvas?: boolean;
    title?: string | any;
    containerProps?: ModalProps | OffcanvasProps;
};

export function useModal({ onClose, showOnMount }: UseModalArgs = {}): {
    show: boolean | undefined;
    close: () => void;
    open: () => void;
    ModalDialog: ({
        children,
        show,
        onSubmit,
        submitButton,
        cancelButton,
        offcanvas,
        title,
        containerProps,
    }: ModalProps) => JSX.Element;
} {
    const [show, setShow] = useState(showOnMount);

    const close = useCallback((): void => {
        setShow(false);
        onClose?.();
    }, [onClose]);

    const open = useCallback((): void => setShow(true), []);

    const defaultOnSubmit = useCallback(
        (e) => {
            e.preventDefault();
            close();
        },
        [close],
    );

    const ModalDialog = useMemo(
        () =>
            function ModalDialog({
                children,
                show,
                onSubmit = defaultOnSubmit,
                submitButton = 'Done',
                cancelButton = 'Cancel',
                offcanvas = false,
                title = null as any,
                containerProps = {},
            }: ModalProps): JSX.Element {
                const Container = offcanvas ? Offcanvas : Modal;
                const containerDefaultProps = offcanvas ? { style: { maxWidth: '85%' } } : {};
                const Body = offcanvas ? Offcanvas.Body : Modal.Body;
                const Header = offcanvas ? Offcanvas.Header : Modal.Header;
                const Title = offcanvas ? Offcanvas.Title : Modal.Title;

                return (
                    <Container {...{ ...containerDefaultProps, ...containerProps }} show={show} onHide={close}>
                        <form onSubmit={onSubmit}>
                            {title && (
                                <Header closeButton>
                                    <Title>{title}</Title>
                                </Header>
                            )}

                            <Body as={Stack} gap={3}>
                                {show && children}
                            </Body>

                            {!offcanvas && (submitButton || cancelButton) && (
                                <Modal.Footer>
                                    {cancelButton && (
                                        <Button variant="outline-secondary" onClick={close}>
                                            {cancelButton}
                                        </Button>
                                    )}
                                    {submitButton && (
                                        <Button variant="secondary" type="submit">
                                            {submitButton}
                                        </Button>
                                    )}
                                </Modal.Footer>
                            )}
                        </form>
                    </Container>
                );
            },
        [close, defaultOnSubmit],
    );

    return { show, close, open, ModalDialog };
}
