import React from 'react';
import { Form, FormGroupProps, FormLabelProps, FormTextProps } from 'react-bootstrap';

export function FieldGroup({
    label,
    labelProps = {},
    text,
    textProps = {},
    horizontal,
    children,
    ...props
}: FormGroupProps & {
    label?: any;
    labelProps?: FormLabelProps;
    text?: any;
    textProps?: FormTextProps;
    horizontal?: boolean;
}) {
    if (horizontal) {
        props.className = 'hstack gap-3 ' + (props.className || '');
        labelProps.className = 'm-0 ' + (labelProps.className || '');
    }

    if (text && horizontal) {
        throw new Error('Cannot use text and horizontal together');
    }

    return (
        <Form.Group {...props}>
            {label && <Form.Label {...labelProps}>{label}</Form.Label>}
            {children}
            {text && !horizontal && <Form.Text {...textProps}>{text}</Form.Text>}{' '}
        </Form.Group>
    );
}
