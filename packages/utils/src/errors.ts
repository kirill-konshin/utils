// @see https://www.youtube.com/watch?v=AdmGHwvgaVs
export function catchErrors<T, E extends Error = Error>(promise: Promise<T>, errors?: E[]) {
    return promise.then(data => ([undefined, data])).catch(error => {
        if (!errors?.length) {
            return [error];
        }
        if (errors.some(e => e instanceof error)) {
            return [error];
        }
        throw error;
    });
}