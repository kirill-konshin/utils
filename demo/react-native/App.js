import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View, Button, Text } from 'react-native';
import { WebView } from 'react-native-webview';
import { useSafeAreaInsets, SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth0, Auth0Provider } from 'react-native-auth0';
import Constants from 'expo-constants';
import { shareDialog, Update, useAppState } from '@kirill.konshin/utils/react-native';

const styles = StyleSheet.create({
    webview: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    webviewContainer: {
        flex: 1,
        alignSelf: 'stretch',
    },
    loading: {
        flex: 1,
        alignSelf: 'center',
    },
    container: {
        backgroundColor: '#ffffff',
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

//import { StatusBar } from 'expo-status-bar';
//Constants.statusBarHeight,
//<StatusBar style="auto" />

function MainView() {
    const insets = useSafeAreaInsets();

    // clearSession
    const { authorize, user, getCredentials, clearCredentials } = useAuth0();
    const [error, setError] = useState(null);
    const [token, setToken] = useState(null);
    const [terminated, setTerminated] = useState(false);

    const webViewRef = useRef();

    const onLogin = async () => {
        try {
            setError(null);
            await authorize(
                {
                    audience: Constants.expoConfig.extra.auth0Audience,
                },
                {
                    customScheme: Constants.expoConfig.extra.auth0CustomScheme,
                    //FIXME This is a workaround for the login alert box
                    //FIXME A consequence is that password save dialog is not shown
                    // @see https://github.com/auth0/Auth0.swift/blob/master/FAQ.md#1-how-can-i-disable-the-login-alert-box
                    // @see https://github.com/auth0/react-native-auth0/issues/725
                    // @see https://community.auth0.com/t/react-native-auth0-password-autofill/112307
                    ephemeralSession: true,
                },
            );
        } catch (e) {
            setError(e);
        }
    };

    const onLogout = async () => {
        try {
            setError(null);
            setToken(null);
            // await clearSession({ customScheme: Constants.expoConfig.extra.auth0CustomScheme }); // FIXME Not required with ephemeralSession
            await clearCredentials();
        } catch (e) {
            setError(e);
        }
    };

    useEffect(() => {
        (async () => {
            if (!user) return;
            setToken(await getCredentials());
            global.webViewRef = webViewRef.current;
            window.webViewRef = webViewRef.current;
        })();
    }, [getCredentials, user]);

    const sendStatus = useCallback((status) => {
        webViewRef.current.postMessage(JSON.stringify({ type: 'recording-status', ...status }), '*');
    }, []);

    const appState = useAppState();

    // @see https://github.com/react-native-webview/react-native-webview/issues/2298#issuecomment-1026336455
    // @see https://github.com/react-native-webview/react-native-webview/issues/2298#issuecomment-1026587363
    useEffect(() => {
        if (!webViewRef.current) return;

        console.log('App state changed', appState);

        if (appState === 'active' && terminated) {
            webViewRef.current.reload();
            webViewRef.current.requestFocus();
            setTerminated(false);
        }
    }, [appState, terminated]);

    if (!user) {
        return (
            <>
                {error ? <Text>{error.message || 'Unknown'}</Text> : null}
                <Button onPress={onLogin} title="Log in" />
            </>
        );
    }

    if (!token) {
        return <Text>Loading Credentials</Text>;
    }

    return (
        <>
            {/*<Text>{Constants.expoConfig.extra.webUrl}</Text>*/}
            {/*<Text>{JSON.stringify(token, null, 2)}</Text>*/}
            <View style={{ ...styles.webviewContainer, paddingTop: insets.top, paddingBottom: insets.bottom }}>
                <WebView
                    ref={webViewRef}
                    style={styles.webview}
                    limitsNavigationsToAppBoundDomains={true}
                    source={{ uri: Constants.expoConfig.extra.webUrl }}
                    allowsInlineMediaPlayback={true}
                    mediaPlaybackRequiresUserAction={false}
                    originWhitelist={['*']}
                    onError={(e) => console.error('JS Error', e)}
                    injectedJavaScriptBeforeContentLoaded={`
                        window.auth0data = ${JSON.stringify({
                            token,
                            user,
                        })};
                        true;
                    `}
                    onMessage={async (e) => {
                        let data = JSON.parse(e.nativeEvent.data);

                        if (data.data) data = data.data; // Android hack

                        console.log('Native onMessage', data);

                        switch (data.type) {
                            case 'logout':
                                await onLogout();
                                return;
                            case 'download':
                                await shareDialog(data.file, data.name);
                                return;
                        }
                    }}
                    startInLoadingState={true}
                    renderLoading={() => <Text style={styles.loading}>Loading...</Text>}
                    // FIXME Do something less brutal
                    cacheMode={'LOAD_NO_CACHE'}
                    cacheEnabled={false}
                    onContentProcessDidTerminate={() => setTerminated(true)}
                />
            </View>
        </>
    );
}

function UpdateView() {
    return (
        <View style={styles.container}>
            <Update>
                <MainView />
            </Update>
        </View>
    );
}

export default function App() {
    useEffect(() => {
        // SplashScreen.hideAsync();
    });
    return (
        <SafeAreaProvider>
            <Auth0Provider
                domain={Constants.expoConfig.extra.auth0Domain}
                clientId={Constants.expoConfig.extra.auth0ClientId}
            >
                <UpdateView />
            </Auth0Provider>
        </SafeAreaProvider>
    );
}
