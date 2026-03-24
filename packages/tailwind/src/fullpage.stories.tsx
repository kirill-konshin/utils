import type { Meta, StoryObj } from '@storybook/react';
import { useRef } from 'react';
import { Fullpage } from './fullpage';

const meta: Meta<typeof Fullpage> = {
    title: 'Components/Fullpage',
    component: Fullpage,
    parameters: {
        layout: 'fullscreen',
    },
};

export default meta;
type Story = StoryObj<typeof Fullpage>;

const FullpageWrapper = (args: any) => {
    const ref = useRef<HTMLDivElement>(null);
    return (
        <Fullpage ref={ref} {...args}>
            <h1 className="text-4xl font-bold text-blue-600">Hello Tailwind!</h1>
            <p className="mt-4 text-gray-600">This is a fullpage component with Tailwind CSS styling.</p>
        </Fullpage>
    );
};

export const Default: Story = {
    render: (args) => <FullpageWrapper {...args} />,
};

export const WithCustomClass: Story = {
    render: (args) => <FullpageWrapper {...args} />,
    args: {
        className: 'bg-gray-100',
    },
};
