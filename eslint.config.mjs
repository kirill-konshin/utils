import { defineConfig } from 'eslint/config';
import customConfig, { includeIgnoreFile, nxPlugin } from '@kirill.konshin/eslint-config-next-custom';

export default defineConfig([
    ...customConfig,
    {
        name: 'Nx module boundaries',
        files: ['packages/*/src/**/*.{ts,tsx,js,jsx,mjs,mts}'],
        plugins: { '@nx': nxPlugin },
        rules: {
            '@nx/enforce-module-boundaries': [
                'error',
                {
                    // Tags are defined in each package's package.json "nx" key.
                    // A platform may only import from platforms listed here — prevents e.g.
                    // worker code leaking into UI bundles.
                    depConstraints: [
                        { sourceTag: 'platform:universal', onlyDependOnLibsWithTags: ['platform:universal'] },
                        {
                            sourceTag: 'platform:node',
                            onlyDependOnLibsWithTags: ['platform:universal', 'platform:node'],
                        },
                        {
                            sourceTag: 'platform:browser',
                            onlyDependOnLibsWithTags: ['platform:universal', 'platform:browser'],
                        },
                        {
                            sourceTag: 'platform:worker',
                            onlyDependOnLibsWithTags: ['platform:universal', 'platform:worker'],
                        },
                        {
                            sourceTag: 'platform:react',
                            onlyDependOnLibsWithTags: ['platform:universal', 'platform:browser', 'platform:react'],
                        },
                        {
                            sourceTag: 'platform:next',
                            onlyDependOnLibsWithTags: [
                                'platform:universal',
                                'platform:browser',
                                'platform:react',
                                'platform:next',
                                'platform:node',
                            ],
                        },
                        {
                            sourceTag: 'platform:react-native',
                            onlyDependOnLibsWithTags: ['platform:universal', 'platform:react', 'platform:react-native'],
                        },
                        {
                            sourceTag: 'platform:electron',
                            onlyDependOnLibsWithTags: [
                                'platform:universal',
                                'platform:node',
                                'platform:browser',
                                'platform:electron',
                            ],
                        },
                        { sourceTag: 'platform:tooling', onlyDependOnLibsWithTags: ['*'] },
                        { sourceTag: 'platform:umbrella', onlyDependOnLibsWithTags: ['*'] },
                        { sourceTag: 'type:demo', onlyDependOnLibsWithTags: ['*'] },
                    ],
                },
            ],
        },
    },
    {
        // @kirill.konshin/utils-private is private and never published — real versions of the
        // published packages cannot resolve it from the registry, so @nx/dependency-checks must
        // never add it to (or demand it in) any package's dependencies/peerDependencies.
        // bootstrap/bootstrap-icons/tailwindcss are consumed only via CSS/SCSS @import, which the
        // JS project graph cannot see, so the rule would otherwise strip these real peer deps.
        name: '@nx/dependency-checks overrides',
        files: ['**/package.json'],
        rules: {
            '@nx/dependency-checks': [
                'error',
                {
                    ignoredDependencies: [
                        '@kirill.konshin/utils-private',
                        '@storybook/react-vite',
                        '@storybook/test',
                        'builder-util-runtime',
                        'electron',
                        'electron-builder',
                        'bootstrap',
                        'bootstrap-icons',
                        'next',
                        'tailwindcss',
                    ],
                },
            ],
        },
    },
    {
        // Demos depend on packages through CLIs and config plugins (expo, eas, serve), not only
        // imports — invisible to the project graph, so the rule mis-reports and mis-fixes there.
        // Private utils use lifting
        name: '@nx/dependency-checks demo overrides',
        files: ['demo/*/package.json', 'packages/utils-private/package.json'],
        rules: {
            '@nx/dependency-checks': 'off',
        },
    },
    includeIgnoreFile(import.meta.url, '.gitignore'),
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
