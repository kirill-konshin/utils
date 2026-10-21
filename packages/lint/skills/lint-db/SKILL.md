---
name: lint-db
description: Database procedures for the db rule - LocalStorage / IndexedDB to server migrations, transactional importers, one-off data transfers, steps after a schema change, Neon (HTTP vs pooled driver, Drizzle migrations, Neon Auth with Iron Session). Use when migrating or importing data, changing a schema, or working with Neon.
---

The binding rules are in [rules/db.md](../../rules/db.md). This skill holds the procedures.

# Migrations and Imports

- For LocalStorage or IndexedDB migrations, preserve behavior but improve the schema when normalization or consolidation is clearly safer.
- Make importers transactional, validated, idempotent, and count-verifiable; never delete server data merely because a mutable export became smaller.
- Keep one-off data transfers out of permanent migration machinery; verify source, destination, schema, counts, and runtime connectivity.
- After schema changes, generate migrations, confirm no drift, migrate a disposable database in tests, and run typecheck/build/tests.

# Neon

Only applies if user specifically asked to add Neon as DB, or project already uses Neon as DB.

- Prefer Neon HTTP for simple stateless operations; use the pooled serverless driver for transactions, migrations, and connection-oriented work.
- Use Neon Postgres with Drizzle and checked-in generated migrations.
- Fold Neon Auth into Iron Session ([rules/auth.md](../../rules/auth.md)): link identity server-side, store app context in the sealed session, then clear the transient Neon session.
