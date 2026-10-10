# Judging rules: spec-verify reader

Use the common rules first: [common.md](common.md).

This audit compares the specification with the code. It does not decide if a rule is a good rule. The spec-steward audit does that.

| Check       | Compares                                            | Kind             |
| ----------- | --------------------------------------------------- | ---------------- |
| 1 Gap       | a requirement with the code that must implement it  | `undeclared-gap` |
| 2 Conflict  | a requirement with a related requirement            | `conflict`       |
| 3 Duplicate | a requirement with a related requirement            | `spec-dup`       |
| 4 Mismatch  | the intent of a requirement with what the code does | `code-mismatch`  |
| 5 Test      | a scenario with the test that cites it              | `untested`       |

Do not compare code with code.

## Gap honesty

- For a requirement that no test binds, find if the behaviour exists. Start where its terms occur.
- When no code implements the behaviour and no `**⚠️ Known gap (<tracker>):**` line records it, report `undeclared-gap`.
- A process rule or a documentation rule has nothing to implement. It is not a gap.
- A missing citation is not a reason to suspect a gap.

## Contradictory rules

- Two requirements conflict when one system cannot obey both.
- A conflict is a defect in the specification. It is WARN or lower. The owner decides.

## A rule redundant with, or substantially overlapping, another

- Two requirements that state the same rule are `spec-dup`. This is always INFO.

## A rule that no longer matches the implementation or architecture

- Find the intent of the requirement: the behaviour it requires and the failure it prevents.
- Report `code-mismatch` when the code does not satisfy that intent: it does what the requirement prevents, or it does not do what the requirement requires.
- Do not compare words. A different word, a different order of words, or a narrower or wider phrase is not a finding when the code satisfies the intent.
- When the requirement names a specific class, pattern, value or field as its contract, the code must use it.
- Code that satisfies the requirement is not a defect. A citation is not necessary.

## A rule whose tests satisfy the wording while failing to protect the intent

- For each test that a scenario binds, make sure that the test asserts the outcome of the scenario. The name of the test is not evidence.
- A test that asserts less than its scenario is `untested`. This is always INFO.

## Coverage

- A check is full when you judged each item that the part lists for it, and each requirement id is in your judged list.
- A check is sampled only when an assigned source was not available after you tried to read it. Name that source.
- An uncertain conclusion is a finding with a low `readerConfidence`. It is not sampled coverage.
