import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { AdaptiveContainer } from './adaptiveContainer';

const meta: Meta<typeof AdaptiveContainer> = {
    title: 'Bootstrap / AdaptiveContainer',
    component: AdaptiveContainer,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    argTypes: {
        children: { control: 'text' },
        className: { control: 'text' },
    },
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    args: {
        children:
            'This container adapts to the viewport size. On mobile it becomes fluid, on desktop it has max-width.',
    },
};

export const WithClassName: Story = {
    args: {
        children: 'Container with custom class',
        className: 'bg-light p-3',
    },
};

export const WithContent: Story = {
    render: () => (
        <AdaptiveContainer className="py-4">
            <h1>Adaptive Container Demo</h1>
            <p>
                Resize the viewport to see how this container behaves. On mobile viewports (xs, sm, md), it becomes
                fluid and takes full width. On desktop viewports (lg, xl, xxl), it has a max-width constraint.
            </p>
            <div className="row">
                <div className="col-md-6">
                    <div className="card">
                        <div className="card-body">Column 1</div>
                    </div>
                </div>
                <div className="col-md-6">
                    <div className="card">
                        <div className="card-body">Column 2</div>
                    </div>
                </div>
            </div>
        </AdaptiveContainer>
    ),
};
