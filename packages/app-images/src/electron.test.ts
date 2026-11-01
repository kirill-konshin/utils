import { readFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { expect, test } from 'vite-plus/test';

import { ELECTRON_FILES, generateElectronImages } from './electron';
import { createSource, imageInfo, withOutDir } from './source.fixture';

const outDir = withOutDir();

test('generateElectronImages writes the macOS icons (.icns, Icon Composer bundle) and the other platform icons', async () => {
    const dmgBackground = await sharp({ create: { width: 1000, height: 600, channels: 3, background: '#ffffff' } })
        .png()
        .toBuffer();

    await generateElectronImages({ source: await createSource(), outDir: outDir.path, dmgBackground });

    const icns = await readFile(path.join(outDir.path, ELECTRON_FILES.macIcon));
    expect(icns.toString('latin1', 0, 4)).toBe('icns');
    expect(icns.readUInt32BE(4)).toBe(icns.length);

    const bundle = path.join(outDir.path, ELECTRON_FILES.macIconComposer);
    const iconJson = JSON.parse(await readFile(path.join(bundle, 'icon.json'), 'utf-8'));
    expect(await imageInfo(bundle, path.join('Assets', iconJson.groups[0].layers[0]['image-name']))).toEqual({
        width: 1024,
        height: 1024,
        hasAlpha: false,
    });

    expect((await readFile(path.join(outDir.path, ELECTRON_FILES.windowsIcon))).readUInt16LE(4)).toBe(7);
    expect(await imageInfo(outDir.path, ELECTRON_FILES.icon)).toMatchObject({ width: 512, height: 512 });
    expect(await imageInfo(outDir.path, ELECTRON_FILES.splash)).toMatchObject({ width: 512, height: 512 });
    expect(await imageInfo(outDir.path, ELECTRON_FILES.dmgBackground2x)).toMatchObject({ width: 1000, height: 600 });
    expect(await imageInfo(outDir.path, ELECTRON_FILES.dmgBackground)).toMatchObject({ width: 500, height: 300 });
});
