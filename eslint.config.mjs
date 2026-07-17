import { defineConfig } from 'eslint/config';
import customConfig, { includeIgnoreFile } from '@kirill.konshin/eslint-config-next-custom';
import nx from '@nx/eslint-plugin';

export default defineConfig([
    ...customConfig,
    {
        name: 'Nx module boundaries',
        files: ['packages/*/src/**/*.{ts,tsx,js,jsx,mjs,mts}'],
        plugins: { '@nx': nx },
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
        name: 'Custom rules',
        rules: {},
    },
    includeIgnoreFile(import.meta.url, '.gitignore'),
    includeIgnoreFile(import.meta.url, '.prettierignore'),
]);
