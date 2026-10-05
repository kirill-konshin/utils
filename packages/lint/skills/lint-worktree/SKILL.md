---
name: lint-worktree
description: Describes how to work with GIT Worktrees
---

- Prefer creating worktrees inside the main repo in `.worktrees` directory
- Directory `.worktrees` has to be gitignored, banned from IDEA indexing, and marked as excluded

# Git Worktrees & JetBrains IDEA / WebStorm

`.idea/%projectName%.iml`, `.idea/modules.xml` and `.idea/.name` are usually tracked. Every git worktree therefore checks out a module with the same name as the main checkout's, and WebStorm refuses to attach it: `Cannot attach project: Module name '%projectName%' already exists`.

- When creating a worktree, ALWAYS give it a distinct module and project name derived from the branch, e.g. `App Name: Workspace Name` for `workspace-name`:
    1. **Rename** — do not copy — `.idea/%projectName%.iml` to `.idea/%projectName% %Branch Title%.iml`. The module name is the file name, and attaching the worktree registers whichever `.iml` it finds: a copy beside the original still attaches as `%projectName%`.
    2. Point `.idea/modules.xml` at the renamed file.
    3. Write the same name into `.idea/.name`.
    4. A main project the worktree is attached to lists it in its own `.idea/modules.xml`: point that entry at the renamed file too.
- Keep the rename local, and NEVER commit it or merge it back:
    - The tracked `.iml` first: stage the branch's own edits to it (`git add .idea/%projectName%.iml`), then `git update-index --skip-worktree .idea/%projectName%.iml`, then rename. The staged content is what the branch commits; the rename never shows as a deletion. An edit the branch later makes to the renamed file has to be staged back the same way.
    - Ignore the renamed file in the shared `.git/info/exclude` with the pattern `.idea/%projectName% *.iml`.
    - A **tracked** `.idea/modules.xml` or `.idea/.name`: run `git update-index --skip-worktree` on it.
    - An **untracked** one (often `modules.xml` is in `.idea/.gitignore` and `.name` does not exist yet): `skip-worktree` fails on it, so leave it to `.idea/.gitignore` or add it to the shared `.git/info/exclude` as well (e.g. `.idea/.name`).
    - Verify with `git status --short .idea`: nothing from the rename is listed, only the staged edits.
- Before a rebase, merge or checkout that updates those files (tracked ones only):
    1. Rename the `.iml` back and run `git update-index --no-skip-worktree` on every file marked above.
    2. Restore them with `git checkout -- <files>`.
    3. Redo the rename afterwards.
- A worktree created **inside** the main checkout (e.g. `.worktrees/<name>`, where agents put theirs) is indexed by the main project as part of itself, a second copy of every source and `node_modules`, and the main project's save actions start reformatting the worktree's files. Exclude its folder in the main checkout's `.idea/%projectName%.iml` (`<excludeFolder url="file://$MODULE_DIR$/.worktrees" />`) and list it in `.gitignore`, so the excluded-folders baseline of the `webstorm` rule holds. Attaching such a worktree can replace the main checkout's own entry in its `.idea/modules.xml`: keep both — the main `.idea/%projectName%.iml` and the worktree's renamed one — then reload the project. A nested worktree shows as its own module node inside the tree, not as a separate top-level project; for a top-level entry, create the worktree outside the main checkout.
