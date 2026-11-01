import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, test } from 'vite-plus/test';

import { getManifestIconFile, MANIFEST_ICON_SIZES, WEB_FILES } from './next/files';
import { getSplashFile, SPLASH_SCREENS } from './next/splashScreens';
import { createSource, imageInfo, withOutDir } from './source.fixture';
import { generateWebImages } from './web';

describe('generateWebImages', () => {
    const outDir = withOutDir();

    test('writes favicons, opaque home screen and manifest icons', async () => {
        await generateWebImages({ source: await createSource(), outDir: outDir.path });

        expect(await imageInfo(outDir.path, WEB_FILES.favicon16)).toMatchObject({ width: 16, height: 16 });
        expect(await imageInfo(outDir.path, WEB_FILES.favicon32)).toMatchObject({ width: 32, height: 32 });
        expect(await imageInfo(outDir.path, WEB_FILES.appleTouchIcon)).toEqual({
            width: 180,
            height: 180,
            hasAlpha: false,
        });
        for (const size of MANIFEST_ICON_SIZES) {
            expect(await imageInfo(outDir.path, getManifestIconFile(size))).toEqual({
                width: size,
                height: size,
                hasAlpha: false,
            });
        }

        expect((await readFile(path.join(outDir.path, WEB_FILES.faviconIco))).readUInt16LE(4)).toBe(3);
        expect(await readdir(outDir.path)).not.toContain('splash');
    });

    test('writes an opaque launch screen per iPhone size', async () => {
        await generateWebImages({
            source: await createSource(),
            outDir: outDir.path,
            splash: { background: '#f5f5f5' },
        });

        for (const screen of SPLASH_SCREENS) {
            expect(await imageInfo(outDir.path, getSplashFile(screen))).toEqual({
                width: screen.width * screen.ratio,
                height: screen.height * screen.ratio,
                hasAlpha: false,
            });
        }
    });
});
