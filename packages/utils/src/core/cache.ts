import ManyKeysMap from 'many-keys-map';

export type MaybePromise<T> = T | Promise<T>;

export const shallowCompare = (prev: any, next: any) =>
    Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).every((key) => prev[key] === next[key]);

export const equal = (prev: any, next: any) => prev === next;

const UNUSED = Symbol('UNUSED');
export const ANY = Symbol('*');

export function createTracker<Dep = any>(whenDifferent: (next: Dep, prev?: Dep) => any, shallow = false) {
    let lastDependency: Dep = UNUSED as any;

    const comparator = shallow ? shallowCompare : equal;

    return function tracker(dependency: Dep) {
        // console.log('Tracker', lastDependency, dependency);

        if (lastDependency !== UNUSED && comparator(lastDependency, dependency)) {
            // console.log('RETAINED cache', { lastDependency, dependency });
            return false;
        }

        // console.log('INVALIDATED cache', {lastDependency, dependency});

        const res = whenDifferent(dependency, lastDependency === UNUSED ? undefined : lastDependency) || true;

        lastDependency = dependency;

        return res;
    };
}

/**
 * https://github.com/futpib/deep-weak-map
 * https://github.com/fregante/many-keys-map
 * https://github.com/fregante/many-keys-weakmap
 * https://github.com/sindresorhus/memoize?tab=readme-ov-file#example-multiple-non-serializable-arguments
 *
 * ```ts
 * const memoized = memo(
 *   (file, options, ...args) => { ... },
 *   {
 *     key: (file, options, ...args) => [file, JSON.stringify(options), ...args],
 *     invalidate: (bitmap) => !bitmap.width,
 *     dispose: (bitmap) => bitmap.close(),
 *   }
 * );
 * ```
 */
export function memo<Key extends any[], Val, SerializedKey extends any[] = Key>(
    fn: (...args: Key) => MaybePromise<Val>,
    {
        key = (...k: Key) => k as never as SerializedKey,
        invalidate,
        dispose,
    }: {
        key?: (...key: Key) => SerializedKey;
        invalidate?: (prev: Val, ...key: SerializedKey) => boolean;
        dispose?: (prev: Val, ...key: SerializedKey) => void;
    } = {},
) {
    const map = new ManyKeysMap<SerializedKey, Val>();

    //TODO Extend ManyKeysMap
    const clear = (...condition: Key | any[]) => {
        if (!condition?.length) {
            map.forEach((value, serializedKey) => {
                dispose?.(value, ...serializedKey);
            });
            map.clear();
            return;
        }

        const keyToClear = key(...(condition as any));

        map.forEach((value, serializedKey) => {
            if (!serializedKey.every((kk, i) => keyToClear[i] === ANY || kk === keyToClear[i])) return;
            dispose?.(value, ...serializedKey);
            map.delete(serializedKey);
        });
    };

    const size = () => map.size;

    async function memoized(...args: Key) {
        const k = key(...args);

        const has = map.has(k);
        const old = map.get(k);

        if (has && !invalidate?.(old as never as Val, ...k)) {
            return { value: map.get(k), hit: true };
        }

        const value = await fn(...args);

        map.set(k, value);

        return { hit: false, value };
    }

    memoized.clear = clear;
    memoized.size = size;

    //TODO return mimic-function(memorized, fn);

    return memoized;
}

/**
 * Allows to memoize values by key and invalidate them based on the previous value.
 *
 * This makes possible to implement various one-off and subsequent transformations.
 *
 * 1. `write`: Transform value BEFORE writing to cache, called only once if cache IS NOT present or IS NOT valid
 * 2. `read`: Transform value AFTER it's read from cache, always called if cache IS valid, keep in mind this transform is applied on top of BEFORE
 *
 * Both should return same type or null.
 *
 * If `newValue` is null, old is returned, and no cache is set.
 *
 * ```ts
 * class InputCache extends TypedCache<string, ImageBitmap> {
 *     dispose(bitmap: ImageBitmap, key: string) {
 *         bitmap.close();
 *     }
 * }
 *
 * const cache = new InputCache('input');
 *
 * // Cache provided OffscreenCanvas by name and create context once per canvas
 *
 * class CanvasCache extends TypedCache<string, OffscreenCanvas> {
 *     protected write(key: string, canvas: OffscreenCanvas): OffscreenCanvas {
 *         const canvas = newValue.getContext('2d');
 *         canvas.ctx = canvas;
 *         return canvas;
 *     }
 * }
 *
 * // Transfer control to offscreen canvas and track removal of original
 * // When called again, always return null, because canvas is handed to worker, and never returned to main
 *
 * class CanvasCache extends TypedCache<HTMLCanvasElement, OffscreenCanvas> {
 *
 *     protected write(canvas: HTMLCanvasElement): OffscreenCanvas {
 *         let l;
 *         canvas.addEventListener(
 *             'remove',
 *             (l = () => {
 *                 console.log('Removing canvas from cache', key);
 *                 this.delete(canvas);
 *                 key.removeEventListener('remove', l);
 *             }),
 *         );
 *         return canvas.transferControlToOffscreen();
 *     }
 *
 *     protected read() {
 *         return null;
 *     }
 * }
 *
 * // Create bitmap from file and check if was used, return null if used
 * // Since bitmaps are also cached in worker, used bitmaps are not sent
 *
 * class BitmapCache extends TypedCache<File, ImageBitmap, File> {
 *     protected async write(file: File): Promise<ImageBitmap> {
 *         return await createImageBitmap(file);
 *     }
 *
 *     protected read(bitmap: ImageBitmap): Promise<ImageBitmap> | ImageBitmap {
 *         if (!bitmap.width) return null;
 *         return bitmap;
 *     }
 * }
 *
 * ```
 */
export abstract class TransformerMap<Key, Val = Key> extends Map<Key, Val> {
    constructor(protected readonly name: string) {
        // console.warn('CREATE cache', name);
        super();
    }

    protected write(key: Key, newValue?: Val, oldValue?: Val): MaybePromise<Val> {
        return newValue as Val;
    }

    protected read(oldValue: Val, key: Key): MaybePromise<Val> {
        return oldValue;
    }

    delete(key: Key) {
        const val = this.get(key);
        const has = typeof val !== 'undefined';
        if (has) this.dispose(val, key);
        super.delete(key);
        return has;
    }

    /**
     * Do something with the value and key before removing it from cache
     * For example, close a file or a bitmap
     */
    protected dispose(value: Val, key: Key) {}

    clear() {
        console.log('CLEAR cache', this.name);
        this.forEach(this.dispose);
        super.clear();
    }

    set(key: Key, value: Val): this {
        throw new Error('Use memo() method instead');
    }

    async memo(key: Key, newValue?: Val): Promise<Val> {
        const oldValue = this.get(key);

        if (!!oldValue && (!newValue || newValue === oldValue)) {
            // console.log('FROM cache', this.name, key, 'old value', oldValue);
            return this.read?.(oldValue, key);
        }

        if (this.has(key)) this.delete(key);

        const value = await this.write(key, newValue, oldValue);

        super.set(key, value);

        // console.log('INVALIDATED KEY cache', this.name, key, 'has', has, 'invalidate', invalidate, 'new value', value);

        return value;
    }
}
