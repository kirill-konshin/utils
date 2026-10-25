import type { Linter } from 'eslint';

import type { ToggleOptions } from '../config.js';
import { storybookGate } from '../gates.js';

/**
 * Storybook recommended rules. Full evidence-based gate (see `storybookGate` in gates.js), mirroring
 * Tailwind: a `.storybook/main.*` marks a Storybook repo even when the `storybook` package is
 * installed only in a leaf package (invisible to `hasStorybook`) - and because
 * `eslint-plugin-storybook` statically imports the `storybook` package itself, `storybook` must
 * be resolvable from the workspace root (hoisted); a leaf-only install is a hard error with
 * hoisting guidance (see `storybookGate` in gates.js). The plugin stays lazily imported so consumers
 * without Storybook never pay for it.
 *
 */
export async function storybookConfig(option?: boolean | ToggleOptions, strict = false): Promise<Linter.Config[]> {
    const { enabled } = storybookGate(option, strict);
    if (!enabled) return [];

    const storybookPlugin = (await import('eslint-plugin-storybook')).default;
    // Storybook still publishes ESLint 9 rule types; the runtime flat configs are valid in ESLint 10.
    return storybookPlugin.configs['flat/recommended'] as unknown as Linter.Config[];
}
