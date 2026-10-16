# spec-tools contract

What `spec-tools` does in every repository that runs it. It ships with `@kirill.konshin/lint`, so a repository is held to the version it pins. The tests beside the source (`spec-tools/src/*.test.ts`) prove the cases below. The corpus gate's own contract — citations, binding, markers, size lines, the scenario ratchet — is spec-steward's [`contract.md`](../../spec-steward/references/contract.md); how a pipeline wires the commands is [`gitlab.md`](gitlab.md).

## Files

Every file the tools and the audits write is under one folder at the repository root, `.spec-audit/`: one `.gitignore` line, one CI artifacts path. Every intermediate file is YAML — the evidence, the scope, the findings, the verdicts, the merges, the coverage data, the steward review. Markdown is rendered only at the end, for people: `spec-verify.md`, a skill review's `<report>.md`, `coverage.md`, `spec-diff.md` and `mr-comment.md`, each with its `.html` from `spec-tools html`.

## Bases

Every pipeline variable is read in one module (`ci.ts`); GitLab CI's today. The **gate base** is spec-steward's: a merge request's diff base, none in any other pipeline, locally the merge base with `origin/HEAD` (or `origin/main`). The **diff base** of the diff, the focused check and the audit's affected set is a merge request's diff base, else the merge base with its target branch, else a push's tip before it (`HEAD^` on a branch's first push), else `HEAD`.

## Gates — `spec-tools gates`

spec-steward's `check --base auto`, then the change gates; exit 1 when either fails, 2 on a usage error. The change gates are statements about the tree, never unit tests:

- every archived change carries `.openspec.yaml` and `proposal.md`, and a `specs/` directory it carries holds at least one delta file;
- no change, open or archived, sets `skip_specs: true` while carrying a delta file;
- every `MODIFIED` and `REMOVED` heading and every `RENAMED` FROM of an unsynced change the branch touches names a standing requirement. A stale delta in a change the branch does not touch is a warning.

Cases:

- **WHEN** an archived change has no proposal or no schema marker **THEN** the gate fails, naming it
- **WHEN** a `skip_specs` change carries a delta **THEN** the gate fails, naming it
- **WHEN** a touched change's `MODIFIED` heading names a requirement since renamed **THEN** the gate fails, naming the change and the heading

## Workflow evidence — `spec-tools evidence`

A change with deltas is finished inside its merge request. The gate fails while an open change carries delta files, or its deltas are already live in `openspec/specs/` but the change is not archived (an ADDED heading present, a REMOVED one gone, a MODIFIED block already equal). `--classify` instead prints which open changes the branch touches against the gate base, and as its last line `deltas`, `skip-specs` or `none`.

Cases:

- **WHEN** a branch's deltas were synced and the change not archived **THEN** the gate fails
- **WHEN** a branch carries an open change whose deltas were never synced **THEN** the gate fails

## Diff — `spec-tools diff [<base>]`

The specification change against the diff base (or the given ref), by `### Requirement:` heading, each block in full: a heading only the head has is ADDED, only the base has is REMOVED, a block that differs beyond whitespace is MODIFIED, a removed and an added heading with the same body in one file are one RENAMED; a capability whose file moved verbatim is MOVED and counts as no change. Written to `.spec-audit/spec-diff.md` and printed; it always exits 0.

Cases:

- **WHEN** the head adds a heading, drops one and edits a block **THEN** they render as ADDED, REMOVED and MODIFIED
- **WHEN** a removed and an added heading carry the same body **THEN** they render as one RENAMED; a rename that also edits the body stays REMOVED and ADDED
- **WHEN** a capability's file moves verbatim **THEN** it is listed as moved and nothing counts as changed

## Changed — `spec-tools changed`

The author's pre-hand-back check over the affected set (below) — each requirement with its bound tests, where its own terms occur in the comment-stripped sources, and its related requirements, quoted in full. Written to `.spec-audit/parts/changed.yaml` from spec-steward's evidence model (`.spec-audit/evidence.yaml`, written first).

### The affected set

Built in three stages, `judged = UNIT(EXPAND^HOPS(SEED_CONTEXT(diff)))`; each stage only adds, and a tighter value of its variable always gives a subset. `changed` and `scope` read the same three variables; an incorrect value exits 2, naming it, and both print the values they used.

- **SEED** (`AUDIT_AFFECTED_CONTEXT`, default `3`): the requirements a hunk of `openspec/specs/` overlaps (a deletion at its line included), the requirements an unsynced touched delta names, and the requirements a changed line reaches — a line within the context of a change, every line of a changed file with `file`, every line of an untracked file. A line reaches a requirement when it falls in the window of a binding or a citation of it (a test binding's window is its test block; any other's the lines from the citation on), or when it names one of the requirement's distinctive terms on a source line; a source line the diff removed counts too, comments stripped.
- **EXPAND** (`AUDIT_AFFECTED_HOPS`, default `1`): each hop adds the related requirements of the set.
- **UNIT** (`AUDIT_AFFECTED_UNIT`, default `edited`): `requirement` — the set; `edited` — the set, plus every requirement of each capability whose specification the diff edits; `capability` — every requirement of each capability in the set or edited.

Cases:

- **WHEN** a request changes one test of a suite **THEN** the requirements that test binds are in its affected set, and those only its siblings bind are not
- **WHEN** a request removes a source line that names a requirement's distinctive term **THEN** that requirement is in its affected set
- **WHEN** a request edits a capability's specification and `AUDIT_AFFECTED_UNIT` is `edited` **THEN** every requirement of that capability is in its affected set
- **WHEN** `AUDIT_AFFECTED_HOPS` is `0` **THEN** no related requirement is added, and each judged requirement still quotes its related ones

## The audit

### Run class — `spec-tools tier`

Decided once, printed as dotenv lines (`AUDIT_RUN`, `AUDIT_SCOPE`, `AUDIT_GATING`, `AUDIT_MODEL`, `AUDIT_EFFORT`, `AUDIT_MODEL_VERIFY`, `AUDIT_EFFORT_VERIFY`, `AUDIT_SLOTS`); every audit job reads the answer.

| run            | decided by                              | scope    | verifier  | gating   |
| -------------- | --------------------------------------- | -------- | --------- | -------- |
| nightly        | `SPEC_AUDIT_NIGHTLY=true`               | corpus   | expensive | advisory |
| draft          | a draft merge request                   | affected | cheap     | advisory |
| open-change    | a merge request touching an open change | affected | cheap     | advisory |
| merge-request  | a merge request touching none           | affected | cheap     | gating   |
| default-branch | anything else                           | affected | expensive | gating   |

Every run reads on the cheap model. `AUDIT_MODEL_CHEAP`, `AUDIT_EFFORT_CHEAP`, `AUDIT_MODEL_EXPENSIVE` and `AUDIT_EFFORT_EXPENSIVE` override the defaults. `AUDIT_SLOTS` is how many workers a reading job runs at once: as many as `AUDIT_JOB_MEMORY` (default 2 GiB) holds at 300 MB a worker, never more than `AUDIT_WORKERS` (default 2). A merge request whose open changes cannot be classified fails the command rather than reading as one that touches nothing.

### Scope — `spec-tools scope`

The corpus on the nightly, or wherever there is no merge-request target; otherwise the affected set — what `changed` names — judged with cross-capability checks against the corpus its evidence quotes. The evidence is assembled mechanically first: per capability, every requirement in scope verbatim (a capability the affected set holds in part says so in its file), its bound tests at their real lines, where its terms occur, its related requirements; citations are not evidence and are left out. The scope is cut into `AUDIT_JOBS` × `AUDIT_SLOTS` parts — one round of workers across the pipeline's reading jobs (`AUDIT_JOBS`, its own count, default 1) — balanced by load, none larger than one cheap reader holds, a capability larger than that cut between its requirements; only a scope larger than a round holds opens more parts. The cut is a function of the evidence and those two numbers. Written to `.spec-audit/scope.yaml`, `.spec-audit/evidence.yaml` and `.spec-audit/parts/` (one YAML evidence file per capability or slice, and `units.yaml`).

Cases:

- **WHEN** one capability's evidence exceeds one reader **THEN** it is cut between its requirements, each in exactly one piece
- **WHEN** a request changes lines of a source file that cites no requirement **THEN** the requirements whose distinctive terms those lines name are in its affected set, and those whose terms only other lines of the file name are not

### Workers — `spec-tools workers [--complete|--verify]`

One headless `claude --print` worker per part loads the `spec-verify` skill, reads the judging rules (`references/rules/`), and writes its own YAML findings file, `.spec-audit/parts/findings/part-<n>-<reader>.yaml`. When a worker stops, its file is parsed and checked against its schema; on errors the worker's own session is resumed (`claude --resume <session>`) with the error list, at most twice, and a file still invalid counts as not written — the reader as not run, the verdict as missing. In a parallel job (`CI_NODE_INDEX` of `CI_NODE_TOTAL`) it reads only its share: part p goes to job ((p − 1) mod total) + 1. `--complete` judges, as each part's next reader, exactly what the merge listed short — mechanical gaps only: a part with no valid findings file, and requirement ids no reader's judged list names; a reader's claim that it skipped a source is a note in the report and is not read again, since a second reader meets the same limit; `--verify` puts each finding whose capped reader severity is `AUDIT_JUDGE_FROM` or more and whose reader confidence is `AUDIT_JUDGE_MIN_CONFIDENCE` or more to one judge, and logs how many each gate held back. The judge loads no skill: its brief inlines the common and judge rules, leaves out the reader's numbers unless `AUDIT_JUDGE_READER_NUMBERS=show`, and the judge answers with its own `judgeSeverity` and `judgeConfidence` (0–100 each), a reason, and a production scenario for an ERROR-band severity. How many run at once follows the container's memory (300 MB a worker), never more than `AUDIT_WORKERS` (default 2), and each pass logs the job's memory peak against its limit; a worker past `AUDIT_WORKER_TIMEOUT` (20m) is killed and its part judged by the completion pass. A pass that changed any file outside the audit's outputs exits 1, naming the paths; a missing input exits 2. A worker that exits non-zero within its first minute and wrote nothing failed to start (e.g. "Not logged in" when many sessions start at once); it is retried once after `AUDIT_START_RETRY_DELAY` (default 30s, plus up to a third more at random, so the sessions that failed together do not start together again), rather than left to the completion pass.

### Merge — `spec-tools report [--gate] [--worktree]`

Nothing is judged twice. Each finding carries a reading — `readerSeverity` and `readerConfidence`, 0–100 each — and the judge adds a second. The merge, deterministically:

- **Caps** each finding's severity by rules no reading overrides: `spec-dup`, `untested` and an unknown kind stay below the WARN band; `conflict` and a finding against an ⚠️ Advisory requirement stay below the ERROR band; and an ERROR-class kind (`code-mismatch`, `undeclared-gap`) reaches the ERROR band only when two of its quotes are found at their `file:line` in the audited commit (`HEAD`, or the working tree with `--worktree`). Quotes from `.spec-audit/` and from installed dependency code (`node_modules/`) are not the repository's own and count for nothing, so a run in CI and a run on the working tree grade a finding alike. A cap that lowers a severity says why (`regraded`).
- **Fuses** a judged finding's two readings: each weighted by the inverse of its uncertainty (`100 − confidence`, at least 1), `severity = Σ(s/u) / Σ(1/u)`; `confidence = 100 − min(u) − max(0, |s_reader − s_judge| − AUDIT_CONFIDENCE_IGNORE_GAP) / 2` (default gap 20), clamped to 0–100 — never surer than the surer reading, less sure when they disagree beyond about one band's width. The cap applies again; a judge's ERROR-band severity with no production scenario caps the finding below the ERROR band. A finding the verification pass did not reach keeps the reader's reading, and says so.
- **Tiers** each finding by the thresholds: ERROR at `AUDIT_SEVERITY_ERROR` (default 70) or more with a confidence above `AUDIT_CONFIDENCE_SURE` (default 70); WARN at `AUDIT_SEVERITY_WARN` (default 40) or more, or severe but not sure enough; INFO otherwise. An incorrect value exits 2, naming the variable.

A requirement of a part that no reader's judged list names was not judged, whatever coverage the reader claimed. Written to `.spec-audit/spec-verify.yaml` (the data, its `verdict` field the verdict, its `thresholds` the values used) and `.spec-audit/spec-verify.md` (for people, its first line the verdict, then the thresholds); each finding shows its fused reading, each model's reading and the judge's production scenario.

The verdict: `FAIL` when an ERROR stands at a fused confidence above `AUDIT_CONFIDENCE_BLOCKING` (default 80); `ADVISORY` when ERRORs stand and none is above it; `INCOMPLETE` when none stands but a part fell short; `PASS` otherwise. A part falls short only by mechanical signals: no valid findings file (none written, still invalid after corrections, a killed worker), or a requirement id missing from every reader's judged list. What a reader says of its own coverage (`sampled: …`, `not-run: …`) is a claim no tool can prove — a path it names may not exist — so the report lists it under "Readers' coverage notes" and it changes no verdict. `--gate` exits 0 (`PASS`), 1 (`FAIL`), 77 (`ADVISORY`) or 3 (`INCOMPLETE`).

Cases:

- **WHEN** an ERROR-band finding's quote is not at the `file:line` it names **THEN** the report caps it below the ERROR band, naming the quote
- **WHEN** the judge reads a finding **THEN** its severity is the two readings fused, and the more confident reading weighs more
- **WHEN** a finding's reader confidence is below `AUDIT_JUDGE_MIN_CONFIDENCE` **THEN** no judge reads it, and it is no ERROR unless its confidence is above `AUDIT_CONFIDENCE_SURE`
- **WHEN** a part has no findings file and no ERROR stands **THEN** the verdict is `INCOMPLETE` and `--gate` exits 3
- **WHEN** a reader judged every requirement of its part but claims it skipped a source **THEN** the report lists the claim as a note, and the completion pass does not read the part again
- **WHEN** a reader claims it sampled a check **THEN** the claim is a note and the verdict does not change
- **WHEN** the only ERRORs stand at 80% or lower **THEN** the verdict is `ADVISORY` and `--gate` exits 77
- **WHEN** every check ran in full and no ERROR stands **THEN** the verdict is `PASS`

### Local — `spec-tools audit [--here] [--dry]`

The same sequence — scope, reading, merge, completion, merge, verification, gating merge — in a detached worktree of `HEAD`, the outputs copied back; `--here` runs on the working tree, `--dry` stops after the scope.

### spec-steward's corpus-quality audit — `--audit spec-steward`

`scope`, `workers`, `report` and `audit` take `--audit spec-steward` to run spec-steward's audit on the same engine, one repository per run, locally — no pipeline runs it. `workers` and `audit` take `--context <file>`: its text — facts established and the owner's earlier decisions — goes into every worker's and verifier's brief, and a finding or verdict that would reverse one says so. Its scope is the same parts plus one unit per sweep of `skills/spec-steward/sweeps.json`, each reading the files its globs match or the evidence's tests or citations; its workers follow `skills/spec-steward/references/worker.md` and the `common` and `spec-steward` judging rules; its verification puts every finding, not only ERRORs, to a judge that keeps, revises or drops it with a `judgeConfidence`. Its merge drops a finding whose quote is not at its line, folds duplicates (one file, line and theme key), offers three or more findings sharing a theme key as a theme, lists the requirements no worker judged as short, writes `.spec-audit/steward/review-data.yaml` and renders the YAML review `.spec-audit/spec-review.yaml` with `spec-tools steward review render`, items at 70% confidence or lower last, under a comment saying so. It never gates: the review file is the owner's to answer.

Cases:

- **WHEN** a steward finding's quote is not in the block at its line **THEN** the merge drops it, naming the reason
- **WHEN** a verifier answers `drop` **THEN** the finding leaves the review and is kept among the dropped with the verifier's reason
- **WHEN** a part's workers judged one of its requirements nowhere **THEN** it is listed short and the completion pass judges it

## Review glue

- `spec-tools run <skill> [--verdict <report.yaml>] [--advisory]` — one skill-driven review, headless, on `AUDIT_MODEL`; the stream kept as `.spec-audit/claude.jsonl`, the final result as the job log (`.spec-audit/job-log-<job>.md`). The skill writes its report as YAML (`findings[readerSeverity, where, detail, readerConfidence, fields]`, `coverage{complete, notes}`); the report is checked and, on errors, sent back to the same session at most twice. Exits with Claude's status, then gates `--verdict` if given.
- `spec-tools verdict <file> [--advisory]` — the verdict as an exit code: 0 `PASS`, 1 `FAIL`, 77 `ADVISORY` or `FAIL` on an advisory run (`--advisory` or `AUDIT_GATING=advisory`), 3 `INCOMPLETE`, 1 no verdict or no report. For the spec-verify data it reads `verdict`; for a skill's YAML report it computes the verdict itself, never taking it from the model — each finding's one reading gets its tier by the merge's thresholds, an ERROR is `FAIL` above `AUDIT_CONFIDENCE_BLOCKING` and `ADVISORY` otherwise, and `coverage.complete: false` is `INCOMPLETE` — and renders the Markdown report beside it (`<report>.md`, its first line the verdict).
- `spec-tools comment <name>=<report.md>...` — the merge-request comment: one row per review from its verdict line, links into the job's artifacts, the coverage report and the diff beneath; written to `.spec-audit/mr-comment.md`.
- `spec-tools html <file.md>...` — each report as self-contained HTML beside it.

Cases:

- **WHEN** a review's report says `FAIL` on an advisory run **THEN** `verdict` exits 77
- **WHEN** a skill's report holds one ERROR-band finding at 70% confidence and nothing else **THEN** `verdict` computes `PASS` and exits 0
- **WHEN** a review wrote no report **THEN** `verdict` exits 1
