import type { Linter } from 'eslint';

import type { TailwindOptions } from '../config.js';
import { tailwindGate } from '../gates.js';

// the gate and the entry finder are shared with the Vite+ config
export { findTailwindEntry, tailwindGate } from '../gates.js';

/**
 * Tailwind recommended rules (warnings + `no-contradicting-classname` as error) as a standalone
 * block (simple to override wholesale).
 *
 * Auto-detection is driven by the entry CSS (see `findTailwindEntry` in gates.js), not by the package
 * probe: explicit `cssConfigPath` wins, otherwise auto-find. Zero entries stays inert in auto mode
 * (nothing marks the repo as Tailwind) but fails loudly when Tailwind was FORCED on (`true` /
 * options object). SEVERAL entries fail loudly even in auto mode: they prove the repo uses
 * Tailwind, the right one cannot be guessed, and a silent skip would be hard to detect - pass
 * `cssConfigPath` to pick one. `tailwindcss` must be resolvable from the workspace root (where
 * the plugin's theme-loading workers resolve it); a leaf-only install is a hard error with
 * hoisting guidance (see `tailwindGate` in gates.js).
 *
 */
export async function tailwindConfig(option?: boolean | TailwindOptions, strict = false): Promise<Linter.Config[]> {
    const gate = tailwindGate(option, strict);
    if (!gate) return [];

    const { cssConfigPath, packageDir } = gate;
    const basePath = packageDir ? { basePath: packageDir } : {};

    const tailwindPlugin = (await import('eslint-plugin-tailwindcss')).default;
    return [
        {
            // The plugin still publishes @typescript-eslint's ESLint 9 config types.
            ...(tailwindPlugin.configs.recommended as unknown as Linter.Config),
            ...basePath,
            settings: { tailwindcss: { cssConfigPath } },
        },
    ];
}
