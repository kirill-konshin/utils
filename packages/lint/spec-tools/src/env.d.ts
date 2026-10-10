/** A file's text as its default export — Vite's `?raw`, which the bundle's `raw` plugin implements too. */
declare module '*?raw' {
    const text: string;
    export default text;
}
