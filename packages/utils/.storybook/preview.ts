import type { Preview } from '@storybook/react';

import 'bootstrap-icons/font/bootstrap-icons.css';
import '../src/bootstrap/main.scss';

const preview: Preview = {
    parameters: {
        controls: {
            matchers: {
                color: /(background|color)$/i,
                date: /Date$/i,
            },
        },
    },
};

export default preview;
