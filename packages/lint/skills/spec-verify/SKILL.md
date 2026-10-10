---
name: spec-verify
description: Audit whether the code does exactly what the OpenSpec specifications say, as written; its verdict gates CI. Checks what no tool can - cross-capability contradiction, EXACT code conformance, whether a bound test asserts its rule, and gaps nobody recorded. It audits code conformance only; corpus quality — placement, REQUIRED versus ⚠️ ADVISORY, evidence — is the spec-steward skill's audit. Workers only judge; each writes audit-parts/findings/part-<n>-<reader>.json and `spec-tools report` renders spec-verify.md at the repo root. Interactively, run `spec-tools audit`, then summarize spec-verify.md and ask the operator what to do. After changing a capability, `/spec-verify changed` judges what changed; the full audit runs when the operator asks.
model: claude-haiku-4-5-20251001
effort: high
---

# Verify spec adherence

The capability specifications under `openspec/specs/` are the single source of truth. The tooling's contract — this audit's scope, partition, merge and verdict — is the `spec-tools` skill's `references/contract.md`; the grading and the finding kinds are below; how a specification is written is the `spec-steward` model (its `references/model.md`); how a change is made is the repository's `AGENTS.md`. A code citation is an optional pointer to a requirement, never evidence that code complies.

**Where it runs:** in CI as the gating audit (the reading jobs and the judge job), and locally as `spec-tools audit` and `/spec-verify changed`. spec-steward's corpus audit is the local, owner-requested counterpart; it never runs in CI.

**Invariant this skill enforces: CODE 100% follows the SPEC.** A requirement and its code must match exactly; a mismatch is always a finding (the owner decides which side is fixed — never leave them divergent).

The audit itself is **read-only**: no worker changes code or specs, and neither do you while it runs; a worker writes its own findings file and nothing else. Fixes come afterwards, only when the operator chooses them — see _Interactive use_.

There are three ways in. A worker — its brief names a part and a findings file — follows _The worker contract_. `/spec-verify changed` is _Focused mode_. `/spec-verify` from an operator is _Interactive use_.

## What this skill does NOT check

These run deterministically in CI. Do not re-derive them, and do not report what they own — a finding they cover is noise, not signal:

- `openspec validate` and `spec-tools gates` — the corpus gates: OpenSpec's structure check, then spec-steward's check and the change gates. What a citation is, how a test binds to a scenario, the markers, the size lines and the scenario ratchet are the `spec-steward` contract.
- `spec-tools scope` — **this run's scope, its partition, and the evidence each part is judged from.** Nothing here is searched for; it is read.
- `spec-tools report` — **the merge.** It looks every ERROR's quotes up at their `file:line` in the audited commit, tiers by the kinds below, takes the weakest part's coverage, computes the verdict and renders `spec-verify.md`. No reader judges twice.
- `spec-steward coverage` — the coverage report: which requirements and scenarios a test binds, the ⚠️ Advisory requirements and the recorded known gaps. The audit does not read it.
- Corpus quality — whether a rule sits in the right place, whether it is REQUIRED or ⚠️ Advisory, whether its evidence is the right kind — is the `spec-steward` skill's audit.

**Why the split matters.** This skill is an LLM audit: one reader over the whole corpus samples, and two such runs over the same commit can reach different verdicts. Everything mechanically decidable was moved out of it and into code — including finding the evidence. What remains needs judgment — read in full, one worker per part, and graded so that only what you can demonstrate stops a pipeline.

## Scope

