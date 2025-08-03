// 'use client';
//
// import { Auth0Provider, useAuth0 } from '@auth0/auth0-react';
// import { Button, ButtonProps } from 'react-bootstrap';
// import { useRouter } from 'next/navigation';
// import { useEffect } from 'react';
// import { emitter } from '../api/apiClient';
// import RestResponse from '../api/restResponse';
// import { useToaster } from '../redux/toasterSlice';
// import { end_session } from '../api/miscCommands';
// import { createAuth0Client, Auth0Client } from '@auth0/auth0-spa-js';
//
// const isSSR = typeof window === 'undefined';
//
// const origin = !isSSR ? window.location.origin : '';
//
// // @ts-ignore
// export const isReactNative = () => !isSSR && window.ReactNativeWebView?.postMessage;
//
// // @ts-ignore
// export const postMessage = (data: any = null) => window.ReactNativeWebView?.postMessage(JSON.stringify(data));
//
// if (isReactNative()) {
//     const originalConsole = { ...console };
//
//     const makeLogger =
//         (type) =>
//         (...args) => {
//             postMessage(
//                 JSON.stringify({
//                     type,
//                     data: args,
//                 })
//             );
//             originalConsole[type].apply(console, args);
//         };
//
//     console.log = makeLogger('log');
//     console.log = makeLogger('error');
//     console.log = makeLogger('info');
//     console.log = makeLogger('warn');
// }
//
// export const externalAuth =
//     !isSSR && window['auth0data']
//         ? ({
//               user: window['auth0data'].user,
//               getAccessTokenSilently: async () => window['auth0data'].token.accessToken,
//               isLoading: !window['auth0data'].user,
//               isAuthenticated: !!window['auth0data'].user,
//               loginWithRedirect: () => {},
//               logout: () => postMessage({ type: 'logout' }),
//           } as any)
//         : null;
//
// export const useAuth = (): ReturnType<typeof useAuth0> => {
//     const auth0 = useAuth0();
//     return externalAuth || auth0;
// };
//
// // To support passing parameters and hints to Auth0 we need to use lower level API
// const auth0Config = {
//     domain: process.env.NEXT_PUBLIC_AUTH0_DOMAIN as string,
//     clientId: process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID as string,
//     redirectUri: origin,
//     audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
// };
//
// let auth0ClientInstance: Auth0Client | null = null;
//
// const getAuth0Client = async () => {
//     if (!auth0ClientInstance) {
//         auth0ClientInstance = await createAuth0Client(auth0Config);
//     }
//     return auth0ClientInstance;
// };
//
// export const useExtendedAuth = () => {
//     const auth = useAuth0();
//
//     const extendedLoginWithRedirect = async (options: any) => {
//         if (options.login_hint || options.screen_hint) {
//             const auth0Client = await getAuth0Client();
//             return auth0Client.loginWithRedirect(options);
//         }
//
//         return auth.loginWithRedirect(options);
//     };
//
//     return {
//         ...auth,
//         loginWithRedirect: extendedLoginWithRedirect,
//     };
// };
//
// export const Provider = ({ children, authParams = {} }) => {
//     return (
//         <Auth0Provider
//             domain={process.env.NEXT_PUBLIC_AUTH0_DOMAIN as string}
//             clientId={process.env.NEXT_PUBLIC_AUTH0_CLIENT_ID as string}
//             authorizationParams={{
//                 ...authParams,
//                 redirect_uri: origin,
//                 audience: process.env.NEXT_PUBLIC_AUTH0_AUDIENCE,
//             }}
//         >
//             {children}
//         </Auth0Provider>
//     );
// };
//
// export const LoginButton = (props: ButtonProps) => {
//     const { loginWithRedirect } = useAuth(); //FIXME add state
//     return (
//         <Button {...props} onClick={() => loginWithRedirect()}>
//             Log In
//         </Button>
//     );
// };
//
// export const LogoutButton = ({ as: Cmp = Button, children, ...props }: any) => {
//     const { logout, isAuthenticated, isLoading } = useAuth();
//     if (!isAuthenticated || isLoading) return null;
//
//     const handleLogout = async () => {
//         try {
//             await end_session();
//         } catch (e) {
//             console.error('Cannot end session', e); // will get here if in Native
//         }
//         logout({ logoutParams: { returnTo: origin } });
//     };
//
//     return (
//         <Cmp {...props} onClick={handleLogout} role="button">
//             {children || 'Log Out'}
//         </Cmp>
//     );
// };
//
// export const useLogoutTracker = () => {
//     const router = useRouter();
//     const { logout } = useAuth();
//     const { setToast } = useToaster();
//
//     useEffect(() => {
//         let onError;
//
//         emitter.on(
//             'error',
//             (onError = (restResponse: RestResponse) => {
//                 if (restResponse.code === 401 || restResponse.message.includes('(Unauthorized)')) {
//                     if (restResponse.message.includes('OpenAI API Key')) {
//                         setToast('Your account is not provisioned yet. Please check your email for instructions.');
//                         return;
//                     }
//
//                     if (externalAuth) {
//                         externalAuth.logout();
//                         return;
//                     }
//
//                     logout({
//                         async openUrl() {
//                             router.replace('/' as any); //FIXME Return to the same page
//                             setToast('You have been logged out');
//                         },
//                     });
//                 }
//             })
//         );
//
//         return () => {
//             emitter.off('error', onError);
//         };
//     }, [logout, router, setToast]);
// };
