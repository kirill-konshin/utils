/**
 * TODO Bump versions according to GIT tags
 */

const projectId = 'FROM_EAS';
const version = '1.0.0'; //FIXME Take from GIT tag

const backgroundColor = '#ffffff';

module.exports = {
    name: 'knowledge-nexus',
    slug: 'knowledge-nexus',
    version,
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
        image: './assets/splash.png',
        resizeMode: 'contain',
        backgroundColor,
    },
    assetBundlePatterns: ['**/*'],
    ios: {
        supportsTablet: true,
        bundleIdentifier: 'com.smartperipheral.knowledgenexus',
        config: {
            usesNonExemptEncryption: false, // https://stackoverflow.com/questions/63613197/app-store-help-answering-missing-compliance-using-expo-firebase
        },
        infoPlist: {
            ITSAppUsesNonExemptEncryption: false, // https://stackoverflow.com/questions/63613197/app-store-help-answering-missing-compliance-using-expo-firebase
            NSMicrophoneUsageDescription: 'This app uses microphone to make notes', // https://github.com/react-native-webview/react-native-webview/issues/3072
            UIBackgroundModes: ['audio', 'fetch'],
            WKAppBoundDomains: [
                'target-domain.com',
                'target-domain.us.auth0.com',
                'dfuse.ngrok.io',
                'google.com',
                'accounts.google.com',
            ],
        },
        associatedDomains: ['webcredentials:smartperipheral.us.auth0.com'],
        entitlements: { 'com.apple.developer.applesignin': true },
    },
    android: {
        adaptiveIcon: {
            foregroundImage: './assets/adaptive-icon.png',
            backgroundColor,
        },
        package: 'com.smartperipheral.knowledgenexus',
        permissions: ['RECORD_AUDIO', 'android.permission.RECORD_AUDIO'],
    },
    web: {
        favicon: './assets/favicon.png',
    },
    extra: {
        eas: {
            projectId,
        },
        webUrl: process.env.WEB_URL,
        auth0Domain: process.env.AUTH0_DOMAIN,
        auth0ClientId: process.env.AUTH0_CLIENT_ID,
        auth0CustomScheme: process.env.AUTH0_CUSTOM_SCHEME,
        auth0Audience: process.env.AUTH0_AUDIENCE,
    },
    owner: 'smartperipheral',
    updates: {
        url: `https://u.expo.dev/${projectId}`,
    },
    runtimeVersion: {
        policy: 'sdkVersion',
    },
    plugins: [
        [
            'react-native-auth0',
            {
                domain: process.env.AUTH0_DOMAIN,
                customScheme: process.env.AUTH0_CUSTOM_SCHEME,
            },
        ],
        'expo-apple-authentication',
        'expo-file-system',
    ],
};
