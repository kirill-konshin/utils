---
name: lint-db
description: Database procedures for the db rule - LocalStorage / IndexedDB to server migrations, transactional importers, one-off data transfers, steps after a schema change, Neon Auth folded into Iron Session. Use when migrating or importing data, changing a schema, or adding Neon Auth.
---

The binding rules are in [rules/db.md](../../rules/db.md). This skill holds the procedures.

# Migrations and Imports

- For LocalStorage or IndexedDB migrations, keep the behavior; improve the schema when normalization or consolidation is clearly safer.
- Make importers transactional, validated, idempotent and count-verifiable.
- Keep one-off data transfers out of the permanent migration machinery. Verify the source, the destination, the schema, the counts and the runtime connectivity.
- After a schema change: generate the migrations, confirm no drift, migrate a disposable database in the tests, then run typecheck, build and tests.

# Neon

Only when the user asks for Neon, or the project already uses it. Drivers, connection strings, branches and migrations: the `neon-postgres` skill and the `neon-postgres-branches` skill; the driver plumbing lives in `@kirill.konshin/db`.

Neon Auth: set it up per the `neon-auth` skill, then fold it into Iron Session ([rules/auth.md](../../rules/auth.md)):

1. Link the Neon identity to the app user on the server.
2. Store the app context in the sealed Iron Session.
3. Clear the transient Neon session.
