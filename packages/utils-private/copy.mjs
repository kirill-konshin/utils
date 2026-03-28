import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';

const filesToCopy = [
    '.ctirc',
    '.gitignore',
    'tsconfig.json',
    'turbo.json',
    'vite.config.ts',
    '.storybook/main.ts',
    '.storybook/preview.ts',
];

const packagesPath = path.resolve(process.cwd(), '..');

// Discover all packages in the packages directory
const packageJsonFiles = await glob('*/package.json', {
    cwd: packagesPath,
    absolute: false,
});

for (const packageJsonPath of packageJsonFiles) {
    const project = path.dirname(packageJsonPath);
    const packagePath = path.resolve(packagesPath, project);
    const packageJsonFullPath = path.join(packagePath, 'package.json');

    // Read package.json to check for flags
    const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf-8'));

    packageJson.repository = {
        type: 'git',
        url: 'https://github.com/kirill-konshin/utils.git',
        directory: `packages/${project}`,
    };

    fs.writeFileSync(packageJsonFullPath, JSON.stringify(packageJson, null, 2) + '\n');

    // Skip packages with skipGenerate flag
    if (packageJson.skipGenerate) {
        console.log(`Skipping ${project} (skipGenerate: true)`);
        continue;
    }

    // Skip utils-private (self)
    if (project === 'utils-private' || project === 'utils') {
        console.log(`Skipping ${project} (self)`);
        continue;
    }

    const hasStorybook = packageJson.hasStorybook || false;
    const exportVar = project.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

    console.log('Project', project, packagePath);

    const indexFile = path.join(packagesPath, 'utils', 'src', project, 'index.ts');
    fs.mkdirSync(path.dirname(indexFile), { recursive: true });
    fs.writeFileSync(
        indexFile,
        `// THIS FILE WAS GENERATED, DO NOT EDIT\nexport * as ${exportVar} from '@kirill.konshin/${project}';\n`,
    );

    for (const file of filesToCopy) {
        const sourceFile = path.join(packagesPath, 'utils', file);
        const destFile = path.join(packagePath, file);

        if (hasStorybook && file.startsWith('.storybook/')) {
            const storybookPath = path.dirname(destFile);
            if (!fs.existsSync(storybookPath)) {
                fs.mkdirSync(storybookPath, { recursive: true });
                console.log(`  Created directory: ${storybookPath}`);
            }
        }

        if (hasStorybook || !file.startsWith('.storybook/')) {
            fs.copyFileSync(sourceFile, destFile);
            console.log(`  Copied ${file} to ${destFile}`);
        }
    }
}
