import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { InputLabel, Input, TextField, Stack, Box } from '@mui/material';

import { GenericControl } from './genericControl';

const meta: Meta<typeof GenericControl> = {
    title: 'MUI / GenericControl',
    component: GenericControl,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        disabled: { control: 'boolean' },
        error: { control: 'boolean' },
        fullWidth: { control: 'boolean' },
        required: { control: 'boolean' },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children: (
            <>
                <InputLabel shrink>Label</InputLabel>
                <Input defaultValue="Some value" />
            </>
        ),
    },
};

export const WithCustomContent: Story = {
    args: {
        children: (
            <>
                <InputLabel shrink>Custom Content</InputLabel>
                <div style={{ padding: '4px 0' }}>This is custom content inside GenericControl</div>
            </>
        ),
    },
};

export const Disabled: Story = {
    args: {
        disabled: true,
        children: (
            <>
                <InputLabel shrink>Disabled Control</InputLabel>
                <Input defaultValue="Disabled value" />
            </>
        ),
    },
};

export const WithError: Story = {
    args: {
        error: true,
        children: (
            <>
                <InputLabel shrink>Error State</InputLabel>
                <Input defaultValue="Invalid value" />
            </>
        ),
    },
};

export const FullWidth: Story = {
    args: {
        fullWidth: true,
        children: (
            <>
                <InputLabel shrink>Full Width</InputLabel>
                <Input defaultValue="Full width input" />
            </>
        ),
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: 400 }}>
                <Story />
            </Box>
        ),
    ],
};

export const ComparisonWithTextField: Story = {
    parameters: {
        docs: {
            description: {
                story: 'GenericControl removes the underline from inputs, making it suitable for read-only or custom content displays.',
            },
        },
    },
    render: () => (
        <Stack direction="row" spacing={3}>
            <GenericControl>
                <InputLabel shrink>GenericControl</InputLabel>
                <Input defaultValue="No underline" />
            </GenericControl>

            <TextField label="TextField" defaultValue="With underline" variant="standard" />
        </Stack>
    ),
};
