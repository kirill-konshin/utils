import { hasTurbo, toolGate } from '../lib.js';

// lazy so consumers without Turbo don't pay the load cost - re-exported from index.js
export const turboPlugin = hasTurbo ? (await import('eslint-plugin-turbo')).default : null;

/**
 * Turborepo rules. Probe-only gate (see `toolGate` in lib.js) - no evidence scan, no bridge.
 *
 * @param {boolean | import('../index.js').ToggleOptions} [option] the defineLintConfig `turbo` flag; auto-detected when omitted
 * @returns {Promise<import('eslint').Linter.Config[]>}
 */
export async function turboConfig(option) {
    const { enabled } = toolGate(option, false, { tool: 'turbo', has: hasTurbo });
    if (!enabled) return [];
    const turbo = (await import('eslint-plugin-turbo')).default;
    return [
        turbo.configs['flat/recommended'],
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
