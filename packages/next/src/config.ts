import type { NextConfig } from 'next';

/**
 * Barrel-file packages Next.js must rewrite to per-module imports. Exhaustive on purpose:
 * entries for packages a project does not use are ignored, while missing entries cost dev-server
 * startup time and bundle size. Next.js merges this with its own built-in default list.
 */
export const OPTIMIZE_PACKAGE_IMPORTS: string[] = [
    '@fortawesome/free-brands-svg-icons',
    '@fortawesome/free-regular-svg-icons',
    '@fortawesome/free-solid-svg-icons',
    '@fortawesome/react-fontawesome',
    '@gravity-ui/icons',
    '@gravity-ui/uikit',
    '@heroui/react',
    '@kirill.konshin/icons',
    '@mui/icons-material',
    '@mui/lab',
    '@mui/material',
    '@mui/system',
    '@mui/x-data-grid',
    '@toolpad/core',
    'date-fns',
    'lodash',
    'lodash-es',
    'react-bootstrap',
    'react-use',
    'rxjs',
];

// Fresh copy per call so the defineNextConfig callback can safely mutate what it receives
const createDefaults = (): NextConfig => ({
    reactStrictMode: false,
    cacheComponents: true,
    typedRoutes: true,
    experimental: {
        typedEnv: true,
        optimizePackageImports: [...OPTIMIZE_PACKAGE_IMPORTS],
    },
});

/**
 * Base Next.js config with recommended defaults: `cacheComponents`, `typedRoutes`,
 * `experimental.typedEnv`, `reactStrictMode: false` and the exhaustive `optimizePackageImports`
 * list above. The callback receives the defaults and returns the final config — merge explicitly:
 *
 * ```ts
 * export default defineNextConfig((defaults) => ({ ...defaults, transpilePackages: ['my-lib'] }));
 * ```
 */
export function defineNextConfig(config?: (defaults: NextConfig) => NextConfig): NextConfig {
    const defaults = createDefaults();
    return config?.(defaults) ?? defaults;
}
