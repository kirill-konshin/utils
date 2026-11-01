import {
    APPLE_TOUCH_ICON_SIZE,
    getManifestIconFile,
    getUrl,
    MANIFEST_ICON_SIZES,
    MASKABLE_ICON_SIZES,
    type UrlOptions,
    WEB_FILES,
} from './files';
import { getSplashFile, getSplashMedia, SPLASH_SCREENS, type SplashScreen } from './splashScreens';

/*
 * Shapes match Next.js `Metadata` and `MetadataRoute.Manifest` structurally, so this module needs no `next` at runtime
 * or in its types; `metadata.test.ts` checks they stay assignable.
 */

export type IconDescriptor = { url: string; sizes: string; type: string };

export type IconsMetadata = { icon: IconDescriptor[]; shortcut: string; apple: IconDescriptor[] };

export type StartupImage = { url: string; media: string };

export type ManifestIcon = { src: string; sizes: string; type: string; purpose: 'any' | 'maskable' };

const png = (url: string, size: number): IconDescriptor => ({ url, sizes: `${size}x${size}`, type: 'image/png' });

/** `metadata.icons`: favicons and the home screen icon. */
export const getIconsMetadata = (options?: UrlOptions): IconsMetadata => ({
    icon: [png(getUrl(WEB_FILES.favicon16, options), 16), png(getUrl(WEB_FILES.favicon32, options), 32)],
    shortcut: getUrl(WEB_FILES.faviconIco, options),
    apple: [png(getUrl(WEB_FILES.appleTouchIcon, options), APPLE_TOUCH_ICON_SIZE)],
});

/** `metadata.appleWebApp.startupImage`: one launch screen per iPhone size. */
export const getStartupImages = (options?: UrlOptions & { screens?: readonly SplashScreen[] }): StartupImage[] =>
    (options?.screens ?? SPLASH_SCREENS).map((screen) => ({
        url: getUrl(getSplashFile(screen), options),
        media: getSplashMedia(screen),
    }));

/** `manifest().icons`: the same full-bleed art as `any` and, cut by the platform, as `maskable`. */
export const getManifestIcons = (options?: UrlOptions): ManifestIcon[] => {
    const icon = (size: number, purpose: ManifestIcon['purpose']): ManifestIcon => ({
        src: getUrl(getManifestIconFile(size), options),
        sizes: `${size}x${size}`,
        type: 'image/png',
        purpose,
    });
    return [
        ...MANIFEST_ICON_SIZES.map((size) => icon(size, 'any')),
        ...MASKABLE_ICON_SIZES.map((size) => icon(size, 'maskable')),
    ];
};
