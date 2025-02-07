import path from 'path';
import { createWindow, appPath, isDev } from '@kirill.konshin/utils/electron';
import { fileURLToPath } from 'node:url';

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
    ? path.resolve(path.dirname(fileURLToPath(import.meta.resolve('@demo/web-static'))), 'out')
    : path.resolve(appPath, 'web'), // must be copied before Electron build
  useStaticInDev: !!process.env.DEBUG,
});
