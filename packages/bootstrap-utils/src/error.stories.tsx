import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { ErrorAlert } from './error';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'ErrorAlert',
    component: ErrorAlert,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        // backgroundColor: { control: 'color' },
        children: { control: 'text' },
    },
    args: { onRetry: fn() },
} satisfies Meta<typeof ErrorAlert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const String: Story = {
    args: {
        children: 'An error occurred',
    },
};

export const ErrorObject: Story = {
    args: {
        children: new Error('An error occurred'),
    },
};
