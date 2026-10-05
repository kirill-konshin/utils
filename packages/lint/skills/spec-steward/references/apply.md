# Apply a review round

The owner has answered a review file ([review-format.md](review-format.md)). Process every item. Leave nothing half-done, and decide nothing on the owner's behalf.

1. **Read the whole file again.** Then run `steward review status <review.md>`, which lists the open items, the comments, the accepted-but-not-applied items and the member comments of themes.
2. **Accepted (`✅`, `✅ <comment>`).** Apply the proposal, adjusted by the comment.
    - Before you touch a requirement, read the requirements that name it and that it names, and the code and tests involved. A fix must not break a sibling.
    - A rule shared by several repositories changes identically in each; `steward align` shows the drift.
    - When a change moves guidance to a new place, put it in the place `rules/agent.md` assigns, remove every copy, and reference it from where it used to live.
    - Add `Applied: R<n> — <what changed>` under the item.
3. **Rejected (`❌`, `❌ <comment>`).** Keep the rule as it is, or follow the owner's alternative instruction, and record what was done.
4. **Comment only.** Investigate further and revise the proposal or the explanation in place. Move the owner's comment into `Previous response (R<n>): …` and reset the response to `⬜`. Never read a comment as acceptance.
5. **Theme with member comments.** Apply the theme's verdict to the members without comments. Handle each commented member by its comment, as above.
6. **Re-audit what changed.** Run the audit ([audit.md](audit.md)) over the affected set: the capabilities you edited, those that name them, and the moved guidance. Then run the repository's spec gate (`AGENTS.md` → Checks), or `steward check --base auto` where it names none. Append new findings under `## Round <n> — new`.
7. **Verify.** Run the repository's own checks, as its `AGENTS.md` lists them, plus `steward review lint` and `steward review verify`. Report what failed or was skipped, with the reason.
8. **Stop** while any item is open or carries an unresolved comment. Report the file, the counts and the decisions still needed. The loop ends only when every item is resolved, the accepted changes are in place, the repositories agree on shared rules, and a focused re-audit finds nothing material.

Never commit unless the repository's instructions say you may.
