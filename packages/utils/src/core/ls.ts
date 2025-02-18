export function getStorage(pref: string) {
    const prefix = (key) => `${pref}-${key}`;

    const ls = (typeof window !== 'undefined' ? localStorage : null) as Storage;

    const read = (key: string) => JSON.parse(ls?.getItem(prefix(key)) || 'null');
    const write = (key: string, value: any) => ls?.setItem(prefix(key), JSON.stringify(value));
    const remove = (key: string) => ls?.removeItem(prefix(key));

    return { read, write, remove };
}
