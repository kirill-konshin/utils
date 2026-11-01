import type { Metadata, MetadataRoute } from 'next';
import { describe, expect, expectTypeOf, test } from 'vite-plus/test';

import { getIconsMetadata, getManifestIcons, getStartupImages } from './metadata';
import { SPLASH_SCREENS } from './splashScreens';

describe('metadata helpers', () => {
    test('are assignable to Next.js metadata and manifest', () => {
        expectTypeOf(getIconsMetadata()).toExtend<NonNullable<Metadata['icons']>>();
        expectTypeOf(getStartupImages()).toExtend<
            NonNullable<Exclude<NonNullable<Metadata['appleWebApp']>, boolean>['startupImage']>
        >();
        expectTypeOf(getManifestIcons()).toExtend<NonNullable<MetadataRoute.Manifest['icons']>>();
    });

    test('build URLs from the base path and version', () => {
        expect(getIconsMetadata({ basePath: '/static', version: 4 })).toEqual({
            icon: [
                { url: '/static/favicon-16.png?v=4', sizes: '16x16', type: 'image/png' },
                { url: '/static/favicon-32.png?v=4', sizes: '32x32', type: 'image/png' },
            ],
            shortcut: '/static/favicon.ico?v=4',
            apple: [{ url: '/static/apple-touch-icon.png?v=4', sizes: '180x180', type: 'image/png' }],
        });
    });

    test('list a launch screen per iPhone size', () => {
        const images = getStartupImages();
        expect(images).toHaveLength(SPLASH_SCREENS.length);
        expect(images[0]).toEqual({
            url: '/splash/iphone-1320x2868.png',
            media: '(device-width: 440px) and (device-height: 956px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)',
        });
    });

    test('list each manifest icon as any and the large ones as maskable', () => {
        expect(getManifestIcons().map(({ src, purpose }) => `${purpose} ${src}`)).toEqual([
            'any /icon-192.png',
            'any /icon-512.png',
            'any /icon-1024.png',
            'maskable /icon-512.png',
            'maskable /icon-1024.png',
        ]);
    });
});
