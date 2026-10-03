/*
 * File extension lists shared by the ESLint blocks and the Prettier / lint-staged configs. Free of imports and side
 * effects, so the `./prettier` and `./lint-staged` entries load nothing else.
 */
export const tsExtsRaw = 'js,jsx,ts,tsx,cjs,cts,mjs,mts'; // TODO mdx, needs loader
export const markupExtsRaw = 'md,mdx,htm,html,vue';
export const eslintExtsRaw = `${tsExtsRaw},${markupExtsRaw}`;
export const prettierExtsRaw = 'css,scss,sass,less,yml,yaml,json,json5,jsonc,graphql,graphqls,xml';

export const tsExts = `{${tsExtsRaw}}`;
export const eslintExts = `*.{${eslintExtsRaw}}`;
export const prettierExts = `*.{${prettierExtsRaw}}`;
