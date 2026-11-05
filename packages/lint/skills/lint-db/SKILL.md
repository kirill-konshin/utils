---
name: lint-db
description: Database procedures for the db rule - LocalStorage / IndexedDB to server migrations, transactional importers, one-off data transfers, steps after a schema change. Use when migrating or importing data, or changing a schema.
---

The binding rules are in [rules/db.md](../../rules/db.md). This skill holds the procedures.

# Migrations and Imports

- For LocalStorage or IndexedDB migrations, keep the behavior; improve the schema when normalization or consolidation is clearly safer.
- Make importers transactional, validated, idempotent and count-verifiable.
- Keep one-off data transfers out of the permanent migration machinery. Verify the source, the destination, the schema, the counts and the runtime connectivity.
- After a schema change: generate the migrations, confirm no drift, migrate a disposable database in the tests, then run typecheck, build and tests.

# Neon

Only when the user asks for Neon, or the project already uses it. Connection strings, branches and migrations: the `neon-postgres` skill and the `neon-postgres-branches` skill. Drivers, URLs and migration runs: `@kirill.konshin/db` and its `db` skill, it installs with the package.

Neon Auth: the `auth` skill of `@kirill.konshin/auth` (`neonStrategy`), it installs with the package.
