/*
 * Naming conventions shared by the ESLint blocks and the Vite+ config. Free of plugin imports, like `exts.ts`, so the
 * `./vite-plus` entry loads no ESLint plugin.
 */
import { tsExts } from './exts.js';

/**
 * Files that legitimately default-export (framework/tooling conventions): configs, stories, Storybook, Next.js App
 * Router files and declarations.
 */
export const defaultExportFiles: string[] = [
    '**/*.config.*',
    `**/*.stories.${tsExts}`,
    `**/.storybook/main.${tsExts}`,
    `**/.storybook/preview.${tsExts}`,
    '**/.lintstagedrc*',
    '**/.prettierrc*',
    '**/electron-builder.*',
    `**/App.${tsExts}`,
    `**/index.${tsExts}`,
    `**/main.${tsExts}`,
    '**/*.d.ts',
    `**/default.${tsExts}`,
    `**/error.${tsExts}`,
    `**/forbidden.${tsExts}`,
    `**/global-error.${tsExts}`,
    `**/layout.${tsExts}`,
    `**/loading.${tsExts}`,
    `**/not-found.${tsExts}`,
    `**/page.${tsExts}`,
    `**/template.${tsExts}`,
    `**/unauthorized.${tsExts}`,
    `**/apple-icon.${tsExts}`,
    `**/icon.${tsExts}`,
    `**/manifest.${tsExts}`,
    `**/opengraph-image.${tsExts}`,
    `**/robots.${tsExts}`,
    `**/sitemap.${tsExts}`,
    `**/twitter-image.${tsExts}`,
];

/**
 * File names exempt from camelCase: Next.js App Router mandates these exact hyphenated names, React Native / Expo its
 * `App` entry, declarations follow the package they describe, and electron-builder looks up its own config name.
 */
export const filenameCaseIgnore: RegExp[] = [
    /^App\.[jt]sx?$/,
    /^not-found\.[jt]sx?$/,
    /^global-error\.[jt]sx?$/,
    /^opengraph-image\.[jt]sx?$/,
    /^twitter-image\.[jt]sx?$/,
    /^apple-icon\.[jt]sx?$/,
    /^mdx-components\.[jt]sx?$/,
    /\.d\.tsx?$/,
    /^electron-builder\..+$/,
];
