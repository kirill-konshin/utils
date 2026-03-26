import type { Meta, StoryFn } from '@storybook/react';
import { ResponsiveHelperTW } from './responsiveHelper';
import '../tailwind.css';

const meta: Meta = {
    title: 'Components/ResponsiveHelperTW',
    component: ResponsiveHelperTW,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;

export const Default: StoryFn = () => (
    <div className="min-h-screen bg-gray-50 p-8">
        <h1 className="text-2xl font-bold mb-4">Responsive Helper Demo</h1>
        <p className="text-gray-600">
            Resize the browser window to see the breakpoint indicator in the bottom-right corner.
        </p>
        <ResponsiveHelperTW />
    </div>
);
