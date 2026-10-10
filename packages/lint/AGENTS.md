- Files in `rules` dir must adhere to rules as defined for `.agents/rules` in `rules/agent.md`, since after installation this is how they will be consumed

# spec-steward and spec-tools

- Which owns what: `/spec-author` (`commands/spec-author.md`) sequences writing a specification; `spec-steward` judges whether the rules are right and proposes spec changes (gate, hook, corpus audit, review rounds, align) and never fails a build on judgment; `spec-verify` judges whether the code does what the rules say, and its verdict gates CI; `spec-tools` is the machinery around both. In CI: steward's `check`, `coverage` and `evidence`, and the spec-verify audit; the steward audit is local only. A principle both audits judge is worded once — spec-steward's `criteria.md` — and `spec-verify` names it verbatim (`auditReport.test.ts` holds them equal)
- Where things are:
    - `skills/spec-steward/` — the corpus gate: plain `.mjs`, unbuilt, run as the `spec-steward` bin; its contract is `references/contract.md`
    - `spec-tools/src/` — the `spec-tools` CLI, TypeScript, bundled by `tsdown.config.ts` into `spec-tools/dist/`
    - `skills/spec-tools/` — its consumer skill: setup, the contract (`references/contract.md`), the GitLab pipeline (`references/gitlab.md`)
    - `skills/spec-verify/` — the code-conformance worker contract: the checks, tiers, finding kinds and findings file
    - `spec-tools/src/stewardAudit.ts` — spec-steward's audit on the same engine; its worker contract is `skills/spec-steward/references/worker.md`, its sweeps `skills/spec-steward/sweeps.json`
- A contract changes in the same change as the code it describes; its cases are what the tests beside the code prove
- spec-tools reuses spec-steward's modules (`resolveBase`, `slugify`) instead of a second implementation, and reads spec-steward's output only as its CLI writes it (`spec-evidence.json`)
- Every pipeline variable is read in `spec-tools/src/ci.ts`, or spec-steward's `resolveBase`; nowhere else
- The bundle stays self-contained — CI jobs run it from an unpacked tarball with no install: `typescript` is its only external, loaded only by `scope` and `changed`; a new runtime dependency is a dev dependency the bundle inlines
- Nothing shipped names a consumer repository, a company, an internal host or a ticket: this package is public
- Messages and docs name the bins (`spec-tools scope`), never a consumer's package scripts
- Tests use throwaway git repositories and a stand-in `claude` on `PATH`; nothing calls a model
