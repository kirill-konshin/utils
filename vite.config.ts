import { tsExts, vitePlusConfig } from '@kirill.konshin/lint/vite-plus';
import { defineConfig } from 'vite-plus';

export default defineConfig(
    vitePlusConfig({
        lint: {
            // unbuilt drafts, kept as commented-out code
            ignorePatterns: ['packages/react-native/src-todo'],
            overrides: [
                {
                    // public module path; Oxlint applies no inline disable to file names
                    files: ['packages/next/src/noSSR.tsx'],
                    rules: { 'unicorn/filename-case': 'off' },
                },
                {
                    files: [`packages/*/src/**/*.${tsExts}`],
                    rules: {
                        '@nx/enforce-module-boundaries': [
                            'error',
                            {
                                // Tags are defined in each package's package.json "nx" key.
                                // A platform may only import from platforms listed here — prevents e.g.
                                // worker code leaking into UI bundles.
                                depConstraints: [
                                    {
                                        sourceTag: 'platform:universal',
                                        onlyDependOnLibsWithTags: ['platform:universal'],
                                    },
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
                                        onlyDependOnLibsWithTags: [
                                            'platform:universal',
                                            'platform:browser',
                                            'platform:react',
                                        ],
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
                                        onlyDependOnLibsWithTags: [
                                            'platform:universal',
                                            'platform:react',
                                            'platform:react-native',
                                        ],
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
            ],
        },
        test: {
            projects: ['packages/*'],
            // local full-speed run over every package (`vp test`, IDE "All Tests"): one worker pool, all of the cores, no
            // cache; `yarn test` / `yarn test:affected` run per package through Nx with its cache
            maxWorkers: '100%',
            coverage: {
                reporter: ['text', 'html', 'cobertura'],
                include: ['packages/*/src/**/*.{ts,tsx,js,jsx}'],
            },
        },
    }),
);
