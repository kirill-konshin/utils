import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const packagesDirectory = resolve(rootDirectory, 'packages');

const collectPaths = (value, paths = []) => {
    if (typeof value === 'string') {
        if (value.startsWith('./')) paths.push(value);
        return paths;
    }

    if (value && typeof value === 'object') {
        for (const nestedValue of Object.values(value)) collectPaths(nestedValue, paths);
    }

    return paths;
};

const packageDirectories = (await readdir(packagesDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

const missingOutputs = [];
let packageCount = 0;

for (const packageDirectory of packageDirectories) {
    const directory = resolve(packagesDirectory, packageDirectory.name);
    const packageJson = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));

    if (packageJson.private) continue;

    packageCount += 1;

    const outputPaths = new Set(
        collectPaths({
            exports: packageJson.exports,
            main: packageJson.main,
            module: packageJson.module,
            types: packageJson.types,
            bin: packageJson.bin,
        }),
    );

    for (const outputPath of outputPaths) {
        try {
            await access(resolve(directory, outputPath));
        } catch {
            missingOutputs.push(`${packageJson.name}: ${outputPath}`);
        }
    }
}

if (missingOutputs.length > 0) {
    console.error(`Missing package build outputs:\n${missingOutputs.map((output) => `- ${output}`).join('\n')}`);
    process.exitCode = 1;
} else {
    console.log(`Verified build outputs for ${packageCount} packages.`);
}
