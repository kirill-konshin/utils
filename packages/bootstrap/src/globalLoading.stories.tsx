import type { Meta, StoryObj } from '@storybook/react';

import { GlobalLoading } from './globalLoading';

const meta: Meta<typeof GlobalLoading> = {
    title: 'Bootstrap / GlobalLoading',
    component: GlobalLoading,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        loading: { control: 'check' },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        loading: true,
    },
};
