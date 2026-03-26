import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { InputLabel, Stack, TextField, Box } from '@mui/material';

import { ReadOnly } from './readOnly';
import { GenericControl } from './genericControl';

const meta: Meta<typeof ReadOnly> = {
    title: 'MUI / ReadOnly',
    component: ReadOnly,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        disabled: { control: 'boolean' },
        fullWidth: { control: 'boolean' },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children: 'This is read-only content',
    },
};

export const WithLabel: Story = {
    render: () => (
        <GenericControl>
            <InputLabel shrink>Read Only Field</InputLabel>
            <ReadOnly>This content cannot be edited</ReadOnly>
        </GenericControl>
    ),
};

export const WithHTMLContent: Story = {
    render: () => (
        <GenericControl>
            <InputLabel shrink>HTML Content</InputLabel>
            <ReadOnly>
                This is a <code>div</code>, not an input with <code>readOnly</code> attribute
            </ReadOnly>
        </GenericControl>
    ),
};

export const MultipleFields: Story = {
    render: () => (
        <Stack spacing={2}>
            <GenericControl>
                <InputLabel shrink>Name</InputLabel>
                <ReadOnly>John Doe</ReadOnly>
            </GenericControl>

            <GenericControl>
                <InputLabel shrink>Email</InputLabel>
                <ReadOnly>john.doe@example.com</ReadOnly>
            </GenericControl>

            <GenericControl>
                <InputLabel shrink>Status</InputLabel>
                <ReadOnly>
                    <span style={{ color: 'green' }}>● Active</span>
                </ReadOnly>
            </GenericControl>
        </Stack>
    ),
};

export const ComparisonWithTextField: Story = {
    parameters: {
        docs: {
            description: {
                story: 'ReadOnly renders content as a div instead of an input, which is useful for displaying non-editable data that may contain HTML.',
            },
        },
    },
    render: () => (
        <Stack direction="row" spacing={3} alignItems="flex-start">
            <GenericControl>
                <InputLabel shrink>ReadOnly Component</InputLabel>
                <ReadOnly>
                    Content with <strong>HTML</strong>
                </ReadOnly>
            </GenericControl>

            <TextField
                label="TextField (readOnly)"
                defaultValue="Plain text only"
                variant="standard"
                slotProps={{ input: { readOnly: true } }}
            />
        </Stack>
    ),
};

export const FullWidth: Story = {
    args: {
        fullWidth: true,
        children: 'Full width read-only content',
    },
    decorators: [
        (Story) => (
            <Box sx={{ width: 400 }}>
                <GenericControl fullWidth>
                    <InputLabel shrink>Full Width</InputLabel>
                    <Story />
                </GenericControl>
            </Box>
        ),
    ],
};
