import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { TextField, Stack, InputLabel, RadioGroup, Radio, FormControlLabel, Box } from '@mui/material';

import { GenericControl } from './genericControl';
import { ReadOnly } from './readOnly';
import { FormControlFieldset } from './formControlFieldset';
import { FormLabelLegend } from './formLabelLegend';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'FormControlFieldset',
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {},
    render: function Render() {
        return (
            <Box sx={{ position: 'relative' }}>
                <Rule top={12} />
                <Rule top={37} />
                <Rule top={48} />
                <Stack direction="row" gap={3} sx={{ alignItems: 'flex-start' }}>
                    <FormControlFieldset>
                        <FormLabelLegend>Radios</FormLabelLegend>
                        <ReadOnly>
                            {/* TODO The size of the component. small is equivalent to the dense radio styling. */}
                            <RadioGroup row defaultValue="female" name="radio-buttons-group" sx={{ mt: -1 }}>
                                <FormControlLabel value="female" label="Female" control={<Radio size="small" />} />
                                <FormControlLabel value="male" label="Male" control={<Radio size="small" />} />
                                <FormControlLabel value="other" label="Other" control={<Radio size="small" />} />
                            </RadioGroup>
                        </ReadOnly>
                    </FormControlFieldset>

                    <GenericControl>
                        <InputLabel shrink>GenericControl</InputLabel>
                        <ReadOnly>
                            This is a <code>div</code>, not an input with <code>readOnly</code>
                        </ReadOnly>
                    </GenericControl>

                    <FormControlFieldset>
                        <FormLabelLegend>FormLabelLegend</FormLabelLegend>
                        <ReadOnly>
                            This is a <code>div</code>, not an input with <code>readOnly</code>
                        </ReadOnly>
                    </FormControlFieldset>

                    <TextField label="TextField" defaultValue="Bar" variant="standard" />
                </Stack>
            </Box>
        );
    },
} satisfies Meta<typeof GenericControl>;

export default meta;

type Story = StoryObj<typeof meta>;

function Rule({ top }) {
    return (
        <Box sx={{ background: 'red', position: 'absolute', left: 0, top: `${top}px`, width: '100%', height: '1px' }} />
    );
}

export const Default: Story = {
    args: {},
};