In CI, `spec-tools tier` chooses each pass's scope, model and effort — the run classes are the `spec-tools` contract's — and this frontmatter applies to an in-chat run only. The scope is partitioned before any worker starts, in `audit-scope.json`: its `parts` list the parts, one worker each, with the evidence files each part judges. Ignore build output (any `dist/`, `node_modules`, and whatever else the repository's `AGENTS.md` names as generated).

## Focused mode — `/spec-verify changed`

Invoked with the argument `changed`, this skill is an author's pre-hand-back check, not the gate. `spec-tools changed` has already written `audit-parts/changed.md` — you do not run it —: the requirements the working tree changed, each with the tests bound to it, where its own terms occur, and its related requirements quoted in full. You are the one reader: Read that file, run checks 2, 3 and 4 over exactly those requirements against what is quoted, and print the findings in the conversation — no workers, no findings file, no report. Say plainly when a changed sentence contradicts a related requirement, when it duplicates one, and when the code does not do what the new text says.

## The material — read, never produced

Two inputs, both written by `spec-tools scope` and, in CI, handed to the audit jobs as artifacts:

- `audit-scope.json` — the scope and its `parts`: for each, its number, the `files` its worker reads and the `requirementIds` it judges.
- `audit-parts/<capability>.md`, one per capability in scope — **the evidence.** Each carries every requirement verbatim with its id and `file:line`, and under each: **Bound tests** — the tests bound to the requirement or to one of its scenarios, quoted with the files' own line numbers (the enclosing test, or a window marked as such); **Where its terms occur** — the lines of the sources, comments stripped, where the requirement's own terms occur, or the note that it names none; and the related requirements elsewhere that share its terms, each with its statement.

You NEVER produce or regenerate these — no `spec-tools scope`, no `spec-steward coverage`, no `spec-tools report`: a worker's shell is `git` and nothing else. If a file is absent, say so in the coverage, grade every check that depends on it as not run, and — locally — tell the user to run `spec-tools scope` first.

**Read everything with Read / Glob / Grep — do not shell out.** A worker runs under `claude --print`, which cannot be prompted for permission: a command outside the job's `--allowedTools` stalls the run and no report is written. An evidence file longer than one Read returns is read in full with `offset`/`limit` — never sampled.

A **requirement** is one `### Requirement:` heading and everything under it. Address it as `<capability>#<slug>` (e.g. `billing/refunds#requirement-a-refund-is-applied-once`) — the slug is stable, so never invent positional ids.

## The worker contract

One reader cannot hold the whole corpus and every symbol it governs; a run that tries samples, and a sample cannot support a `PASS`. So the evidence is assembled mechanically before the audit starts, and `spec-tools workers` starts one headless worker per part. The passes run in order — the reading, shared out among parallel reading jobs, the completion pass over what the reading left short, and the verification pass over every ERROR still standing. Each later brief names exactly what it judges, and the tool runs every pass, never a worker.

A worker's brief gives its part number, its reader number, the findings file it alone writes, its part's evidence files and its `requirementIds`. It judges all five checks over its evidence in one pass: the specification against itself (checks 2 and 3, from the requirement blocks and related lists the evidence carries) and the code against the specification (1, 4 and 5) — every requirement, every bound test and every listed related pair. It opens a source only where an excerpt is marked as a window, where a term hit must be confirmed, where the behaviour continues outside the excerpt, or where a related requirement's statement line is not enough to decide. Its tools are Skill, Read, Glob, Grep, Write, Edit (to repair its own findings file) and the git commands; anything else is denied and only costs a turn. It writes its findings file and returns one line: the path and its counts per tier.

## The checks

Checks 2–5 are spec-steward's audit criteria 10, 9, 11 and 5 (its `references/criteria.md`), worded identically: the same principle, judged here against the code and the specification as written, where spec-steward judges whether the rule itself should change.

1. **Gap honesty** — for each requirement no test binds, decide whether the behaviour exists at all, starting from where its terms occur; the absence of a citation is never itself a reason to suspect a gap. A requirement describing behaviour nothing implements, with no `**⚠️ Known gap (<tracker>):**` line recorded, is an undeclared gap. One that names no term is judged first for whether it describes code behaviour at all — a process or documentation rule has nothing to implement and is not a gap. Kind: `undeclared-gap`. Do not report which requirements no test binds: that is in `spec-coverage.md`, mechanically; only the judgment — gap or not — is yours.
2. **Contradictory rules.** (spec-steward criterion 10) — no requirement contradicts another, in the same capability or a different one. `openspec validate` compares a delta against the spec it replaces; nothing compares capability A with capability B. Each requirement's evidence lists the related requirements sharing its terms (e.g. an ordering two capabilities both state, who owns a piece of state, which layer may hold a credential); judge every listed pair, and note in prose any overlap the terms could not pair. Report each conflicting pair. Kind: `conflict`.
3. **A rule redundant with, or substantially overlapping, another.** (spec-steward criterion 9) — two requirements asserting the same rule; one should own it and the other cross-reference. Judged over the same related lists. Kind: `spec-dup`.
4. **A rule that no longer matches the implementation or architecture.** (spec-steward criterion 11) — judged from the code side, EXACT: the code does exactly what the requirement says, no more and no less. Compare the quoted code with the requirement word-for-word: missing or extra behaviour, different ordering or condition, a looser type than required. When a requirement mandates a concrete class or pattern, the code MUST use it; when it states only a requirement, any implementation satisfying it passes. Open the source only where the excerpt is a window or the behaviour continues outside it. A `code-mismatch` quotes code that does something DIFFERENT from the requirement; code that conforms is not a defect whether or not anything cites it, and a pointer naming another requirement is not a finding. Kind: `code-mismatch`.
5. **A rule whose tests satisfy the wording while failing to protect the intent.** (spec-steward criterion 5) — for each test bound to a requirement or to one of its scenarios, read the quoted test and confirm it asserts that rule. Do not trust the name: a citation, comment, description or prompt text is never evidence that code complies. A structural requirement may be proven by a schema assertion or a compile-time `Equal<>` pin. Kind: `untested` — a test bound to a scenario that does not assert it. A requirement no test binds is already in `spec-coverage.md`, mechanically; do not spend a row restating it.

**Every path you name must exist.** Every `file:line` in the evidence files exists by construction. Any other code or test path a finding names MUST exist — confirm each with Read or Glob before writing the row. Bare basenames are forbidden: two files can share one. A row whose path does not resolve is invalid: correct the path, or drop the row.

## Grading — this decides whether the build fails

Every finding is in exactly one of three tiers:

- **ERROR** — a defect you demonstrated: you opened both sides and quote each at `file:line`. It fails the build once its verifier confirms it real and critical.
- **WARN** — a defect of the same class, suspected but not demonstrated: suspected from a sample, or not read on both sides. Published, never a failure.
- **INFO** — inventory and state recorded for a reader. Never a failure.

The kinds are fixed — never invent another. ERROR-class, graded ERROR when demonstrated and WARN when only suspected: `code-mismatch` (the code does not do what a requirement says), `conflict` (two requirements contradict), `undeclared-gap` (a requirement describes behaviour that does not exist, with no Known gap recorded). INFO-class, however certain: `spec-dup` (one rule asserted by two requirements), `untested` (a test cites a scenario but does not assert it). The merge records any other kind as INFO. A finding against a requirement marked `**⚠️ Advisory:**` is at most WARN.

The one line worth repeating here, because it is the whole contract: **you may write ERROR only if you opened both sides and can quote each at `file:line`.** Anything you inferred, sampled, or could not read both halves of is WARN. Marking a suspicion ERROR costs the team a red pipeline on a guess; marking a real defect WARN costs one triage cycle. The asymmetry is deliberate. And a worker's ERROR is not yet the gate's: the verification pass puts each to one more reader over that finding alone, which confirms it only when the divergence is real and critical and lowers it to WARN with its reason otherwise — so a worker grades what it demonstrated, and never softens a real divergence because it seems minor; the verifier decides that.

**State your coverage honestly.** Each worker records, for each of the five checks, whether it ran it in full, sampled, or not at all — and what it skipped. _In full_ means every requirement, bound test, term-hit list or related pair of the part was judged — and every requirement id appears in your `judged` list, which is what the merge believes rather than the word; judging from a complete quoted excerpt and the term hits without opening the source IS in full — that is what the evidence is for. An excerpt marked as a window or an outline is NOT complete: Read the file at those lines before grading, every time — the evidence tells you which files, so this is a handful of Reads, never a search — and only then is the check in full. A check with nothing to judge in your part is `full`, not `not-run`. _Sampled_ means some items were not judged at all. Two things are NOT sampling and must not be reported as such: judging a requirement that names no term from its text and its term hits (that is the whole of check 1 for it), and judging the related pairs the evidence lists without opening the other capability's specification (the listed pairs ARE checks 2 and 3's scope; open the other side only when a statement line is not enough to decide). The merge takes the weakest part: a check sampled or not run anywhere makes the verdict `INCOMPLETE`, never `PASS`.

