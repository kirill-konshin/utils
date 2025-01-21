import path from 'path';
import { Menu, app, BrowserWindow, shell, protocol, ProtocolRequest, ProtocolResponse, Rectangle } from 'electron';
import defaultMenu from 'electron-default-menu';
import Store from 'electron-store';
import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import url from 'node:url';
import { checkForUpdates } from './updater.js';

export const isDev = process.env['NODE_ENV'] === 'development';
export const appPath = app.getAppPath();

export function createWindow({
    width = 1000,
    height = 1000,
    disableSecurity = true,
    disableSecurityWarnings = true,
    quitOnClose = true,
    onOpen,
    onClose,
    localhostUrl = 'http://localhost:3000',
    productionUrl = '',
    webPath = path.resolve(appPath, 'web'), // must conform to what is in electron-builder.js files section
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
    updater?: boolean;
    rememberBounds?: boolean;
} = {}) {
    let mainWindow: BrowserWindow | null = null;

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
        if (productionUrl && webPath) {
            throw new Error('productionUrl and webPath cannot be used together');
        }

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
            ...(!isDev && rememberBounds ? store.get('bounds') : {}),
        });

        mainWindow.on(
            'move',
            () => !isDev && rememberBounds && mainWindow && store.set('bounds', mainWindow.getBounds()),
        );

        mainWindow.once('ready-to-show', () => isDev && openDevTools());

        let interceptor;

        if (webPath && localhostUrl && !productionUrl) {
            protocol.interceptStreamProtocol(
                'http',
                (interceptor = (
                    request: ProtocolRequest,
                    callback: (response: NodeJS.ReadableStream | ProtocolResponse) => void,
                ) => {
                    if (request.url.startsWith(localhostUrl)) {
                        let fileUrl = url.parse(request.url, false).pathname;

                        if (fileUrl === '/') fileUrl = 'index.html';

                        if (!fileUrl) return false;

                        // return {path: path.join(webPath, fileUrl)};
                        callback(fs.createReadStream(path.join(webPath, fileUrl)));

                        return true;
                    }

                    // return {url: request.url};
                    (request.url.startsWith('https') ? https : http).get(request.url, callback);

                    return true;
                }),
            );
        }

        mainWindow.on('closed', () => {
            if (interceptor) protocol.uninterceptProtocol('http');
            onClose?.(mainWindow as never);
            mainWindow = null;
            interceptor = null;
        });

        // External URLs
        mainWindow.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url).catch((e) => console.error(e));
            return { action: 'deny' };
        });

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
            await mainWindow.loadURL(productionUrl && !isDev ? productionUrl : localhostUrl + '/');
        }

        console.log('[APP] Main Window Open');
    };

    app.on('ready', createWindow);

    app.on('window-all-closed', () => {
        if (process.platform !== 'darwin' || quitOnClose) app.quit();
    });

    app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && !mainWindow && createWindow());

    return {
        app,
        get mainWindow() {
            return mainWindow;
        },
    };
}
