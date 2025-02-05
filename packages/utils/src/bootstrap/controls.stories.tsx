import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { Select, Control, Range, Checkbox } from './controls';

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'Bootstrap / Controls',
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {},
    args: { options: { foo: 1, bar: 0 }, setOptions: fn(), defaultOptions: { foo: 1, bar: 0 } },
    render: function Demo(args) {
        return <>{args.children}</>;
    },
} satisfies Meta<typeof Control>;

export default meta;

type Story = StoryObj<typeof meta>;

// export const Vertical: Story = {
//     args: {
//         children: <Control label="Label" />,
//     },
// };

// export const Horizontal: Story = {
//     args: {
//         label: 'Label',
//         children: <FormControl placeholder="Input" />,
//         horizontal: true,
//     },
// };
