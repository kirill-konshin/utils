import path from 'node:path';
import { generateImages } from '@kirill.konshin/electron-builder-utils';

await generateImages({
  iconPsdPath: path.resolve(process.cwd(), 'assets-src/icon.psd'),
  dmgBackgroundPsdPath: path.resolve(process.cwd(), 'assets-src/dmg.psd'),
  electronAssetsPath: path.resolve(process.cwd(), 'assets'),
  webPublicPath: path.resolve(process.cwd(), '../web-static/public'),
});
