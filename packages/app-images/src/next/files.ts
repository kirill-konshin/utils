/**
 * File names shared by the generator and the metadata helpers, so a rename can't leave a page pointing at an image
 * that no longer exists.
 */
export const WEB_FILES = {
    favicon16: 'favicon-16.png',
    favicon32: 'favicon-32.png',
    faviconIco: 'favicon.ico',
    appleTouchIcon: 'apple-touch-icon.png',
} as const;

/** Full-bleed, opaque. Every size goes to the manifest as `any`; the large ones also as `maskable`. */
export const MANIFEST_ICON_SIZES: readonly number[] = [192, 512, 1024];

/** Chrome on macOS cuts maskable icons into the squircle and prefers the largest one. */
export const MASKABLE_ICON_SIZES: readonly number[] = [512, 1024];

export const APPLE_TOUCH_ICON_SIZE = 180;

export const getManifestIconFile = (size: number): string => `icon-${size}.png`;

export type UrlOptions = {
    /** Public URL the files are served from, default `/`. */
    basePath?: string;
    /** Appended as `?v=`: bump it after changing the icon, home screens and browsers cache icons hard. */
    version?: string | number;
};

export const getUrl = (file: string, { basePath = '/', version }: UrlOptions = {}): string =>
    `${basePath.endsWith('/') ? basePath : `${basePath}/`}${file}${version == null ? '' : `?v=${version}`}`;
