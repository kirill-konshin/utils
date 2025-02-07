import React, { FC } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { useModal, UseModalProps } from './useModal';
import { Button, ButtonGroup } from 'react-bootstrap';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'Bootstrap / useModal',
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        title: { control: 'text' },
        cancelButton: { control: 'text' },
        submitButton: { control: 'text' },
        offcanvas: { control: 'check' },
    },
    args: {
        children: 'Modal Content',
        title: 'Modal Title',
    },
    render: function Demo(args) {
        const { open, show, close, ModalDialog } = useModal();
        return (
            <>
                <Button onClick={open}>Open Modal</Button>
                <ModalDialog {...args} show={show}>
                    {args.children}
                    <Button onClick={close}>Close Modal</Button>
                </ModalDialog>
            </>
        );
    },
    // args: { onSubmit: (e) => e.preventDefault() },
} satisfies Meta<FC<UseModalProps>>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {},
};

export const Offcanvas: Story = {
    args: {
        offcanvas: true,
    },
};
