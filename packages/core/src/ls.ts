export function getStorage(pref: string): {
    read: (key: string) => null | any;
    write: (key: string, value: any) => void;
    remove: (key: string) => void;
} {
    const prefix = (key) => `${pref}-${key}`;

    const ls = (typeof window !== 'undefined' ? localStorage : null) as Storage;

    const read = (key: string): any => JSON.parse(ls?.getItem(prefix(key)) || 'null');
    const write = (key: string, value: any): void => ls?.setItem(prefix(key), JSON.stringify(value));
    const remove = (key: string): void => ls?.removeItem(prefix(key));

    return { read, write, remove };
}
