---
name: lint-worktree
description: Git worktrees inside the main checkout (`.worktrees`, Claude Code's `.claude/worktrees`) and the JetBrains IDEA / WebStorm module-name clash they cause. Use when creating, attaching or removing a git worktree.
---

- Prefer creating worktrees inside the main repo in `.worktrees` directory; Claude Code creates its worktrees in `.claude/worktrees`
- Each worktree folder has to be gitignored (`.gitignore` or the shared `.git/info/exclude`) and marked as excluded in the main checkout's `.idea/%projectName%.iml` (`<excludeFolder url="file://$MODULE_DIR$/.claude/worktrees" />`)
    - Without the exclusion, the main project indexes a second copy of every source and `node_modules`, and its save actions reformat the worktree's files

# Git Worktrees & JetBrains IDEA / WebStorm

`.idea/%projectName%.iml`, `.idea/modules.xml` and `.idea/.name` are usually tracked. Every git worktree therefore checks out a module with the same name as the main checkout's, and WebStorm refuses to attach it: `Cannot attach project: Module name '%projectName%' already exists`.

- When creating a worktree, ALWAYS give it a distinct module and project name derived from the branch, e.g. `App Name: Workspace Name` for `workspace-name`:
    1. **Rename** — do not copy — `.idea/%projectName%.iml` to `.idea/%projectName% %Branch Title%.iml`. The module name is the file name, and attaching the worktree registers whichever `.iml` it finds: a copy beside the original still attaches as `%projectName%`.
    2. Point `.idea/modules.xml` at the renamed file.
    3. Write the same name into `.idea/.name`.
- Keep the rename local, and NEVER commit it or merge it back:
    - The tracked `.iml` first: stage the branch's own edits to it (`git add .idea/%projectName%.iml`), then `git update-index --skip-worktree .idea/%projectName%.iml`, then rename. The staged content is what the branch commits; the rename never shows as a deletion. An edit the branch later makes to the renamed file has to be staged back the same way.
    - Ignore the renamed file in the shared `.git/info/exclude` with the pattern `.idea/%projectName% *.iml`.
    - A **tracked** `.idea/modules.xml` or `.idea/.name`: run `git update-index --skip-worktree` on it.
    - An **untracked** one (often `modules.xml` is in `.idea/.gitignore` and `.name` does not exist yet): `skip-worktree` fails on it, so leave it to `.idea/.gitignore` or add it to the shared `.git/info/exclude` as well (e.g. `.idea/.name`).
    - A worktree that has both the original `.iml` and a renamed copy: do the `skip-worktree` step on the original, then delete it.
    - Verify with `git status --short .idea`: nothing from the rename is listed, only the staged edits.

# Attaching a Worktree to the Main Project

- Attaching edits tracked files of the main checkout:
    - `.idea/modules.xml` gets an entry for the worktree's `.iml`; attaching can replace the main checkout's own entry: keep both, then reload the project
    - `.idea/%projectName%.iml` gets `<orderEntry type="module" module-name="%projectName% %Branch Title%" />`
    - `.idea/vcs.xml` can get `<mapping directory="" vcs="Git" />` instead of `$PROJECT_DIR$`
- Keep these edits local, the same as the rename: stage only the real edits to these files (e.g. a new `excludeFolder`), then `git update-index --skip-worktree` them
    - To stage part of a file without `git add -p`: `git hash-object -w` the wanted content, then `git update-index --cacheinfo 100644,<blob>,<path>`
    - Verify with `git status --short .idea` in the main checkout: only the staged edits are listed
- A worktree inside the main checkout shows as a module node inside the main tree, under its excluded folder, never as a top-level tree; for a top-level tree, create the worktree outside the main checkout (for Claude Code: its "Worktree location" setting; do not change it without the user's approval)
- After the worktree is detached or removed: `git update-index --no-skip-worktree` the main checkout's files, then `git checkout -- <files>`

# Before a Rebase, Merge or Checkout

In each checkout, for tracked files marked above that the operation updates:

1. Rename the `.iml` back and run `git update-index --no-skip-worktree` on every marked file.
2. Restore them with `git checkout -- <files>`.
3. Redo the rename and the marks afterwards.
