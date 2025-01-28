import path from 'path';
import { createWindow, appPath, isDev } from '@kirill.konshin/electron-utils';

if (process.env['SKIP_ELECTRON']) {
  console.log('Skipping Electron');
  process.exit(0);
}

createWindow({
  title: 'Electron Static Updater',
  width: 800,
  height: 600,
  updater: true,
  webPath: isDev
    ? path.resolve(path.dirname(import.meta.resolve('@demo/web-static').replace('file:', '')), 'out')
    : path.resolve(appPath, 'web'), // must be copied before Electron build
  useStaticInDev: !!process.env.DEBUG,
});
