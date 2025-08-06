import { join, dirname } from 'node:path';
import type { StorybookConfig } from '@storybook/react-vite';

const getAbsolutePath = (value: string) => dirname(require.resolve(join(value, 'package.json')));

//TODO https://github.com/tuchk4/storybook-readme
const config: StorybookConfig = {
    stories: [join(process.cwd(), '/src/**/*.stories.@(js|jsx|mjs|ts|tsx)'), join(process.cwd(), '/src/**/*.mdx')],
    addons: [
        getAbsolutePath('@storybook/addon-onboarding'),
        getAbsolutePath('@storybook/addon-essentials'),
        getAbsolutePath('@chromatic-com/storybook'),
        // getAbsolutePath('@storybook/addon-interactions'),
    ],
    framework: {
        name: getAbsolutePath('@storybook/react-vite'),
        options: {},
    },
};

export default config;
