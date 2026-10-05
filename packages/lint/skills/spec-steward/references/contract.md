# The spec-steward contract

What `spec-steward` checks and reports in every repository that runs it. It ships with `@kirill.konshin/lint`, so a repository is held to the version it pins. A repository's constitution states only its own choices — the `--binds` globs it passes, the jobs that run the gate, the audits it runs and where it publishes — and points here for the rest. How a specification is written is [model.md](model.md); this file is what the tool does with it. `steward.test.mjs` proves the cases below.

Terms used throughout:

- **The corpus** is every `spec.md` under the specs directory (`--specs`, default `openspec/specs`).
- **A requirement's statement** is the text between its `### Requirement:` heading and its first `#### Scenario:`. **Its block** runs from the heading to the next requirement heading.
- **A base** is the git ref the working tree is compared with ([Base resolution](#base-resolution)). A kind marked _base only_ runs only when a base is set.

## Citation and scanning

A citation is an optional pointer to a capability specification: a mention of `openspec/specs/<capability>/spec.md`, with or without `#<anchor>`, in a `{@link}` tag, a code comment, or a document outside `openspec/changes/`. Every citation present SHALL resolve — its file exists, and its anchor, when given, is a heading that file renders; one that does not fails the build. A code citation is neither evidence that code complies nor required, and its placement and applicability are not checked.

- **Files scanned.** Every tracked file, and every untracked file git does not ignore, that is text; a file holding a NUL byte is binary and skipped. Dockerfiles, Helm templates, `.env*` and `.dockerignore` are scanned like any other text file.
- **Files skipped.** Dependency and build output directories, every `spec.md`, and all of `openspec/changes/**`, open changes included. Change folders quote other repositories and paths being removed, so they are history and plans, not pointers.
- **Where a mention counts.** Anywhere in a Markdown or MDX document. Elsewhere, only inside a `{@link …}` or `@see` tag, or inside a comment: `//`, `/* */`, a JSDoc line, `<!-- -->`, and `#` in every file that is not JavaScript, TypeScript or Markdown. A path inside a string literal is data, not a citation.
- **Resolution.** A path that starts with `openspec/` resolves from the repository root. Any other path resolves from the citing file's directory.
- **Anchors.** An anchor resolves when the cited file renders a heading with that slug. Slugs follow github-slugger: lowercase, punctuation and symbols dropped, each space a hyphen with runs kept, and a repeated heading suffixed `-1`, `-2`. `### Requirement: <name>` renders `#requirement-<slug>`; `#### Scenario: <name>` renders `#scenario-<slug>`.
- **Renames.** Under a base, a citation of an anchor that the diff renamed is reported as `renamed-anchor`, not as `dangling-citation`. `--fix` rewrites every such citation.

Cases:

- **WHEN** a cited capability, requirement, or scenario is renamed or removed **THEN** the citation stops resolving and the build fails, rather than rotting silently
- **WHEN** a file under `openspec/changes/` names a path that does not exist **THEN** nothing is reported
- **WHEN** a `#` comment in a Dockerfile cites a scenario **THEN** that citation is resolved like any other
- **WHEN** a test fixture holds a specification path inside a string **THEN** it is not a citation

## Binding

A citation of a scenario's anchor binds the scenario only where it sits in one of the places below. A bound scenario has evidence for the [scenario ratchet](#scenario-ratchet) and the [coverage report](#coverage-report).

| Where the citation sits | Binds |
| --- | --- |
| In a test file (a JavaScript or TypeScript `*.test.*`, `*.spec.*` or `*.test-d.*` file, a file under `__tests__/` or `e2e/`, or a Python or Go test file), inside a `describe`, `it`, `test`, `suite` or `bench` call, with any `.only`, `.skip`, `.concurrent`, `.sequential`, `.todo`, `.each(…)`, `.for(…)`, `.runIf(…)`, `.skipIf(…)` or `.fails` chain, and Playwright's `test.describe`, `test.step`, `.serial`, `.parallel`, `.fixme` and `.fail`; in a Python test file, inside a `test_…` function or a `Test…` class; in a Go test file, inside a `Test…` function | yes |
| In a test file, in the comment run directly above such a call or function (in Python, its decorators too), with no blank line between | yes |
| In a test file, on a type assertion — an `Expect<…>` type alias, or an `expectTypeOf(…)` or `assertType(…)` call — at the top level or inside a block | yes |
| In a lint configuration — `eslint.config.{js,mjs,cjs,ts,mts,cts}` or `yarn.config.cjs` — anywhere | yes |
| In a file matching a `--binds <glob>` the repository passes (a check script, a Dockerfile, a CI configuration), anywhere | yes |
| Anywhere else in a test file: its header, a fixture, a helper | no — it binds nothing and fails nothing |
| Code, configuration, YAML, a Dockerfile or a document that no `--binds` glob matches | no — it is a pointer |

A requirement's anchor binds its scenario only when the requirement has exactly one. A call's or a Go function's extent is found by balanced brackets, skipping strings, template literals and comments; a Python function's or class's, by indentation.

Cases:

- **WHEN** a citation sits in a test file's header comment **THEN** it binds no scenario, and no finding is reported for it
- **WHEN** a citation sits in the comment directly above an `it(…)` call **THEN** it binds that scenario
- **WHEN** a requirement constrains a shape, an interface or a structure **THEN** a citation on the type assertion, lint entry or `--binds` check that proves it binds its scenario, as a test's would
- **WHEN** a test cites the requirement anchor of a requirement with two scenarios **THEN** neither scenario is bound

## Markers

There are exactly two markers. Each stands on a line of its own: the Advisory line in the requirement's statement, directly under its heading, and a Known gap line in the statement or inside the block of the scenario it qualifies.

| Marker | Meaning |
| --- | --- |
| `**⚠️ Advisory:** <why review is its evidence>` | The requirement is ADVISORY. It keeps its RFC 2119 keywords and is exempt from the scenario ratchet and from `absolute-unproven`. Coverage reports it as `advisory`, and the evidence JSON classes it `advisory`. Marking an existing requirement Advisory is reported as `weakened` ("newly marked advisory"). It qualifies the whole requirement, so a requirement that mixes a contract with guidance is split. |
| `**⚠️ Known gap (<tracker>):** <what is missing>` | Behaviour the requirement describes is knowingly absent or incomplete, or a REQUIRED rule lacks the evidence that would catch its failure. `<tracker>` is required text: a ticket key (`EVAA-34696`), a tickets-page id, or an open `openspec/changes/<name>` folder. Steward checks only that it is present: any non-empty text inside the parentheses counts and is not validated, so a placeholder counts until it is replaced. In the statement, the line records the gap and exempts nothing, unless it names scenarios of its requirement by title after `exempts`, each in quotes (`exempts scenario 'A'`, `exempts scenarios 'A' and 'B'`; double quotes, curly quotes, `_…_` and `*…*` are read too). Exactly the named scenarios are then exempt from the scenario ratchet. Inside a scenario's block, the line exempts that scenario. Coverage lists every gap with its tracker. |

Retired spellings are `**⚠️ Unenforced:**` and `**⚠️ Known gap:**` without a tracker. Each is reported as `marker-hygiene` and grants no exemption. So is a marker inside a line rather than on a line of its own, and an Advisory line inside a scenario. A misspelt marker (wrong case, missing emoji or bold) is reported as `marker-hygiene`, and `--fix` normalises it.

Cases:

- **WHEN** a Known gap line under the requirement names no scenario **THEN** coverage lists the gap, and no scenario is exempt
- **WHEN** a requirement carries `**⚠️ Unenforced:**` **THEN** `marker-hygiene` warns, and the requirement is REQUIRED with no exemption
- **WHEN** an existing requirement gains the Advisory marker **THEN** `weakened` reports it for the owner

## Kinds and severities

An `error` finding fails the run. A `warn` finding fails it only under `--strict`. An `info` finding is a prompt for judgement and never fails. Under a base, info findings are limited to the requirements and scenarios the diff added or edited and to citations in changed files; errors and warnings stay corpus-wide.

| Kind | Severity | Rule |
| --- | --- | --- |
| `dangling-citation` | error | A citation's file or anchor does not exist ([Citation and scanning](#citation-and-scanning)) |
| `renamed-anchor` | error, base only | A citation names an anchor the diff renamed; `--fix` rewrites it |
| `duplicate-anchor` | error | Two headings in one spec render the same slug |
| `duplicate-requirement` | error | The same requirement name in two capabilities, or two requirements whose bodies are equal up to whitespace |
| `size` | error / info | Over the failing line, or over the warning line ([Size gate](#size-gate-with-obligation-counting)) |
| `scenario-unproven` | error, base only | A changed scenario of a REQUIRED requirement is neither bound nor exempt ([Scenario ratchet](#scenario-ratchet)) |
| `weakened` | warn, base only | A rule was removed or lowered (MUST → SHOULD), lost an absolute, gained an exception, or was newly marked Advisory |
| `textual-test` | warn | A test asserts on the text of a source, a spec or a document |
| `marker-hygiene` | warn | A misspelt marker, a retired marker, or a Known gap without a tracker ([Markers](#markers)) |
| `new-requirement` | info, base only | A requirement the diff added: name the failure it prevents and the cheapest evidence that catches it |
| `absolute-unproven` | info | A REQUIRED requirement with an absolute in an obligation sentence, no exception word and no binding; Advisory requirements are skipped |
| `impl-detail`, `vague-obligation`, `restating-scenario`, `duplicate-scenario`, `unbound-test` | info | Judgement prompts; `unbound-test` judges block-level bindings |
| `non-ears`, `non-bdd` | info, base only | Added or edited text only. `non-ears`: the statement's first obligation sentence matches none of the forms _When …_, _While …_, _If … then …_, _Where …_ or _`<subject>` SHALL …_. `non-bdd`: a scenario lacks WHEN or THEN. |

The edit hook (`steward hook`) checks only the file an edit touched. On a spec, it compares the file with its committed version and reports `weakened` and `new-requirement`, `duplicate-anchor`, and, for the requirements the edit changed, `size`, `marker-hygiene` and the judgement prompts. On any other file it reports `dangling-citation`, and in a test file also `textual-test` and `unbound-test`. It runs no ratchet, and it does not repeat a finding it already reported in the session.

## Size gate with obligation counting

A requirement's block over 300 words, or a statement — the text before its first scenario — issuing more than five obligations, SHALL be reported as an `info` prompt; a block over 500 words, or a statement issuing more than eight obligations, SHALL fail the build. An obligation is an RFC 2119 keyword in the statement written outside backticks — `MUST`, `SHALL`, `SHOULD`, `MAY`, `REQUIRED`, `RECOMMENDED` or `OPTIONAL`, a `NOT` form counted once; a keyword inside backticks is mentioned as a term and is not counted.

Marker lines are not part of the statement for counting. `--max-words 300,500` and `--max-obligations 5,8` set the warning and failing lines as a pair.

Cases:

- **WHEN** a requirement's block exceeds 300 words or its statement issues more than five obligations **THEN** `size` reports it at `file:line` as a prompt, and the build proceeds
- **WHEN** a requirement's block exceeds 500 words or its statement issues more than eight obligations **THEN** the build fails until the requirement is brought under the line
- **WHEN** a statement names a keyword inside backticks **THEN** the obligation count does not include it
- **WHEN** a statement reads "The gate MUST run. It SHALL NOT skip `MUST`; it MAY warn, is NEVER silent and ALWAYS logs; logging is RECOMMENDED." **THEN** it issues four obligations

## Scenario ratchet

A scenario a merge request adds or modifies in a REQUIRED requirement SHALL be bound before the request merges, or SHALL be exempted by a `**⚠️ Known gap (<tracker>):**` line ([Markers](#markers)). An ⚠️ ADVISORY requirement is exempt. The scenarios the request's base already carries unbound are listed in the coverage report and fail nothing.

`scenario-unproven` enforces this under a base. A scenario counts as changed when its block, with whitespace normalised, appears nowhere in the base corpus, so a scenario moved verbatim is unchanged. A changed scenario fails when no [binding](#binding) cites `#scenario-<slug>` and no Known gap line exempts it. Its requirement's anchor counts only when the requirement has exactly one scenario. Without a base, the ratchet does not run.

Cases:

- **WHEN** a merge request changes a scenario of a REQUIRED requirement that nothing binds and no Known gap line exempts **THEN** `scenario-unproven` fails the run, naming the scenario at `file:line`
- **WHEN** a requirement's Known gap line names one scenario **THEN** that scenario is exempt, and the requirement's other changed scenarios still need binding
- **WHEN** a scenario of an ⚠️ ADVISORY requirement changes **THEN** the gate asks nothing of it
- **WHEN** a scenario moves to another requirement or capability unchanged **THEN** the gate asks nothing of it
- **WHEN** the base already carries a scenario unbound and the request does not change it **THEN** coverage lists it, and the run does not fail

## Base resolution

`--base auto` picks the base from where the run happens:

| Run | Base | Effect |
| --- | --- | --- |
| Merge-request pipeline (`CI_MERGE_REQUEST_DIFF_BASE_SHA` set) | That SHA, which is already the merge base. The run exits 2 if the object is missing. | Every kind runs |
| Any other CI pipeline (`CI` set: a default-branch push, a schedule, a manual run) | None | The base-only kinds are skipped: `weakened`, `new-requirement`, `renamed-anchor`, `scenario-unproven`, `non-ears`, `non-bdd`. The skip is stated on stderr, and info findings are not printed. |
| Local | The merge base of `origin/HEAD` and `HEAD`, else of `origin/main` and `HEAD`. With neither, the run exits 2 and asks for `git fetch origin`. | Every kind runs. The head is the working tree, tracked plus untracked files. |

An explicit `--base <ref>` compares with the merge base of `<ref>` and `HEAD`. With no `--base`, no base is set.

## Exit codes and output

| Command | Purpose | Output |
| --- | --- | --- |
| `spec-steward check [--base auto\|<ref>] [--binds <glob>]… [--file <f>] [--fix] [--strict] [--json]` | The corpus gate, run locally, in CI and by the hook | Findings ([below](#findings)) |
| `spec-steward coverage [--out <file>] [--binds <glob>]…` | The [coverage report](#coverage-report) | Markdown, to the file or to stdout |
| `spec-steward evidence --json [--binds <glob>]…` | The audit's [evidence model](#evidence-json) | JSON on stdout |
| `spec-steward evidence --out <dir>`, `partition`, `index`, `review`, `align`, `wire`, `hook` | Audit bundles and partitions, the corpus index, review files, cross-repository drift, wiring, the edit hook | As each command documents |

`spec-steward` is the package's `bin`. A repository calls it from its root scripts and never imports steward's modules: the package's `exports` map does not expose them, so the CLI and its JSON are the interface.

### Findings

- **stdout.** One finding per line: `<file>:<line> <severity> <kind> <message>`, prefixed with `<root> ` when several `--root` are given. With `--json`, stdout is instead an array of `{ root, file, line, severity, kind, id?, message }`.
- **stderr.** First `base: …`, then `N finding(s): <kind> <n>, …`, then `PASS|FAIL — e error(s), w warning(s), i prompt(s)`.

### Exit codes

| Code | When |
| --- | --- |
| 0 | No error finding |
| 1 | An error finding, or a warning under `--strict` |
| 2 | A usage or environment error: an unknown flag, a base ref that does not exist, a git file listing that failed or came back empty, a missing specs directory |

Exit 2 on an empty listing keeps a broken checkout from passing a scan that read nothing.

## Coverage report

`spec-steward coverage` writes a Markdown report that is MDX-safe: `<`, `>`, `{`, `}` and `|` are escaped. It gates nothing: it exits 0, or 2 on an environment error. Statuses come from [bindings](#binding) and [markers](#markers) only. A pointer never changes a status.

- **Headline.** Requirements and capabilities; Advisory requirements; Known gaps; REQUIRED requirements no test binds; REQUIRED scenarios no test binds; retired markers.
- **Per capability.** One table: `| Requirement / Scenario | Spec | Bound by | Pointers | Status |`.
- **Requirement status.** `advisory`, `tested`, `known gap (<tracker>)` or `no test`.
- **Scenario status.** `bound`, `known gap (<tracker>)` or `no test`, and a dash under an Advisory requirement.
- **Pointers.** The code and document citations of the requirement and its scenarios.
- **Closing sections.** "Known gaps" (tracker, requirement, text) and "Retired markers".

## Evidence JSON

`spec-steward evidence --json` writes the evidence an audit reads, one entry per requirement:

```
{ version: 1, root, requirements: [{ id, capability, file, line, end, block, class: 'required'|'advisory',
  gaps: [{ tracker, text, line, scenario: null|'<slug>', exempts: ['<slug>'] }],
  scenarios: [{ slug, line, end, block, bound }],
  bindings: [{ file, line, anchor, kind: 'test'|'file', title, window: [a, b] }],
  pointers: [{ file, line, anchor, kind: 'code'|'doc' }],
  terms: [{ term, hits: [{ file, line }] }],
  related: [{ id, shared: [term] }] }] }
```

- `class` is `advisory` when the requirement carries the Advisory marker, else `required`.
- `gaps` lists each Known gap line that carries a tracker. `scenario` is the slug of the scenario whose block holds the line, or `null` for a line under the requirement; `exempts` lists the slugs of the scenarios it exempts, empty when it exempts none.
- `bindings` are the citations that [bind](#binding) a scenario or the requirement. `kind` is `test` for a test-file binding, and `file` for a lint configuration or a `--binds` file. `title` is the bound test's title, or `null`; `window` is the line range of the bound block.
- `pointers` are every other citation of the requirement or its scenarios.
- `terms` are the requirement's own distinctive terms, with every hit in non-test sources after comments are stripped. Line numbers are kept.
- `related` lists the requirements that share terms with it, across capabilities.
