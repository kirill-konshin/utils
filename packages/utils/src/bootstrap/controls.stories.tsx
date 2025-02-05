import React, { cloneElement, useCallback, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react';
import { fn } from '@storybook/test';

import { Select, Control, Range, Checkbox } from './controls';

const defaultOptions = { num: 1, bool: false, select: 'bar' };

// More on how to set up stories at: https://storybook.js.org/docs/writing-stories#default-export
const meta = {
    title: 'Bootstrap / Controls',
    parameters: {
        layout: 'centered',
    },
    tags: ['autodocs'],
    argTypes: {},
    args: { options: { ...defaultOptions }, setOptions: fn(), defaultOptions: { ...defaultOptions }, name: 'unused' },
    render: function Demo(args) {
        const [options, setOptionsRaw] = useState(args.options);

        const setOptions = useCallback(
            (options) =>
                setOptionsRaw((currentOptions) => {
                    return { ...currentOptions, ...options };
                }),
            [],
        );

        const controlProps = { options, setOptions, defaultOptions };

        const { children, name, ...safeArgs } = args;

        return <div style={{ width: '300px' }}>{cloneElement(children as any, { ...safeArgs, ...controlProps })}</div>;
    },
} satisfies Meta<typeof Control>;

export default meta;

type Story = StoryObj<typeof meta>;

export const RangeControl: Story = {
    args: {
        children: <Range name="Num" min={0} max={1} />,
    },
};

export const CheckboxControl: Story = {
    args: {
        children: <Checkbox name="Bool" />,
    },
};

export const SelectControl: Story = {
    args: {
        children: (
            <Select name="Select">
                <option value="foo">Foo</option>
                <option value="bar">Bar</option>
            </Select>
        ),
    },
};
