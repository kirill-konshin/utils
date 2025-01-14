const json = 'application/json';

export type DataResponse<R> = Response & { data?: R };

export async function apiCall<R>(url: string, init?: RequestInit): Promise<DataResponse<R>> {
    const useBodyAsIs = !init?.body || init?.body instanceof FormData || typeof init?.body === 'string';

    const res: DataResponse<R> = await fetch(url, {
        method: 'POST',
        ...init,
        body: useBodyAsIs ? init?.body : JSON.stringify(init.body),
        headers: {
            ...init?.headers,
            ...(useBodyAsIs ? {} : { 'Content-Type': json }),
        },
    });

    if (res.headers.get('Content-Type')?.includes(json)) {
        res.data = await res.json();
    }

    if (!res.ok) throw new Error(res.statusText, { cause: res });

    return res;
}
