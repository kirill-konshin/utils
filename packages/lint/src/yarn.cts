import type { Yarn } from '@yarnpkg/types';

type Dependency = Yarn.Constraints.Dependency;
type Workspace = Yarn.Constraints.Workspace;
type YarnApi = Yarn.Constraints.Yarn;

const DEFAULT_CONSISTENT_DEPENDENCIES = [
    '@types/node',
    '@types/react',
    '@types/react-dom',
    'next',
    'eslint',
    'typescript',
    'vite',
];

const ROOT_CWD = '.';
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];

function dependencyIdent(selector: string): string | null {
    const match = selector.match(/(?:^|\/)((?:@[^/]+\/)?[^/@]+)(?:@.+)?$/);
    return match?.[1] ?? null;
}

function rootDependencyRange(root: Workspace, ident: string): string | null {
    for (const field of DEPENDENCY_FIELDS) {
        const range = root.manifest[field]?.[ident];
        if (typeof range === 'string') return range;
    }
    return null;
}

function overrideRange(root: Workspace, value: string): string | null {
    if (!value.startsWith('$')) return value;

    const ident = value.slice(1);
    const range = rootDependencyRange(root, ident);
    if (range === null) root.error(`Override ${value} must reference a root dependency`);
    return range;
}

function collectOverrides(root: Workspace, overrides: Record<string, unknown>, ranges: Map<string, string>): void {
    for (const [selector, value] of Object.entries(overrides)) {
        if (typeof value === 'string') {
            const ident = dependencyIdent(selector);
            const range = overrideRange(root, value);
            if (ident !== null && range !== null) ranges.set(ident, range);
            continue;
        }

        if (value === null || typeof value !== 'object' || Array.isArray(value)) {
            root.error(`Override ${selector} must be a string or object`);
            continue;
        }

        const nestedOverrides = value as Record<string, unknown>;
        if (typeof nestedOverrides['.'] === 'string') {
            const ident = dependencyIdent(selector);
            const range = overrideRange(root, nestedOverrides['.']);
            if (ident !== null && range !== null) ranges.set(ident, range);
        }

        collectOverrides(
            root,
            Object.fromEntries(Object.entries(nestedOverrides).filter(([nestedSelector]) => nestedSelector !== '.')),
            ranges,
        );
    }
}

function collectResolutions(root: Workspace, ranges: Map<string, string>): void {
    for (const [selector, range] of Object.entries(root.manifest.resolutions ?? {})) {
        const ident = dependencyIdent(selector);
        if (ident === null || typeof range !== 'string') {
            root.error(`Resolution ${selector} must map to a string range`);
            continue;
        }
        ranges.set(ident, range);
    }
}

function comparableDependencies(yarn: YarnApi, ident: string): Dependency[] {
    return yarn.dependencies({ ident }).filter((dependency) => dependency.type !== 'peerDependencies');
}

function fallbackRange(root: Workspace, dependencies: Dependency[]): string | undefined {
    const rootRange = dependencies.find((dependency) => dependency.workspace.cwd === ROOT_CWD)?.range;
    if (rootRange !== undefined) return rootRange;

    return [...dependencies].sort(
        (a, b) => a.workspace.cwd.localeCompare(b.workspace.cwd) || a.type.localeCompare(b.type),
    )[0]?.range;
}

/**
 * Build a Yarn JavaScript constraints config that mirrors root overrides and resolutions in leaf
 * dependency declarations. Without an overrides field, the default dependency set is kept on one
 * consistent range instead.
 */
export function defineYarnConfig(): Yarn.Config {
    return {
        async constraints({ Yarn }) {
            const root = Yarn.workspace({ cwd: ROOT_CWD });
            if (root === null) throw new Error('Yarn constraints could not find the root workspace');

            const ranges = new Map();
            collectResolutions(root, ranges);

            if (Object.hasOwn(root.manifest, 'overrides')) {
                const overrides = root.manifest.overrides;
                if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
                    root.error('Root overrides must be an object');
                } else {
                    collectOverrides(root, overrides, ranges);
                }
            } else {
                for (const ident of DEFAULT_CONSISTENT_DEPENDENCIES) {
                    if (ranges.has(ident)) continue;
                    const range = fallbackRange(root, comparableDependencies(Yarn, ident));
                    if (range !== undefined) ranges.set(ident, range);
                }
            }

            for (const [ident, range] of ranges) {
                for (const dependency of comparableDependencies(Yarn, ident)) {
                    if (dependency.workspace.cwd !== ROOT_CWD) dependency.update(range);
                }
            }
        },
    };
}
