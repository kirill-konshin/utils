//TODO Implement queue with ranking & sorting
//TODO https://github.com/sindresorhus/p-queue
export class Mutex {
    private promise = Promise.resolve();

    public exec<T extends (...args: any) => any>(fn: T): Promise<ReturnType<T>> {
        return new Promise((resolve, reject) => {
            // wrap in always successful function
            this.promise = this.promise.then(async () => {
                try {
                    resolve(await fn());
                } catch (e) {
                    reject(e);
                }
            });
        });
    }

    public wrap<T extends (...args: any) => any>(fn: T): () => Promise<ReturnType<T>> {
        return (...args: any) => this.exec(() => fn(...args));
    }
}
