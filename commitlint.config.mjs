import fs from 'node:fs';

// Scopes are package folder names, kept in sync with the repo automatically.
// Note: Nx Release attributes commits to packages by the FILES they touch, not by scope.
// The scope is for humans and changelogs only.
const packages = fs.readdirSync('packages').filter((name) => !name.startsWith('.'));

export default {
    extends: ['@commitlint/config-conventional'],
    rules: {
        'scope-enum': [2, 'always', [...packages, 'demo', 'deps', 'repo', 'release']],
    },
};
