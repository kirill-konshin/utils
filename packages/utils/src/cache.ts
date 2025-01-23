import ManyKeysMap from 'many-keys-map';

export type MaybePromise<T> = T | Promise<T>;

export const shallowCompare = (prev: any, next: any) =>
    Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])).every((key) => prev[key] === next[key]);

export const equal = (prev: any, next: any) => prev === next;

export function createTracker<Dep = any>(whenDifferent: (next: Dep, prev: Dep) => boolean, shallow = false) {
    let lastDependency: Dep | null = null;

    const comparator = shallow ? shallowCompare : equal;

    return function tracker(dependency: Dep) {
        if (!lastDependency || !dependency || comparator(lastDependency, dependency)) {
            // console.log('RETAINED cache', this.name, 'last', this.lastObj, 'new', obj);
            return false;
        }

        // console.log('INVALIDATED cache', this.name, 'last', this.lastObj, 'new', obj);

        lastDependency = dependency;

        return whenDifferent(dependency, lastDependency) || true;
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

    const clear = () => {
        if (dispose) {
            map.forEach((value, key) => dispose(value, ...key));
        }
        map.clear();
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
 * 1. `write`: Before writing to cache, called only once if cache is present and valid
 * 2. `read`: After it's read from cache, always called if cache is valid
 * TODO Better names: once, folloing
 * TODO Better names: memoize, recover
 * TODO Better names: writeTransformer, readTransformer
 * TODO Better names: writeModifier, readModifier
 * TODO Better names: write, read
 *
 * Both should return same type or null.
 *
 * If newValue is null, old is returned, and no cache is set.
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
        super();
    }

    protected write(key: Key, newValue?: Val, oldValue?: Val): MaybePromise<Val> {
        return newValue as Val;
    }

    protected read(oldValue: Val, key: Key): MaybePromise<Val> {
        return oldValue;
    }

    delete(key: Key) {
        const has = this.has(key);
        if (has) this.dispose(this.get(key) as Val, key);
        super.delete(key);
        return has;
    }

    // do something with the value and key before removing it
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
