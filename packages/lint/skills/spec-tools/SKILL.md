---
name: spec-tools
description: The machinery around both audits — set up and run the `spec-tools` CLI of `@kirill.konshin/lint` in an OpenSpec repository — the change gates and workflow-evidence gate beside spec-steward's corpus gate, the requirement-level specification diff, the `spec-verify` code-conformance audit (run class, scope, workers, merge, verdict), and the glue a CI pipeline runs around a headless AI review (verdict gate, merge-request comment, HTML reports). Use when wiring these into a repository or its pipeline, when a `spec-tools` command fails or its output needs reading, or when deciding which run class an audit is.
---

# spec-tools

One CLI, `spec-tools`, installed with `@kirill.konshin/lint` beside `spec-steward`. What each command does, reads and writes, and its exit codes are [references/contract.md](references/contract.md); a GitLab pipeline is [references/gitlab.md](references/gitlab.md). Four things live elsewhere:

- the corpus gate — citations, binding, markers, the scenario ratchet — is the `spec-steward` skill;
- what an audit judges — the production effect, the tiers, the confidence, the checks — is the judging rules in [references/rules/](references/rules): `common.md`, then one file per audit role (`spec-verify.md`, `spec-verify-judge.md`, `spec-steward.md`);
- how an audit worker runs and writes its findings file is the `spec-verify` skill, which `spec-tools workers` hands every worker;
- how the repository makes a change is its own `AGENTS.md`.

## Commands

| Need | Command |
| --- | --- |
| The gate a merge request runs | `spec-tools gates` (spec-steward's check, then the change gates) |
| Is this branch's change finished? | `spec-tools evidence` |
| What changed in the specifications, by requirement | `spec-tools diff [<base>]` |
| Check a spec edit before handing it back | `spec-tools changed`, then `/spec-verify changed` |
| The full code-conformance audit, locally | `spec-tools audit` (`--here` for uncommitted edits, `--dry` to stop after the scope) |
| spec-steward's corpus-quality audit, on the same engine | `spec-tools audit --audit spec-steward`, then consolidate `.spec-audit/spec-review.yaml` as the `spec-steward` skill says |
| One pass of a CI audit | `spec-tools tier`, `scope`, `workers [--complete\|--verify]`, `report [--gate]` |
| A headless skill review in CI | `spec-tools run <skill> --verdict .spec-audit/<report>.yaml` |
| Gate a review's report | `spec-tools verdict .spec-audit/spec-verify.yaml` or `.spec-audit/<report>.yaml` |
| The merge-request comment and HTML reports | `spec-tools comment <name>=<report.md>...`, `spec-tools html <file.md>...` |

In CI: `gates`, `evidence`, `diff`, `tier`, `scope`, `workers`, `report`, `verdict`, `comment`, `html`, for spec-verify. Locally: any of them, plus `audit --audit spec-steward`, which never runs in CI.

spec-steward's commands run as `spec-tools steward <command>` — the `spec-steward` skill documents them.

Run them through the package manager (`yarn spec-tools gates`), the bin (`node_modules/.bin/spec-tools`), or the file itself, `node <this skill's folder>/scripts/cli.js`, which needs no install; they act on the repository of the current directory.

## Setting a repository up

1. Pin `@kirill.konshin/lint`; `lint-prepare` links the `spec-steward`, `spec-tools` and `spec-verify` skills.
2. Declare what binds beyond spec-steward's defaults once, in the root `package.json`: `"spec-steward": { "binds": ["scripts/checks/**", "**/*.Dockerfile", ".gitlab-ci.yml"] }`.
3. List the gates in the repository's `AGENTS.md` checks: `openspec validate --strict --all`, `spec-tools gates`, and after a requirement changes `spec-tools changed` with `/spec-verify changed` and `spec-tools diff`.
4. Ignore the generated files with one `.gitignore` line, `.spec-audit/`: every file the tools and the audits write is under it — YAML data, the Markdown and HTML reports, `claude.jsonl`, the job logs. In CI, publish `.spec-audit/` as each audit job's artifacts path.
5. Wire the pipeline: [GitLab](references/gitlab.md). Other CI providers are not supported yet — `spec-tools` reads GitLab's pipeline variables.

## Reading a failure

- `gates` — spec-steward's findings come first (the `spec-steward` skill says what each kind asks), then one line per change gate with what violates it and a hint.
- `evidence` — an open change carries deltas, or is synced but not archived: archive it before the branch merges.
- `report --gate` / `verdict` — exit 1 is a confirmed ERROR on a gating run, 77 the same on an advisory run, 3 `INCOMPLETE` (the report names the check that fell short). An ERROR stands only when its judge confirmed it above 70% confidence. Summarize `.spec-audit/spec-verify.md` as the `spec-verify` skill's _Interactive use_ says.
- `workers` exit 1 — a worker changed a file outside `.spec-audit/`; the paths are listed.
- `workers` log line `still invalid: …` — a worker's YAML file failed its schema after two corrections; the part counts as not read, and the completion pass reads it again.

## Language

Write finding details, verdict reasons, review items and messages to the reviewer in ASD-STE100 ([common rules](references/rules/common.md#language)).
