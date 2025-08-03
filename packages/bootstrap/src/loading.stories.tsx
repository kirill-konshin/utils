import type { Meta, StoryObj } from '@storybook/react';

import { Loading } from './loading';

const meta: Meta<typeof Loading> = {
    title: 'Bootstrap / Loading',
    component: Loading,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        show: { control: 'check' },
        size: { control: 'select', options: ['sm', 'md'] },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Children: Story = {
    args: {
        children: 'Custom Loading...',
    },
};

export const Size: Story = {
    args: {
        size: 'sm',
    },
};
