# @kirill.konshin/app-images

App icons for web, PWA and Electron from one full-bleed square image (PSD, PNG, SVG, ...).

The artwork has no rounded corners and no padding: macOS 26, iOS, Android and Chrome cut the platform shape themselves.

## Agent skill

The package ships the `app-images` skill (`skills/app-images/SKILL.md`): usage, migration from older approaches, build troubleshooting. Install it from `node_modules` with `@kirill.konshin/lint` (`lint-prepare` does it), pnpm (`pnpm approve`), TanStack Intent, or the `skills` CLI (a devDependency) in your own `postinstall`:

```json
{ "scripts": { "postinstall": "skills experimental_sync -y -r" } }
```

## Generate

```ts
import { generateElectronImages, generateWebImages } from '@kirill.konshin/app-images';

await generateWebImages({ source: 'icon.psd', outDir: 'public', splash: { background: '#f5f5f5' } });
await generateElectronImages({ source: 'icon.psd', outDir: 'assets', dmgBackground: 'dmg.psd' });
```

- PSD: macOS `sips` (reads 16-bit), `psd` elsewhere
- Web: `favicon-16.png`, `favicon-32.png`, `favicon.ico`, `apple-touch-icon.png`, `icon-{192,512,1024}.png`, `splash/iphone-*.png`
- Electron: `icon.icns` (`mac.icon`, macOS 26 cuts the squircle, no Xcode), `icon.icon` (Icon Composer bundle, opt-in, needs Xcode 26 `actool` at build), `icon.ico`, `icon.png`, `splash.webp`, `background.png`, `background@2x.png`

## Next.js

`@kirill.konshin/app-images/next` loads no sharp; shapes match `Metadata` and `MetadataRoute.Manifest`.

```ts
import { getIconsMetadata, getManifestIcons, getStartupImages } from '@kirill.konshin/app-images/next';

const version = 4; // bump after changing the icon, appended as `?v=`

export const metadata: Metadata = {
    icons: getIconsMetadata({ version }),
    appleWebApp: { capable: true, startupImage: getStartupImages({ version }) },
};

export default function manifest(): MetadataRoute.Manifest {
    return { name: 'App', icons: getManifestIcons({ version }) };
}
```
