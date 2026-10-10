- Files in `rules` dir must adhere to rules as defined for `.agents/rules` in `rules/agent.md`, since after installation this is how they will be consumed

# spec-steward and spec-tools

- Which owns what: `/spec-author` (`commands/spec-author.md`) sequences writing a specification; `spec-steward` judges whether the rules are right and proposes spec changes (gate, hook, corpus audit, review rounds, align) and never fails a build on judgment; `spec-verify` judges whether the code does what the rules say, and its verdict gates CI; `spec-tools` is the machinery around both. In CI: steward's `check`, `coverage` and `evidence`, and the spec-verify audit; the steward audit is local only. What every audit judges is worded once, in the judging rules `skills/spec-tools/references/rules/` (`common.md`, then one file per audit role); skills and briefs hold only the mechanics and link the rules. A check both audits judge is worded once — spec-steward's item in `rules/spec-steward.md` — and the `spec-verify` rules name it verbatim (`auditReport.test.ts` holds them equal)
- Where things are:
    - `spec-tools/src/steward/` — spec-steward, the corpus gate, run as `spec-tools steward`; its skill is `skills/spec-steward/`, its contract `references/contract.md` there
    - `spec-tools/src/` — the `spec-tools` CLI, TypeScript, bundled by `tsdown.config.ts` into the one file `skills/spec-tools/scripts/cli.js`, the package's only spec bin
    - `skills/spec-tools/` — its consumer skill: setup, the contract (`references/contract.md`), the GitLab pipeline (`references/gitlab.md`)
    - `skills/spec-verify/` — the code-conformance worker's mechanics: the material it reads and the findings file it writes
    - `skills/spec-tools/references/rules/` — the judging rules: what a finding is, its tier and its confidence, per audit role
    - `spec-tools/src/data.ts` — every YAML read and write, and the schema each model-written file is checked against; `spec-tools/src/files.ts` — every path, all under `.spec-audit/`
    - `spec-tools/src/stewardAudit.ts` — spec-steward's audit on the same engine; its worker contract is `skills/spec-steward/references/worker.md`, its sweeps `skills/spec-steward/sweeps.json`
- A contract changes in the same change as the code it describes; its cases are what the tests beside the code prove
- spec-tools reuses spec-steward's modules (`resolveBase`, `slugify`) instead of a second implementation, and reads spec-steward's output only as its CLI writes it (`.spec-audit/evidence.yaml`)
- Every pipeline variable is read in `spec-tools/src/ci.ts`, or spec-steward's `resolveBase`; nowhere else
- The bundle stays one self-contained file — a CI job runs it from the package's `skills/`, handed on as an artifact, with no install: `typescript` is its only external, loaded only by `scope` and `changed`; a new runtime dependency is a dev dependency the bundle inlines
- Nothing shipped names a consumer repository, a company, an internal host or a ticket: this package is public
- Messages and docs name the bins (`spec-tools scope`), never a consumer's package scripts
- Tests use throwaway git repositories and a stand-in `claude` on `PATH`; nothing calls a model
- Every file spec-tools writes is under `.spec-audit/`; every intermediate file is YAML, written through `data.ts`; Markdown only as the final report for people
- A file a model writes has a schema in `data.ts`; the tool checks it when the model stops and sends the errors back to the same session
