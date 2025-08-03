import fs from 'node:fs';
import path from 'node:path';

const filesToCopy = [
  '.ctirc',
  '.gitignore',
  'tsconfig.json',
  'turbo.json',
  'vite.config.ts',
  '.storybook/main.ts',
  '.storybook/preview.ts',
];

// TODO Read package.json
// TODO Copy scripts and overall structure of package.json
const projects = {
  bootstrap: { hasStorybook: true },
  core: {},
  electron: {},
  'electron-builder': {},
  mui: { hasStorybook: true },
  next: {},
  react: {},
  'react-native': {},
  tailwind: {},
};

const packagesPath = path.resolve(process.cwd(), '..');

for (const [project, { hasStorybook }] of Object.entries(projects)) {
  const packagePath = path.resolve(packagesPath, project);

  console.log('Project', project, packagePath);

  const indexFile = path.join(packagesPath, 'utils', 'src', project, 'index.ts');
  fs.mkdirSync(path.dirname(indexFile), { recursive: true });
  fs.writeFileSync(indexFile, `// THIS FILE WAS GENERATED, DO NOT EDIT\nexport * from '@kirill.konshin/${project}';\n`);

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
