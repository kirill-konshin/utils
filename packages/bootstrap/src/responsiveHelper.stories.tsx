import React from 'react';
import type { Meta, StoryObj } from '@storybook/react';

import { ResponsiveHelperBS, useBreakpoint } from './responsiveHelper';

const meta: Meta<typeof ResponsiveHelperBS> = {
    title: 'Bootstrap / ResponsiveHelperBS',
    component: ResponsiveHelperBS,
    parameters: {
        layout: 'fullscreen',
    },
    tags: ['autodocs'],
    argTypes: {},
};

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
    parameters: {
        docs: {
            description: {
                story: 'A small indicator in the bottom-right corner showing the current Bootstrap breakpoint. Resize the viewport to see it change.',
            },
        },
    },
    render: () => (
        <div style={{ minHeight: '200px', position: 'relative' }}>
            <div className="p-4">
                <h4>Responsive Helper</h4>
                <p>Look at the bottom-right corner to see the current breakpoint indicator.</p>
                <p>Resize the viewport to see it change between XS, SM, MD, LG, XL, and XXL.</p>
            </div>
            <ResponsiveHelperBS />
        </div>
    ),
};

// Demo component for useBreakpoint hook
function UseBreakpointDemo() {
    const { breakpoint, isMobile, isDesktop } = useBreakpoint();

    return (
        <div className="p-4">
            <h4>useBreakpoint Hook Demo</h4>
            <table className="table">
                <tbody>
                    <tr>
                        <th>Current Breakpoint</th>
                        <td>
                            <code>{breakpoint}</code>
                        </td>
                    </tr>
                    <tr>
                        <th>isMobile</th>
                        <td>
                            <code>{isMobile ? 'true' : 'false'}</code>
                        </td>
                    </tr>
                    <tr>
                        <th>isDesktop</th>
                        <td>
                            <code>{isDesktop ? 'true' : 'false'}</code>
                        </td>
                    </tr>
                </tbody>
            </table>
            <div className="alert alert-info">
                <strong>Breakpoint ranges:</strong>
                <ul className="mb-0 mt-2">
                    <li>
                        <strong>Mobile:</strong> xs (&lt;576px), sm (≥576px), md (≥768px)
                    </li>
                    <li>
                        <strong>Desktop:</strong> lg (≥992px), xl (≥1200px), xxl (≥1400px)
                    </li>
                </ul>
            </div>
        </div>
    );
}

export const UseBreakpointHook: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Demonstrates the `useBreakpoint` hook which provides the current breakpoint and mobile/desktop flags.',
            },
        },
    },
    render: () => <UseBreakpointDemo />,
};

export const CombinedDemo: Story = {
    parameters: {
        docs: {
            description: {
                story: 'Shows both the visual indicator and the hook values together.',
            },
        },
    },
    render: () => (
        <div style={{ minHeight: '300px', position: 'relative' }}>
            <UseBreakpointDemo />
            <ResponsiveHelperBS />
        </div>
    ),
};
