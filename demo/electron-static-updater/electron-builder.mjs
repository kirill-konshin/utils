const { builerConfig } = require('@kirill.konshin/electron-builder-utils');

// await generateImages({
//     iconPsdPath: 'icon.psd',
//     dmgBackgroundPsdPath: 'dmg.psd',
//     electronAssetsPath: 'assets',
//     webPublicPath: 'web',
// });

module.exports = builerConfig({
  config: {
    productName: 'Electron Static Updater',
    appId: 'org.konshin.electron-static-updater',
    files: [
      {
        from: 'node_modules/@demo/web-static/out',
        to: './web',
        filter: ['**/*'],
      },
    ],
  },
  githubReleases: {
    owner: 'kirill.konshin',
    repo: 'utils',
  },
  s3: {
    bucket: 'electron-static-updater',
  },
});
