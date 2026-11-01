import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import sharp, { type Sharp } from 'sharp';

/** A file path (PSD or anything sharp reads: PNG, SVG, WebP, ...) or the image itself. */
export type ImageSource = string | Buffer;

const run = promisify(execFile);

/** macOS `sips` reads 16-bit PSDs, which `psd` can't; `psd` is the fallback elsewhere. */
async function psdToPng(file: string): Promise<Buffer> {
    const dir = await mkdtemp(path.join(tmpdir(), 'app-images-'));
    const out = path.join(dir, 'source.png');
    try {
        if (process.platform === 'darwin') {
            await run('/usr/bin/sips', ['-s', 'format', 'png', file, '--out', out]);
        } else {
            const { default: PSD } = await import('psd');
            const psd = await PSD.open(file);
            await psd.image!.saveAsPng(out);
        }
        return await readFile(out);
    } finally {
        await rm(dir, { force: true, recursive: true });
    }
}

export async function loadImage(source: ImageSource): Promise<Buffer> {
    if (typeof source !== 'string') return source;
    if (path.extname(source).toLowerCase() === '.psd') return psdToPng(source);
    return readFile(source);
}

/**
 * The artwork is a full-bleed square: macOS 26, iOS, Android and Chrome cut the platform shape themselves, so it must
 * carry no rounded corners or padding of its own.
 */
export const square = (image: Buffer, size: number): Sharp =>
    sharp(image).resize(size, size, { fit: 'cover', kernel: sharp.kernel.lanczos3 });
