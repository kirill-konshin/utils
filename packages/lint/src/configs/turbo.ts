import type { Linter } from 'eslint';
import type turboPlugin from 'eslint-plugin-turbo';

import type { ToggleOptions } from '../config.js';
import { turboGate } from '../gates.js';

/** `eslint-plugin-turbo`, loaded on demand: consumers without Turbo never pay for it. */
export const loadTurboPlugin = async (): Promise<typeof turboPlugin> => (await import('eslint-plugin-turbo')).default;

/**
 * Turborepo rules. Probe-only gate (see `turboGate` in gates.js) - no evidence scan.
 */
export async function turboConfig(option?: boolean | ToggleOptions): Promise<Linter.Config[]> {
    const { enabled } = turboGate(option);
    if (!enabled) return [];
    const turbo = await loadTurboPlugin();
    return [
        // Turbo's declaration permits both legacy and flat shapes; this entry is one flat config at runtime
        (turbo.configs?.['flat/recommended'] ?? {}) as unknown as Linter.Config,
        {
            name: 'eslint-plugin-turbo overrides',
            rules: {
                /*
                 * Only covers undeclared env vars, not the full dependsOn/outputs consistency - that part has no
                 * ESLint-shaped check. Downgraded from their default 'error' to 'warn'.
                 */
                'turbo/no-undeclared-env-vars': 'warn',
            },
        },
    ];
}
