export default {
    printWidth: 120,
    tabWidth: 2,
    singleQuote: true,
    overrides: [
        {
            files: '*.{js,jsx,ts,tsx,cjs,cts,mjs,mts,html,md,mdx}',
            options: {
                tabWidth: 4,
            },
        },
    ],
};
