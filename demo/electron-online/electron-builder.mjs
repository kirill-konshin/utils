import { electronBuilder } from '@kirill.konshin/utils/electron-builder';

export default electronBuilder.builerConfig({
    config: {
        productName: 'Electron Online',
        appId: 'org.konshin.electron-online',
    },
});
