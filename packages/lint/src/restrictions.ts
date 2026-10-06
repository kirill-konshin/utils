import type { Linter } from 'eslint';
import { builtinRules } from 'eslint/use-at-your-own-risk';

/**
 * One structural restriction: a core `no-restricted-*` rule applied under a concern of its own, with the files it
 * governs. Every other field is a flat-config entry field (`files`, `ignores`, ...).
 */
export type Restriction = Omit<Linter.Config, 'name' | 'plugins' | 'rules'> & {
    /** The concern, registered as `restrict/<name>`; entries of one concern share it. */
    name: string;
    /** Tells apart the entries of one concern. */
    label?: string;
    /** The core rule the concern copies, e.g. `no-restricted-imports`. */
    rule: string;
    /** The rule's options. */
    options: unknown[];
};

/**
 * The lint layer: structural rules a syntax or import check decides. Each concern is restricted through its own copy
 * of a core `no-restricted-*` rule, named `restrict/<name>`, because a later flat-config entry replaces an earlier
 * one's options for the same rule — two concerns sharing one core rule would silently drop each other wherever their
 * files overlap. Entries of one concern share its name and differ by `label`.
 */
export function restrictions(entries: Restriction[]): Linter.Config[] {
    return [
        {
            name: 'Lint layer',
            plugins: {
                restrict: {
                    rules: Object.fromEntries(entries.map(({ name, rule }) => [name, builtinRules.get(rule)!])),
                },
            },
        },
        ...entries.map(({ name, label, rule: _rule, options, ...entry }) => ({
            name: `Lint layer: ${label ? `${name} (${label})` : name}`,
            ...entry,
            rules: { [`restrict/${name}`]: ['error', ...options] as Linter.RuleEntry },
        })),
    ];
}
