import path from 'node:path';
import { generateImages } from '@kirill.konshin/electron-builder-utils';

await generateImages({
  iconPsdPath: 'icon.psd',
  dmgBackgroundPsdPath: 'dmg.psd',
  electronAssetsPath: path.resolve(__dirname, './assets'),
  webPublicPath: path.resolve(__dirname, '../web-static/public'),
});
