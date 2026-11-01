import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';

import { toIco } from './ico';
import { APPLE_TOUCH_ICON_SIZE, getManifestIconFile, MANIFEST_ICON_SIZES, WEB_FILES } from './next/files';
import { getSplashFile, SPLASH_SCREENS, type SplashScreen } from './next/splashScreens';
import { type ImageSource, loadImage, square } from './source';

export type SplashOptions = {
    /** The app's own background, so the launch screen gives way to the first page without a flash. */
    background: string;
    screens?: readonly SplashScreen[];
    /** The icon's share of the screen width, default 0.3. */
    iconShare?: number;
    /** Corner radius as a share of the icon's size, default 0.225, close to the home screen's rounding. */
    cornerShare?: number;
};

export type WebImagesOptions = {
    source: ImageSource;
    /** Usually `public`. */
    outDir: string;
    /** Fills transparent pixels of the home screen and manifest icons, which must be opaque. Default white. */
    background?: string;
    /** iOS launch screens; skipped when omitted. */
    splash?: SplashOptions;
};

const favicon = (image: Buffer, size: number): Sharp => square(image, size).sharpen({ sigma: 0.5 });

async function generateSplashScreens(
    image: Buffer,
    outDir: string,
    iconBackground: string,
    { background, screens = SPLASH_SCREENS, iconShare = 0.3, cornerShare = 0.225 }: SplashOptions,
): Promise<void> {
    await Promise.all(
        screens.map(async (screen) => {
            const file = path.join(outDir, getSplashFile(screen));
            const width = screen.width * screen.ratio;
            const height = screen.height * screen.ratio;
            const size = Math.round(width * iconShare);
            const radius = Math.round(size * cornerShare);
            const mask = Buffer.from(
                `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" ry="${radius}"/></svg>`,
            );
            await mkdir(path.dirname(file), { recursive: true });
            const icon = await square(image, size)
                .flatten({ background: iconBackground })
                .ensureAlpha()
                .composite([{ input: mask, blend: 'dest-in' }])
                .png()
                .toBuffer();
            const screenImage = await sharp({ create: { background, channels: 3, height, width } })
                .composite([
                    { input: icon, left: Math.round((width - size) / 2), top: Math.round((height - size) / 2) },
                ])
                .png()
                .toBuffer();
            // Compositing the rounded icon adds an alpha channel, launch screens must be opaque
            await sharp(screenImage).removeAlpha().png({ compressionLevel: 9 }).toFile(file);
        }),
    );
}

/** Favicons, the home screen icon, manifest icons and, optionally, iOS launch screens. */
export async function generateWebImages({
    source,
    outDir,
    background = '#ffffff',
    splash,
}: WebImagesOptions): Promise<void> {
    const image = await loadImage(source);
    const opaque = (size: number) => square(image, size).flatten({ background }).png({ compressionLevel: 9 });

    await mkdir(outDir, { recursive: true });

    await favicon(image, 16).png({ compressionLevel: 9 }).toFile(path.join(outDir, WEB_FILES.favicon16));
    await favicon(image, 32).png({ compressionLevel: 9 }).toFile(path.join(outDir, WEB_FILES.favicon32));
    await writeFile(
        path.join(outDir, WEB_FILES.faviconIco),
        toIco(
            await Promise.all(
                [16, 32, 48].map(async (size) => ({ size, png: await favicon(image, size).png().toBuffer() })),
            ),
        ),
    );

    await opaque(APPLE_TOUCH_ICON_SIZE).toFile(path.join(outDir, WEB_FILES.appleTouchIcon));
    await Promise.all(
        MANIFEST_ICON_SIZES.map((size) => opaque(size).toFile(path.join(outDir, getManifestIconFile(size)))),
    );

    if (splash) await generateSplashScreens(image, outDir, background, splash);

    console.log('[APP-IMAGES] generateWebImages wrote', { outDir, splash: !!splash });
}
