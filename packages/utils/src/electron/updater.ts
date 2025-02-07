// https://github.com/electron-userland/electron-builder/blob/docs-deprecated/encapsulated%20manual%20update%20via%20menu.js
import { dialog } from 'electron';
import updater from 'electron-updater';
const { autoUpdater } = updater;

let updateButton;

autoUpdater.autoDownload = false;

autoUpdater.on('error', (error) => {
    dialog.showErrorBox('Error: ', !error ? 'unknown' : (error.stack || error).toString());
});

autoUpdater.on('update-available', async () => {
    const { response } = await dialog.showMessageBox({
        type: 'info',
        title: 'Found Updates',
        message: 'Found updates, do you want update now?',
        buttons: ['Yes', 'No'],
    });

    updateButton.enabled = true;
    updateButton = null;

    if (response === 0) await autoUpdater.downloadUpdate();
});

autoUpdater.on('update-not-available', async () => {
    try {
        await dialog.showMessageBox({
            title: 'No Updates',
            message: 'Current version is up-to-date.',
        });
    } catch (e) {
        dialog.showErrorBox('Error: ', e.toString());
    }
    updateButton.enabled = true;
    updateButton = null;
});

autoUpdater.on('update-downloaded', async () => {
    await dialog.showMessageBox({
        title: 'Install Update',
        message: 'Update downloaded, application will quit for update...',
    });

    autoUpdater.quitAndInstall();
});

export function checkForUpdates(menuItem, focusedWindow, event) {
    updateButton = menuItem;
    updateButton.enabled = false;
    autoUpdater.checkForUpdates().catch((e) => console.error('Update error', e));
}
