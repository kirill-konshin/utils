export type DatabaseUrlEnvironment = Readonly<Record<string, string | undefined>>;

export type DatabaseUrlMode = 'maintenance' | 'runtime';

export type DatabaseUrl = string | (() => string);

export const resolveDatabaseUrl = (environment: DatabaseUrlEnvironment, mode: DatabaseUrlMode = 'runtime'): string => {
    if (mode === 'runtime') {
        if (!environment.DATABASE_URL) throw new Error('DATABASE_URL is required.');
        return environment.DATABASE_URL;
    }

    const url = environment.DATABASE_URL_UNPOOLED ?? environment.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required.');
    return url;
};

export const resolveDatabaseUrlValue = (url: DatabaseUrl): string => (typeof url === 'function' ? url() : url);
