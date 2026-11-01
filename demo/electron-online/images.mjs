import path from 'node:path';
import { generateElectronImages, generateWebImages } from '@kirill.konshin/app-images';

const source = path.resolve(import.meta.dirname, 'assets-src/icon.psd');

await generateElectronImages({
    source,
    outDir: path.resolve(import.meta.dirname, 'assets'),
    dmgBackground: path.resolve(import.meta.dirname, 'assets-src/dmg.psd'),
});

await generateWebImages({
    source,
    outDir: path.resolve(import.meta.dirname, '../web-static/public'),
});
