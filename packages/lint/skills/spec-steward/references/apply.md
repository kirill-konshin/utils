# Apply a review round

The owner has answered a review file ([review-format.md](review-format.md)). Process each item. Do each one fully, and decide nothing for the owner.

1. **Read the full file again.** Then run `steward review status <review.yaml>`. It lists the open items, the comments, and the accepted items that are not applied.
2. **Accepted (`✅`, `✅ <comment>`).** Apply the proposal, changed as the comment tells.
    - Before you change a requirement, read the requirements that name it and that it names, and the code and tests involved. A fix must not break a sibling.
    - A rule that several repositories share changes identically in each. `steward align` shows the drift.
    - When a change moves guidance to a new place, put it where `rules/agent.md` tells, remove each copy, and reference it from its old place.
    - Add `applied: "R<round> — <what changed, with paths>"` to the item. A second application makes `applied` a list.
3. **Rejected (`❌`, `❌ <comment>`).** Keep the rule as it is, or follow the owner's other instruction. Record what you did in `applied`.
4. **Comment only.** Examine the item again, and change the proposal or the explanation in place. Move the owner's comment into `previousDecision: "R<n>: <comment>"` and set `decision` to `""`. A comment is never acceptance.
5. **Theme with member decisions.** Apply the theme's decision to the members with no `decision` of their own. Do each member that has one as its decision tells, as above.
6. **Audit again what changed.** Run the audit ([audit.md](audit.md)) over the affected set: the capabilities you changed, the capabilities that name them, and the moved guidance. Then run the repository's spec gate (`AGENTS.md` → Checks), or `steward check --base auto` when it names none. Add the new findings with `steward review render <data> --out <review.yaml> --append --round <n>`.
7. **Verify.** Run the repository's checks, as its `AGENTS.md` lists them, plus `steward review lint` and `steward review verify`. Report each check that failed or that you did not run, with the reason.
8. **Stop** while an item is open or has an unresolved comment. Report the file, the counts and the decisions that are necessary. The loop ends only when each item is resolved, the accepted changes are in place, the repositories agree on shared rules, and a focused audit finds nothing important.

Do not commit unless the repository's instructions let you.
