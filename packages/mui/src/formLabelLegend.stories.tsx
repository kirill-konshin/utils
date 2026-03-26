import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { InputLabel, RadioGroup, Radio, FormControlLabel, Stack, Box } from '@mui/material';

import { FormLabelLegend } from './formLabelLegend';
import { FormControlFieldset } from './formControlFieldset';
import { GenericControl } from './genericControl';
import { ReadOnly } from './readOnly';

const meta: Meta<typeof FormLabelLegend> = {
    title: 'MUI / FormLabelLegend',
    component: FormLabelLegend,
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        disabled: { control: 'boolean' },
        error: { control: 'boolean' },
        required: { control: 'boolean' },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children: 'Form Label Legend',
    },
    render: (args) => (
        <FormControlFieldset>
            <FormLabelLegend {...args} />
            <ReadOnly>Content goes here</ReadOnly>
        </FormControlFieldset>
    ),
};

export const WithRadioGroup: Story = {
    render: () => (
        <FormControlFieldset>
            <FormLabelLegend>Select Option</FormLabelLegend>
            <ReadOnly>
                <RadioGroup row defaultValue="option1">
                    <FormControlLabel value="option1" label="Option 1" control={<Radio size="small" />} />
                    <FormControlLabel value="option2" label="Option 2" control={<Radio size="small" />} />
                    <FormControlLabel value="option3" label="Option 3" control={<Radio size="small" />} />
                </RadioGroup>
            </ReadOnly>
        </FormControlFieldset>
    ),
};

export const Required: Story = {
    args: {
        children: 'Required Field',
        required: true,
    },
    render: (args) => (
        <FormControlFieldset required>
            <FormLabelLegend {...args} />
            <ReadOnly>This field is required</ReadOnly>
        </FormControlFieldset>
    ),
};

export const WithError: Story = {
    args: {
        children: 'Error State',
        error: true,
    },
    render: (args) => (
        <FormControlFieldset error>
            <FormLabelLegend {...args} />
            <ReadOnly>This field has an error</ReadOnly>
        </FormControlFieldset>
    ),
};

export const Disabled: Story = {
    args: {
        children: 'Disabled Field',
        disabled: true,
    },
    render: (args) => (
        <FormControlFieldset disabled>
            <FormLabelLegend {...args} />
            <ReadOnly>This field is disabled</ReadOnly>
        </FormControlFieldset>
    ),
};

export const ComparisonWithInputLabel: Story = {
    parameters: {
        docs: {
            description: {
                story: 'FormLabelLegend renders as a `<legend>` element, which is semantically correct for fieldsets. InputLabel renders as a `<label>` element.',
            },
        },
    },
    render: () => (
        <Stack direction="row" spacing={3}>
            <FormControlFieldset>
                <FormLabelLegend>FormLabelLegend</FormLabelLegend>
                <ReadOnly>Uses legend element</ReadOnly>
            </FormControlFieldset>

            <GenericControl>
                <InputLabel shrink>InputLabel</InputLabel>
                <ReadOnly>Uses label element</ReadOnly>
            </GenericControl>
        </Stack>
    ),
};

export const MultipleFieldsets: Story = {
    render: () => (
        <Stack spacing={3}>
            <FormControlFieldset>
                <FormLabelLegend>Personal Information</FormLabelLegend>
                <ReadOnly>John Doe, john@example.com</ReadOnly>
            </FormControlFieldset>

            <FormControlFieldset>
                <FormLabelLegend>Preferences</FormLabelLegend>
                <ReadOnly>
                    <RadioGroup row defaultValue="email">
                        <FormControlLabel value="email" label="Email" control={<Radio size="small" />} />
                        <FormControlLabel value="sms" label="SMS" control={<Radio size="small" />} />
                        <FormControlLabel value="none" label="None" control={<Radio size="small" />} />
                    </RadioGroup>
                </ReadOnly>
            </FormControlFieldset>
        </Stack>
    ),
};
