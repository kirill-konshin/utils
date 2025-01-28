import type { Meta, StoryObj } from '@storybook/react';

import { GlobalLoading } from './globalLoading';

const meta = {
    title: 'GlobalLoading',
    component: GlobalLoading,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        loading: { control: 'check' },
    },
} satisfies Meta<typeof GlobalLoading>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        loading: true,
    },
};
