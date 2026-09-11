---
type: always_apply
description: Database persistence and migration rules
---

# IndexedDB

- Use Dexie for browser-owned IndexedDB data.
- Do not keep IndexedDB as a second authority after migrating data to a server database.

# Postgres

- Use Neon Postgres with Drizzle and checked-in generated migrations.
- Prefer Neon HTTP for simple stateless operations; use the pooled serverless driver for transactions, migrations, and connection-oriented work.
- Keep schemas, repositories, tenancy, and authorization app-owned; keep reusable driver plumbing in `@kirill.konshin/db`.
- Import `@kirill.konshin/db` through focused driver, migration, URL, and type subpaths so unrelated drivers are not loaded.
- Keep database access server-only and separate the database/repository layer from API, UI, and state-management layers.
- Preserve canonical external identifiers as strings; never coerce opaque IDs or URNs to numbers.
- Model related state once per owner and entity when that avoids duplicate rows, and enforce invariants with keys, constraints, and indexes.
- Validate inputs at the application boundary and enforce critical invariants again in Postgres.
- Use `DATABASE_URL` at runtime; prefer `DATABASE_URL_UNPOOLED` for migrations and maintenance when available.
- Close owned pools in `finally`; do not leak clients or hide ownership of long-lived connections.
- Fold Neon Auth into [Iron Session](./auth.md): link identity server-side, store app context in the sealed session, then clear the transient Neon session.
- Enforce user and tenant scope on every read and mutation; authentication alone is not authorization.
- For LocalStorage or IndexedDB migrations, preserve behavior but improve the schema when normalization or consolidation is clearly safer.
- Make importers transactional, validated, idempotent, and count-verifiable; never delete server data merely because a mutable export became smaller.
- Keep one-off data transfers out of permanent migration machinery; verify source, destination, schema, counts, and runtime connectivity.
- After schema changes, generate migrations, confirm no drift, migrate a disposable database in tests, and run typecheck/build/tests.
