import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { afterEach, beforeEach } from 'vite-plus/test';

/** Half transparent, so flattening onto the background shows. */
export const createSource = (): Promise<Buffer> =>
    sharp({ create: { width: 1200, height: 1200, channels: 4, background: { r: 193, g: 84, b: 221, alpha: 0.5 } } })
        .png()
        .toBuffer();

/** A fresh temporary folder per test. */
export function withOutDir(): { readonly path: string } {
    const dir = { path: '' };
    beforeEach(async () => {
        dir.path = await mkdtemp(path.join(tmpdir(), 'app-images-test-'));
    });
    afterEach(async () => {
        await rm(dir.path, { force: true, recursive: true });
    });
    return dir;
}

export const imageInfo = async (
    dir: string,
    file: string,
): Promise<{ width: number; height: number; hasAlpha: boolean }> => {
    const { width, height, hasAlpha } = await sharp(path.join(dir, file)).metadata();
    return { width, height, hasAlpha };
};
