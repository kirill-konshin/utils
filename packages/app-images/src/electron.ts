import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

import { ICNS_TYPES, toIcns } from './icns';
import { toIco } from './ico';
import { type ImageSource, loadImage, square } from './source';

export type ElectronImagesOptions = {
    source: ImageSource;
    /** electron-builder `directories.buildResources`, usually `assets`. */
    outDir: string;
    /** Fills transparent pixels of the macOS icons, which must be opaque. Default white. */
    background?: string;
    /** DMG window background at 2x, written as is and at half size. */
    dmgBackground?: ImageSource;
};

export const ELECTRON_FILES = {
    /**
     * `mac.icon` by default: full bleed and opaque, so macOS 26 cuts it into the squircle itself (a shaped icon goes
     * into a grey tile); needs no Xcode.
     */
    macIcon: 'icon.icns',
    /** Icon Composer bundle, opt-in `mac.icon`: electron-builder compiles it with Xcode 26 `actool`. */
    macIconComposer: 'icon.icon',
    windowsIcon: 'icon.ico',
    /** Linux, and the window icon. */
    icon: 'icon.png',
    splash: 'splash.webp',
    dmgBackground: 'background.png',
    dmgBackground2x: 'background@2x.png',
} as const;

const MAC_ICON_LAYER = 'icon.png';

/**
 * One flat, full-bleed layer without Liquid Glass effects: macOS 26 cuts it into the squircle and gives it the system
 * shadow. Format of the Icon Composer `icon.json`.
 */
const MAC_ICON_JSON = {
    groups: [
        {
            layers: [{ glass: false, 'image-name': MAC_ICON_LAYER, name: 'icon' }],
            shadow: { kind: 'neutral', opacity: 0.5 },
            specular: false,
            translucency: { enabled: false, value: 0.5 },
        },
    ],
    'supported-platforms': { squares: 'shared' },
};

async function generateIconComposerBundle(image: Buffer, outDir: string, background: string): Promise<void> {
    const bundle = path.join(outDir, ELECTRON_FILES.macIconComposer);
    await rm(bundle, { force: true, recursive: true });
    await mkdir(path.join(bundle, 'Assets'), { recursive: true });
    await writeFile(path.join(bundle, 'icon.json'), JSON.stringify(MAC_ICON_JSON, null, 2) + '\n');
    await square(image, 1024)
        .flatten({ background })
        .png({ compressionLevel: 9 })
        .toFile(path.join(bundle, 'Assets', MAC_ICON_LAYER));
}

/** macOS icons (`.icns`, Icon Composer `.icon`), Windows and Linux icons, the splash and the DMG background. */
export async function generateElectronImages({
    source,
    outDir,
    background = '#ffffff',
    dmgBackground,
}: ElectronImagesOptions): Promise<void> {
    const image = await loadImage(source);

    await mkdir(outDir, { recursive: true });

    await writeFile(
        path.join(outDir, ELECTRON_FILES.macIcon),
        toIcns(
            await Promise.all(
                ICNS_TYPES.map(async ({ type, size }) => ({
                    type,
                    png: await square(image, size).flatten({ background }).png().toBuffer(),
                })),
            ),
        ),
    );
    await generateIconComposerBundle(image, outDir, background);
    await writeFile(
        path.join(outDir, ELECTRON_FILES.windowsIcon),
        toIco(
            await Promise.all(
                [16, 24, 32, 48, 64, 128, 256].map(async (size) => ({
                    size,
                    png: await square(image, size).png().toBuffer(),
                })),
            ),
        ),
    );
    await square(image, 512).png({ compressionLevel: 9 }).toFile(path.join(outDir, ELECTRON_FILES.icon));
    await square(image, 512).webp().toFile(path.join(outDir, ELECTRON_FILES.splash));

    if (dmgBackground) {
        const dmg = await loadImage(dmgBackground);
        const { width } = await sharp(dmg).metadata();
        await sharp(dmg).png().toFile(path.join(outDir, ELECTRON_FILES.dmgBackground2x));
        await sharp(dmg)
            .resize(Math.round(width / 2))
            .png()
            .toFile(path.join(outDir, ELECTRON_FILES.dmgBackground));
    }

    console.log('[APP-IMAGES] generateElectronImages wrote', { outDir, dmgBackground: !!dmgBackground });
}