An uncertain conclusion is a WARN finding, not a reason to mark a check sampled. Before writing, resolve every window by reading its named source and complete every requirement in the assigned list. Use `sampled` only when an assigned source is genuinely unavailable after those reads; never use it because code lives elsewhere, a requirement has no bound test, or the evidence makes a conclusion difficult. And never use it for what a test fails to prove: once you have read a bound test and can say what it does not assert, check 5 ran in full for that requirement and what you found is a finding of kind `untested`. A `sampled` note names what you did not read — a file, a window — never what a test did not cover; a note that restates a finding turns a complete part into a spurious `INCOMPLETE`.

## The findings file — what a worker writes

Each reader writes its own findings file with the **Write tool** — `audit-parts/findings/part-<n>-<reader>.json` — overwrite, and nothing else. The file is what `spec-tools report` reads; findings that exist only in a worker's reply are lost. Its shape is fixed:

```json
{
    "part": 1,
    "reader": 1,
    "capabilities": ["<capability>", "<another>"],
    "findings": [
        {
            "kind": "code-mismatch",
            "tier": "ERROR",
            "where": "<capability>#requirement-<slug> / <package>/src/<file>.ts:6",
            "quotes": [
                {
                    "file": "openspec/specs/<capability>/spec.md",
                    "line": 101,
                    "text": "SHALL mark the in-flight assistant message as errored and render the failure text inside its bubble"
                },
                {
                    "file": "<package>/src/<file>.ts",
                    "line": 6,
                    "text": "if (event.type === 'RUN_ERROR') return;"
                }
            ],
            "detail": "The handler returns on RUN_ERROR, so the in-flight assistant message is never marked errored and no failure text renders in its bubble."
        }
    ],
    "coverage": {
        "1": "full",
        "2": "full",
        "3": "full",
        "4": "sampled: <capability>#requirement-<slug> — the excerpt was a window and the source was not opened",
        "5": "full"
    },
    "judged": ["<capability>#requirement-<slug>", "<capability>#requirement-<other-slug>"],
    "notes": [
        "<capability>#requirement-<slug> and <capability>#requirement-<other-slug> overlap in prose on one rule; no shared term paired them"
    ]
}
```

