//TODO Implement queue with ranking & sorting
//TODO https://github.com/sindresorhus/p-queue
export class Mutex {
    private promise = Promise.resolve();

    public exec(fn: (...args: any) => any): ReturnType<typeof fn> {
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

    public wrap(fn: (...args: any) => any): ReturnType<typeof fn> {
        return (...args: any) => this.exec(() => fn(...args));
    }
}
