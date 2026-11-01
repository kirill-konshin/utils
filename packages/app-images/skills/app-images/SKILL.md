---
name: app-images
description: App icons, favicons, PWA manifest icons, iOS launch screens and Electron icons (macOS 26 Icon Composer `.icon`) from one source image with `@kirill.konshin/app-images`, plus its Next.js metadata helpers. Use when adding or changing an app icon, favicon, manifest icon or launch screen, and when migrating from `generateImages` of `@kirill.konshin/electron-builder` or from hand-written sharp / sips icon scripts.
---

# Install

Add `@kirill.konshin/app-images` to the devDependencies of the package that generates the images (and to the dependencies of a Next.js app that uses the `next` subpath). This skill ships in the package: `skills experimental_sync` (`lint-prepare` runs it), pnpm (`pnpm approve`) or TanStack Intent installs it from `node_modules`.

# Source Image

- Use one square image, 1024 px or larger: PSD, SVG or PNG
- Make the artwork full bleed: no rounded corners, no padding, no shadow. macOS 26, iOS, Android and Chrome apply the platform shape
- Keep the important content in the center 80% (the maskable safe zone)
- Keep the source outside `public/`: `assets-src/icon.*` (Electron) or an `images/` folder
- PSD: macOS `sips` reads it (16-bit too); on other platforms the `psd` package reads it

# Generate

Add one script per app and run it from a package script (`"images": "node scripts/images.ts"`). Commit the generated files.

```ts
import path from 'node:path';
import { generateElectronImages, generateWebImages } from '@kirill.konshin/app-images';

const source = path.resolve(import.meta.dirname, '../assets-src/icon.svg');

await generateWebImages({
    source,
    outDir: path.resolve(import.meta.dirname, '../public'),
    splash: { background: '#f5f5f5' }, // the app background; omit for no iOS launch screens
});
await generateElectronImages({
    source,
    outDir: path.resolve(import.meta.dirname, '../assets'), // electron-builder `buildResources`
    dmgBackground: path.resolve(import.meta.dirname, '../assets-src/dmg.psd'), // optional, 2x
});
```

| Output                                               | Use                                          |
| ---------------------------------------------------- | -------------------------------------------- |
| `favicon-16.png`, `favicon-32.png`, `favicon.ico`    | Browser tab                                  |
| `apple-touch-icon.png`                               | iOS home screen, opaque                      |
| `icon-192.png`, `icon-512.png`, `icon-1024.png`      | Manifest `any`; 512 and 1024 also `maskable` |
| `splash/iphone-<w>x<h>.png`                          | iOS launch screens, opaque                   |
| `icon.icns`                                          | macOS (`mac.icon`), no Xcode needed          |
| `icon.icon/`                                         | Icon Composer bundle, opt-in, needs Xcode 26 |
| `icon.ico`, `icon.png`                               | Windows; Linux and the window icon           |
| `splash.webp`, `background.png`, `background@2x.png` | Electron splash, DMG window background       |

# Next.js

Use the `@kirill.konshin/app-images/next` subpath. It loads no sharp, and its file names are the generator's file names. Do not write icon lists by hand.

```ts
// layout.tsx
import { getIconsMetadata, getStartupImages } from '@kirill.konshin/app-images/next';

export const metadata: Metadata = {
    icons: getIconsMetadata(),
    appleWebApp: { capable: true, startupImage: getStartupImages() },
};

// manifest.ts
import { getManifestIcons } from '@kirill.konshin/app-images/next';

export default function manifest(): MetadataRoute.Manifest {
    return { name: 'App', icons: getManifestIcons() };
}
```

- Icon changed: pass the same `version` to every helper (`getIconsMetadata({ version: 2 })`), it adds `?v=2`. Home screens and browsers keep icons in cache for a long time
- Served from a sub-path: pass `basePath`
- New iPhone size: add it to `SPLASH_SCREENS` in the package, not in the app

# Electron

- `builerConfig` of `@kirill.konshin/electron-builder` sets `mac.icon: 'icon.icns'`; without `builerConfig`, set it yourself
- `icon.icns` is full bleed and opaque: macOS 26 cuts it into the squircle and adds the glass edge itself. It needs no Xcode, it builds on any platform
- An `.icns` with its own shape (round, padded, transparent corners) goes into a grey tile on macOS 26: keep the source full bleed
- Opt-in: `mac: { icon: 'icon.icon' }` uses the Icon Composer bundle. electron-builder compiles it with Xcode 26 `actool` into `Assets.car` and a fallback `.icns`; the build machine (and the CI runner) needs the full Xcode 26, the Command Line Tools are not sufficient (their `/usr/bin/actool` is only a shim)

## Build fails: "Failed to check actool version. Is Xcode 26 or higher installed?"

Cause: `mac.icon` is `icon.icon`, and Xcode 26 is not installed, or the active developer directory is the Command Line Tools (`xcode-select -p` shows `/Library/Developer/CommandLineTools`).

1. Without Xcode: remove the `mac.icon: 'icon.icon'` override, the default `icon.icns` needs no Xcode
2. With Xcode: install Xcode 26 or higher, open it once to install its components
3. Select it: `sudo xcode-select -s /Applications/Xcode.app/Contents/Developer`, then `sudo xcodebuild -license accept` (these need the user's password: tell the user to run them)
    - Without `sudo`, for one build: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer`
4. Check: `actool --version` shows `short-bundle-version` 26 or higher
5. CI: use a macOS runner image with Xcode 26, and select it (`sudo xcode-select -s …` or `DEVELOPER_DIR`) when it is not the default

# Migration

## From `generateImages` of `@kirill.konshin/electron-builder`

| Old                                          | New                                               |
| -------------------------------------------- | ------------------------------------------------- |
| `iconPsdPath`                                | `source` of both functions                        |
| `dmgBackgroundPsdPath`                       | `dmgBackground` of `generateElectronImages`       |
| `electronAssetsPath`                         | `outDir` of `generateElectronImages`              |
| `webPublicPath`                              | `outDir` of `generateWebImages`                   |
| `icon.icns` (a PNG with a wrong extension)   | real full-bleed `icon.icns`                       |
| `favicon.ico` (a PNG with a wrong extension) | real multi-size `favicon.ico`, plus PNG favicons  |
| web `icon.png`                               | `icon-{192,512,1024}.png`, `apple-touch-icon.png` |

1. Add `@kirill.konshin/app-images` to the devDependencies of the package that runs the script
2. Replace the `generateImages` call with the script in [Generate](#generate); use `import.meta.dirname`, not `__dirname`
3. Run the script (it overwrites `assets/icon.icns`), then delete the old web `icon.png`
4. Replace hand-written manifest and metadata icon lists with the [Next.js](#nextjs) helpers
5. Old artwork is a rounded tile with padding (Big Sur template): redraw it full bleed, else macOS 26 shows a small tile inside its own squircle

## From hand-written sharp / sips scripts

1. Replace the script body with the script in [Generate](#generate); `splash` replaces a separate launch-screen script
2. Delete the app's own launch-screen list and media-query helpers; use `getStartupImages()`
3. Replace the `icons` metadata and the manifest `icons` with the helpers
4. Run the script, then delete the old files (for example `favicon-v4-*.png`, `<app>-icon-v4-*.png`). The new file names refresh caches once; use `version` for later changes
5. Remove `sharp` and `psd` from the app if nothing else uses them

## Before the package is published

Link it with yalc: `yalc publish` in the package, `yalc link @kirill.konshin/app-images` in the consumer. Add the dependency to `package.json` only after the release.
