import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { Toaster } from './toaster';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'Toaster',
    component: Toaster,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {},
    args: { onClick: fn() },
} satisfies Meta<typeof Toaster>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        toast: 'Hello, World!',
    },
};

export const Object: Story = {
    args: {
        toast: { message: 'Toast', variant: 'dark' },
    },
};
