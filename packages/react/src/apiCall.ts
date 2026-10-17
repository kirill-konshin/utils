export const jsonContentType = 'application/json';

export type DataResponse<R> = Response & { data?: R };

export async function apiCall<R>(url: string, init?: RequestInit): Promise<DataResponse<R>> {
    const useBodyAsIs = !init?.body || init?.body instanceof FormData || typeof init?.body === 'string';

    // `Headers` accepts every `HeadersInit` form; spreading one would drop a `Headers` instance or a tuple list
    const headers = new Headers(init?.headers);
    if (!useBodyAsIs) headers.set('Content-Type', jsonContentType);

    const res: DataResponse<R> = await fetch(url, {
        method: 'POST',
        ...init,
        body: useBodyAsIs ? init?.body : JSON.stringify(init.body),
        headers,
    });

    if (res.headers.get('Content-Type')?.includes(jsonContentType)) {
        res.data = await res.json();
    }

    if (!res.ok) throw new Error(res.statusText, { cause: res });

    return res;
}
