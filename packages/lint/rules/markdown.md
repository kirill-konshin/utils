---
type: always_apply
description: Markdown writing rules
paths:
    - '**/*.md'
    - '**/*.mdx'
---

- A Markdown table may be up to 200 columns wide once aligned (Markdown is formatted at `printWidth` 200, so it stays aligned); a wider table is an HTML `<table>`
- Exception: a table whose cells are mostly code spans (paths, globs, commands, identifiers) stays Markdown however wide — the formatter leaves it unaligned (`| --- |`), which is acceptable there
- Inside an HTML table write inline formatting as HTML (`<code>`, `<strong>`, `<a href>`): Markdown is not parsed there
