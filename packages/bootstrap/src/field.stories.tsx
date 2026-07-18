import React from 'react';

import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from '@storybook/test';
import { FormControl } from 'react-bootstrap';

import { FieldGroup } from './field';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta: Meta<typeof FieldGroup> = {
    title: 'Bootstrap / FieldGroup',
    component: FieldGroup,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        text: { control: 'text' },
        label: { control: 'text' },
        horizontal: { control: 'check' },
    },
    args: { onClick: fn() },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Vertical: Story = {
    args: {
        label: 'Label',
        children: <FormControl placeholder="Input" />,
        text: 'Text',
    },
};

export const Horizontal: Story = {
    args: {
        label: 'Label',
        children: <FormControl placeholder="Input" />,
        horizontal: true,
    },
};
