---
name: curated-skills-update
description: Sync and update the default agent skills that @kirill.konshin/lint installs (`DEFAULT_LINT_CONFIG.skills` in packages/lint/src/config.ts) from the Core Pack on skills.sh and the official library skill sources, and update the `skills` CLI that installs them. Use when asked to sync the pack, add or remove default skills, update or check the curated / vendor skills or the skills CLI.
---

# Curated Skills Update

The pins:

- `DEFAULT_LINT_CONFIG.skills` in `packages/lint/src/config.ts`: one entry per source, keyed `owner/repo`, with a `ref` (a full 40-char commit SHA) and an explicit `skills` list (the repositories also hold their maintainers' internal skills)
- `dependencies.skills` in `packages/lint/package.json`: the `skills` CLI, an exact version (`lintPrepare.ts` runs its `experimental_sync`, `add` and `remove`)

The sources:

- The Core Pack, https://skills.sh/p/DxVN7q53wGdAcZQt — the user adds and removes skills there; the defaults follow it
- The official skills of the libraries the rules cover (Next.js, Redux Toolkit, Turborepo, Nx, Expo, Playwright) — listed below the pack entries in `config.ts`
- Not here: machine-wide skills (the System Pack https://skills.sh/p/qOfi5GxJSfJQI1aB) — the user's dotfiles own them

Ask the user to commit unrelated work first.

# Sync the Core Pack

1. Read the pack page: every skill name and its `owner/repo`
2. Compare with the pack entries of `DEFAULT_LINT_CONFIG.skills`; report added and removed skills
3. Do not add a skill that conflicts with a rule (e.g. `material-ui-tailwind`, [mui.md](../../../packages/lint/rules/mui.md)), a machine-wide skill, or a source that does not exist (`gh api repos/<owner>/<repo>`); report each, so the user removes it from the pack
4. New source: pin `ref` to the head of the default branch (`gh api repos/<r>/commits/<branch> --jq .sha`), or the latest release SHA when the repository publishes releases; list the skill names exactly as `npx skills add <r>#<ref> --list` prints them
5. Review each new skill as in "Update a source" steps 3–6

# Update a source

1. Find the new SHA: the latest release (`gh release list -R <r> --limit 1`; `vercel-labs/agent-skills` tags `agent-skills-<sha>`), else the head of the default branch
2. IF the SHA equals `ref`, report "up to date" and go to the next source
3. Review the change of each listed skill: `gh api repos/<r>/compare/<old>...<new> --jq '.files[].filename'`, then read the diffs of the listed skills' folders
4. Stop and ask the user when a diff adds scripts, commands to run, network fetches, installs, hooks, or instructions that override the user or repository rules
5. Check the audits of each skill: `https://skills.sh/<owner>/<repo>/<skill-name>` — Gen, Socket and Snyk; report each result that is not Pass
6. Compare the changes with the rules that name these skills (`grep -rl '<skill>' packages/lint/rules`); propose a rule change for each conflict
7. Report new and removed consumer skills in the repository; add or remove one only on the user's decision
8. Set `ref` to the new SHA

# `skills` CLI

1. `npm view skills version`; IF equal to `dependencies.skills`, stop
2. Read the releases between the two versions (https://github.com/vercel-labs/skills/releases): look for changes to `experimental_sync`, `add` and `remove` (names, flags `-y -a --no-remote --exclude --skill`, the `skills-lock.json` format, `sanitizeName`, links, telemetry)
3. `yarn workspace @kirill.konshin/lint add -E skills@<version>`
4. Adapt `runSkillsSync()`, `syncRemoteSkills()` and `skillDirName()` in `packages/lint/src/lintPrepare.ts` and their tests when the CLI changed

# Verify

1. `yarn nx run @kirill.konshin/lint:test`, `yarn lint`
2. `yarn postinstall`: a changed `ref` fetches the source again; then `git status` shows no skill folder, `.agents/skills` and `.claude/skills` list every default skill
3. Report: old → new for each pin, the skill changes, the audit results, rule proposals, pack entries for the user to remove

# Commit

- Show the user the messages; the user commits
- `packages/lint/src/config.ts`, `packages/lint/package.json`: `fix(lint): update curated skills` (`feat(lint):` when a skill is added or removed)
- `yarn.lock`: separate `chore:` commit (the `releases` skill)
