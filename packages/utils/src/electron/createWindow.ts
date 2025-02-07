import path from 'node:path';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import url from 'node:url';
import { Menu, app, BrowserWindow, shell, protocol, Rectangle } from 'electron';
import defaultMenu from 'electron-default-menu';
import Store from 'electron-store';
import { checkForUpdates } from './updater.js';

export const isDev = process.env['NODE_ENV'] === 'development';
export const appPath = app.getAppPath();

// See https://cs.chromium.org/chromium/src/net/base/net_error_list.h
const FILE_NOT_FOUND = -6;

const getPath = async (path_, file = '') => {
    try {
        const result = await fsp.stat(path_);

        if (result.isFile()) return path_;

        if (result.isDirectory()) return getPath(path.join(path_, `${file}.html`));
    } catch {
        /* empty */
    }
};

export function createWindow({
    width = 1000,
    height = 1000,
    disableSecurity = true,
    disableSecurityWarnings = true,
    quitOnClose = true,
    onOpen,
    onClose,
    localhostUrl = 'http://localhost:3000',
    productionUrl = '', // in this mode Electron acts as a browser for remote app
    webPath = path.resolve(appPath, 'web'), // must conform to what is in electron-builder.js files section
    useStaticInDev = false,
    updater = false,
    rememberBounds = true,
}: {
    width?: number;
    height?: number;
    disableSecurity?: boolean;
    disableSecurityWarnings?: boolean;
    quitOnClose?: boolean;
    onOpen?: (win: BrowserWindow) => void;
    onClose?: (win: BrowserWindow) => void;
    localhostUrl?: string;
    productionUrl?: string;
    webPath?: string;
    useStaticInDev?: boolean;
    updater?: boolean;
    rememberBounds?: boolean;
} = {}) {
    let mainWindow: BrowserWindow | null = null;

    console.log('[APP] Starting Electron', {
        isDev,
        appPath,
        useStaticInDev,
        localhostUrl,
        productionUrl,
        webPath,
        updater,
        rememberBounds,
        quitOnClose,
        disableSecurity,
        disableSecurityWarnings,
    });

    if (!productionUrl && !webPath) {
        throw new Error('productionUrl or webPath must be defined');
    }

    if (productionUrl && webPath) {
        throw new Error('productionUrl and webPath cannot be used together');
    }

    if (!localhostUrl) {
        throw new Error('localhostUrl must be defined');
    }

    const store = new Store<{ bounds: Rectangle }>({
        schema: {
            bounds: {
                type: 'object',
                properties: {
                    // Docs: https://electronjs.org/docs/api/structures/rectangle
                    height: { type: 'number' },
                    width: { type: 'number' },
                    x: { type: 'number' },
                    y: { type: 'number' },
                },
            },
        },
    });

    if (disableSecurityWarnings) process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true';
    process.env['ELECTRON_ENABLE_LOGGING'] = 'true';

    process.on('SIGTERM', () => process.exit(0));
    process.on('SIGINT', () => process.exit(0));

    const openDevTools = () => {
        if (!mainWindow) return;
        mainWindow.setSize(width + 800, height);
        mainWindow.center();
        mainWindow.webContents.openDevTools();
    };

    const createWindow = async () => {
        mainWindow = new BrowserWindow({
            width,
            height,
            icon: path.resolve(appPath, 'assets/icon.png'),
            webPreferences: {
                nodeIntegration: false, // is default value after Electron v5
                contextIsolation: true, // protect against prototype pollution
                webSecurity: !disableSecurity,
                devTools: true,
            },
            ...(rememberBounds ? store.get('bounds') : {}),
        });

        mainWindow.on('move', () => rememberBounds && mainWindow && store.set('bounds', mainWindow.getBounds()));

        mainWindow.once('ready-to-show', () => isDev && openDevTools());

        // Static interceptor

        let interceptor: (() => void) | null = null;

        if (webPath && (!isDev || useStaticInDev)) {
            console.log(`[APP] Static Server Enabled, ${localhostUrl} will be intercepted to ${webPath}`);

            //TODO https://localhost:3000
            // @see https://github.com/sindresorhus/electron-serve/blob/main/index.js
            protocol.interceptStreamProtocol('http', (request, callback) => {
                if (request.url.startsWith(localhostUrl)) {
                    let fileUrl = url.parse(request.url, false).pathname;

                    if (!fileUrl) return callback({ error: FILE_NOT_FOUND });

                    if (fileUrl === '/') fileUrl = 'index.html';

                    const filePath = path.join(webPath, fileUrl);

                    const relativePath = path.relative(webPath, fileUrl);

                    const isSafe = !relativePath.startsWith('..') && !path.isAbsolute(relativePath);

                    if (!isSafe && !isDev) return callback({ error: FILE_NOT_FOUND });

                    // const finalPath = await getPath(filePath, options.file);
                    // const fileExtension = path.extname(filePath);

                    console.log('[APP] Static Server', fileUrl, '->', filePath);

                    // return {path: path.join(webPath, fileUrl)};
                    callback(fs.createReadStream(filePath));

                    return true;
                }

                // return {url: request.url};
                (request.url.startsWith('https') ? https : http).get(request.url, callback);

                return true;
            });

            interceptor = () => protocol.uninterceptProtocol('http');
        }

        mainWindow.on('closed', () => {
            interceptor?.();
            onClose?.(mainWindow as never);
            mainWindow = null;
            interceptor = null;
        });

        // External URLs

        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url).catch((e) => console.error(e));
            return { action: 'deny' };
        });

        // Menu

        const menu = defaultMenu(app, shell);

        if (updater) {
            (menu.at(-1)!.submenu as any).push(
                { type: 'separator' },
                {
                    label: 'Check For Updates',
                    click: checkForUpdates,
                },
            );
        }

        Menu.setApplicationMenu(Menu.buildFromTemplate(menu)); //TODO onMenu

        // Should be last, after all listeners and menu

        await app.whenReady();

        onOpen?.(mainWindow);

        if (!onOpen && localhostUrl) {
            await mainWindow.loadURL(productionUrl && !isDev ? productionUrl : `${localhostUrl}/`);
        }

        console.log('[APP] Main Window Open');
    };

    app.on('ready', createWindow);

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin' || quitOnClose) app.quit();
    });

    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && !mainWindow && createWindow());

    return {
        get mainWindow() {
            return mainWindow;
        },
    };
}
