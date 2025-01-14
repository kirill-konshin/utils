export function shallowCompare(prev: any, next: any) {
    for (const key of Object.keys(prev).concat(Object.keys(next))) {
        if (prev[key] !== next[key]) return false;
    }
    return true;
}

export function equal(prev: any, next: any) {
    return prev === next;
}

export class CacheInPlace<Key, Val, Dep = any> {
    protected map = new Map<Key, Val>();
    protected lastDependency: Dep | null = null;

    constructor(protected readonly name: string) {}

    private compare(prev: Dep, next: Dep, shallow = false) {
        const comparator = shallow ? shallowCompare : equal;
        return comparator(prev, next);
    }

    trackDependency(dependency: Dep, shallow = false) {
        if (!this.lastDependency || !dependency || this.compare(this.lastDependency, dependency, shallow)) {
            // console.log('RETAINED cache', this.name, 'last', this.lastObj, 'new', obj);
            return false;
        }

        // console.log('INVALIDATED cache', this.name, 'last', this.lastObj, 'new', obj);

        this.map.clear();
        this.lastDependency = dependency;

        return true;
    }

    remove(key: Key) {
        if (this.map.has(key)) this.dispose(this.map.get(key) as Val, key);
        this.map.delete(key);
    }

    dispose(value: Val, key: Key) {}

    clear() {
        console.log('CLEAR cache', this.name);
        this.map.forEach(this.dispose);
        this.map.clear();
        this.lastDependency = null;
    }

    async memo({
        key,
        memo,
        hit,
        invalidate,
    }: {
        key: Key;
        memo: (oldValue: Val | undefined, key: Key) => Promise<Val> | Val;
        hit?: (oldValue: Val, key: Key) => Promise<Val> | Val;
        invalidate?: (oldValue: Val, key: Key) => boolean;
    }): Promise<Val> {
        const oldValue = this.map.get(key);

        if (!!oldValue && invalidate && !invalidate(oldValue, key)) {
            return hit ? await hit(oldValue, key) : oldValue;
        }

        if (this.map.has(key)) this.remove(key);

        const value = await memo(oldValue, key);

        this.map.set(key, value);

        // console.log('INVALIDATED KEY cache', this.name, key, 'has', has, 'invalidate', invalidate, 'new value', value);

        return value;
    }

    get size() {
        return this.map.size;
    }
}

export abstract class TypedCache<Key, Val = Key, Dep = any> extends CacheInPlace<Key, Val, Dep> {
    protected invalidate(newValue: Val, oldValue: Val, key: Key): boolean {
        return newValue && newValue !== oldValue; // shallow compare ever?
    }

    protected memoizer(key: Key, newValue: Val, oldValue: Val | undefined): Promise<Val> | Val {
        return newValue;
    }

    protected hit(oldValue: Val, key: Key): Promise<Val> | Val {
        return oldValue;
    }

    async memo(init: any): Promise<Val> {
        throw new Error('Use memoIfNotFound() method');
    }

    async memoValue(key: Key, newValue: Val): Promise<Val> {
        return super.memo({
            key,
            memo: (oldValue) => this.memoizer(key, newValue, oldValue),
            hit: this.hit,
            invalidate: (oldValue, key) => this.invalidate(newValue, oldValue, key),
        });
    }
}
