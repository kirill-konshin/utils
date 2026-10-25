import type { Linter } from 'eslint';

import type { ToggleOptions } from '../config.js';
import { turboGate } from '../gates.js';
import { hasTurbo } from '../lib.js';

// lazy so consumers without Turbo don't pay the load cost - re-exported from index.js
export const turboPlugin = hasTurbo ? (await import('eslint-plugin-turbo')).default : null;

/**
 * Turborepo rules. Probe-only gate (see `turboGate` in gates.js) - no evidence scan, no bridge.
 *
 */
export async function turboConfig(option?: boolean | ToggleOptions): Promise<Linter.Config[]> {
    const { enabled } = turboGate(option);
    if (!enabled) return [];
    const turbo = (await import('eslint-plugin-turbo')).default;
    const recommended = turbo.configs?.['flat/recommended'];
    // Turbo's declaration permits both legacy and flat shapes; this entry is flat at runtime.
    const base = (Array.isArray(recommended) ? recommended : [recommended ?? {}]) as unknown as Linter.Config[];
    return [
        ...base,
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
