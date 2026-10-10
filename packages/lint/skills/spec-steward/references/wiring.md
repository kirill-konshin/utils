# Wiring the guard into a repository

A skill is discovered at the agent's discretion, so it cannot be the only thing that prevents a bad spec edit. The guard steers through points that reach the agent anyway. `steward wire --check` verifies each point, and every `steward` command warns in one line when one is missing.

| Point | What it does | Placed by |
| --- | --- | --- |
| Scoped rule `.agents/rules/openspec.md` (+ `.claude/rules`) | Hard constraints, loaded when the agent touches `openspec/**`. | `lint-prepare` (`@kirill.konshin/lint`) |
| Skill `.agents/skills/spec-steward` (+ `.claude/skills`) | The procedures, the model, the contract and the scripts. | `lint-prepare` |
| Edit hook in `.claude/settings.json` | Runs `steward hook` after every Edit/Write/MultiEdit and feeds findings back to the agent at once — only for what the edit changed, with no ratchet. | `steward wire --fix` |
| Routing line in `AGENTS.md` | Tells every agent, Codex included, where the guard lives, and that corpus-quality audits use this skill while code conformance is the `spec-verify` audit. | You, beside the specification-driven convention; `wire --fix` prints the line. |
| OPSX operation guidance in `openspec/config.yaml` | One narrow line each for `apply` and `archive`: run the repository's spec gate (AGENTS.md → Checks); a `weakened` finding stops the flow. | `steward wire --fix`, when the file has OpenSpec's standard shape |

These five points keep to the placement rules:

- Nothing restates `rules/agent.md` or the repository's own rules.
- The OPSX `context` stays untouched: it already carries `AGENTS.md`.
- The hook is a no-op where the skill is not installed, so teammates without it are not blocked.

**The gate.** A repository's spec gate (`spec-tools gates` and its CI job, listed in `AGENTS.md` → Checks) runs `steward check --base auto` with the repository's binds — `"spec-steward": { "binds": [...] }` in its root `package.json` — and then the change gates. Error findings fail it; warnings and prompts never do ([contract](contract.md#kinds-and-severities)). Steward is the one spec engine, so it never runs as a second job beside an existing gate, and the repository keeps no copy of a check steward implements. Whether a repository puts the gate in CI is its owner's decision.
