---
type: always_apply
description: Hard constraints while editing an OpenSpec corpus
paths:
    - 'openspec/**'
---

- NEVER weaken, narrow, delete or reclassify a rule to make code pass — a divergence is the owner's call, ask
- A scenario adds one concrete case beyond its requirement, or it is not written
- A rule shared by several repositories is worded identically in each
- Before handing back a spec change run the repository's spec gate (AGENTS.md → Checks) and surface every `weakened` finding to the owner
- Corpus-quality audits, review rounds and cross-repository alignment follow the `spec-steward` skill; code conformance is the `spec-verify` skill's audit, run by `spec-tools`
