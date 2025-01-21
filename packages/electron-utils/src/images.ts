import { open } from 'psd';
import sharp from 'sharp';
import path from 'node:path';

export default async function generateImages({
    iconPsdPath,
    dmgBackgroundPsdPath,
    electronAssetsPath,
    webPublicPath,
}: {
    iconPsdPath: string;
    dmgBackgroundPsdPath: string;
    electronAssetsPath: string;
    webPublicPath: string;
}) {
    const iconPsd = await open(iconPsdPath);
    await iconPsd.image!.saveAsPng(path.join(electronAssetsPath, 'icon.png'));

    const bgPsd = await open(dmgBackgroundPsdPath);
    await bgPsd.image!.saveAsPng(path.join(electronAssetsPath, 'background@2x.png'));

    const iconPng = sharp(path.join(electronAssetsPath, 'icon.png'));
    const bgPng = sharp(path.join(electronAssetsPath, 'background@2x.png'));

    await bgPng.resize(500).toFile(path.join(electronAssetsPath, 'background.png'));

    await iconPng.toFile(path.join(electronAssetsPath, 'splash.webp'));
    await iconPng.toFile(path.join(electronAssetsPath, 'icon.icns'));
    await iconPng.toFile(path.join(webPublicPath, 'icon.png'));
    await iconPng.resize(32).toFile(path.join(webPublicPath, 'favicon.ico'));
}
