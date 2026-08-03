// Client-safe constants — this subpath (`@kirill.konshin/auth/client`) is importable from Client
// Components; the main entry pulls in next/headers and is server-only

/** Name of the search param / form field carrying the return URL through the login flow */
export const STATE_PARAM = 'state';

/** Name of the search param carrying the login error message (`loginAction` failure redirects) */
export const ERROR_PARAM = 'error';

/**
 * Request header `proxyGuard` stamps with the current pathname — layouts cannot see the URL, so
 * `redirectNonAuthenticated()` reads it back to return users to the page they were on after login
 */
export const PATHNAME_HEADER = 'x-pathname';

/**
 * Session field marking a password-authenticated session — lib-owned, collision-safe, nothing to
 * configure. A string constant and NOT a JS `Symbol`: iron-session JSON-serializes the session
 * into the sealed cookie, symbol-keyed fields would be silently dropped
 */
export const AUTHENTICATED = '__authenticated';