- `kind` is one of the kinds above, `tier` is `ERROR`, `WARN` or `INFO`, `where` names the requirement id(s) and the `file:line`, `detail` says what diverges and which rule it breaks in one or two sentences — the developer's report shows its first sentence alone.
- Keep the JSON plain: double quotes, no trailing commas, no comments; a `detail` or `note` is one string with no line breaks. A file that does not parse is a part that ran nothing.
- Write the file once and stop. Do not validate it with a shell — no `python3 -c`, `node -e`, `wc`: Bash is denied to workers, every attempt is a wasted turn, and the merge reads the file back.
- `quotes` carry the proof. An ERROR needs at least two — both sides, each from a specification or a source file, never from `audit-parts/` — each a **verbatim fragment of one line** (or of consecutive lines) copied from the evidence excerpt without its line-number prefix, at most ~200 characters. `spec-tools report` looks each up at its `file:line`; a quote that is not there turns the finding into WARN, so copy, never paraphrase. WARN and INFO findings carry no `quotes`: their `where` and `detail` are what the report shows.
- `coverage` has one string per check — `"1"` to `"5"`: `"full"`, or `"sampled: <what was skipped>"` / `"not-run: <why>"`. Strings, not objects — every bracket is a chance to break the file. The note after `sampled:` names the source you could not read; a judgment about a test — it covers the happy path only, it asserts less than the rule — is a finding of kind `untested`, and a check whose only shortfall is such a judgment is `"full"`.
- `judged` is the judged list: every requirement id in your evidence files, added as you finish judging it for checks 1–5, whether or not it yielded a finding. The merge compares this list with the part's requirements: an id missing from it was not judged, the check is sampled for the whole audit and the verdict is `INCOMPLETE`, whatever `coverage` says. So walk the requirements one by one and write each id down when it is done; a `"full"` with a short list is a contradiction the merge resolves against you. Before you write the file, set the list against your part's `requirementIds` in `audit-scope.json`: an id you judged but forgot goes in now; an id you did not judge stays out and is reported as such — never added to look complete.
- `notes` are prose-only overlaps the term lists could not pair — suspicions for the reader, published as such.

## Interactive use — `/spec-verify`

An operator's `/spec-verify` runs the audit CI runs: `spec-tools audit` (`--here` to judge the working tree's uncommitted edits instead of `HEAD`), then summarizes `spec-verify.md` in the conversation, **one line per finding, most severe first**:

`⟨ERROR|WARN|INFO⟩ <capability>#requirement-<slug> <file>:<line> — <kind> — <one-sentence verdict, actionable>`

No quotes, no paragraphs: the proof lives in the findings files and the report. End with the counts per tier. Nothing found → say so and stop. With no operator — the AskUserQuestion tool is not among your tools, as under `claude --print` — the summary is the end of your job.

Otherwise **ask once**, with the AskUserQuestion tool — _rerun_ / _fix the errors_ / _fix errors and warnings_ / _go one by one_ / _stop_ — and **do nothing until answered**.

- **Rerun** — run `spec-tools audit` again and summarize again. Two runs over one tree differ only in what the workers noticed, so a rerun is for a run you distrust, not a way to make a finding disappear.
- **Fix the errors / fix errors and warnings** — you, never a worker, apply the whole batch at once. Per finding, propose the side — code or specification — with a one-line reason, show the list, and edit nothing until the operator has confirmed or changed each side. A specification fix is a direct edit of the standing specification unless the user asked for the delta flow. Before touching a requirement, read the requirements it names and that name it — they are in its evidence file — so the fix does not contradict a sibling; after the batch, run `spec-tools changed` and judge `audit-parts/changed.md` as _Focused mode_ describes, then the checks the repository's `AGENTS.md` lists. Report the diff of everything changed and stop; the operator decides whether to run the audit again.
- **Go one by one** — per finding, in the summary's order: _fix in code_ / _fix in spec_ / _skip_ / _instructions_. Show the exact edit before making it; apply the confirmed ones as one batch and finish as above.
- **Stop** — leave the findings files and say so.

`spec-verify.md` is rendered by `spec-tools report`, whose first line is the verdict CI reads (`PASS|FAIL|INCOMPLETE (<n> errors, <m> warnings)`); you never write it.
