import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * data:text/plain;base64,W29iamV
 * @see https://stackoverflow.com/questions/69738812/problem-to-generate-pdf-from-a-blob-in-an-expo-app-using-filesystem
 * @param base64
 * @param fileName
 * @returns {Promise<void>}
 */
export const shareDialog = async (base64, fileName) => {
    const path = `${FileSystem.documentDirectory}/${fileName}`;

    try {
        if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available');

        const [header, buffer] = base64.split(',');
        const [, mimeTypeStr] = header.split(':');
        const [mimeType] = mimeTypeStr.split(';');

        await FileSystem.writeAsStringAsync(`${path}`, buffer, {
            encoding: FileSystem.EncodingType.Base64,
        });

        await Sharing.shareAsync(path, { mimeType, UTI: fileName, dialogTitle: 'Save or share document' });
    } catch (error) {
        alert('Sharing failed: ' + error.message);
    } finally {
        await FileSystem.deleteAsync(path);
    }
};
