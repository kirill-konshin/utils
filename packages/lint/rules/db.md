---
type: always_apply
description: Database persistence and migration rules
---

Migration and import procedures, Neon: the `lint-db` skill.

# IndexedDB

- Use Dexie for browser-owned IndexedDB data.
- Do not keep IndexedDB as a second authority after migrating data to a server database.

# Postgres

- Use Drizzle as ORM if user asks to add ORM
- Keep schemas, repositories, tenancy, and authorization app-owned; keep reusable driver plumbing in `@kirill.konshin/db`.
- Import `@kirill.konshin/db` through focused driver, migration, URL, and type subpaths so unrelated drivers are not loaded.
- Keep database access server-only and separate the database/repository layer from API, UI, and state-management layers.
- Preserve canonical external identifiers as strings; never coerce opaque IDs or URNs to numbers.
- Model related state once per owner and entity when that avoids duplicate rows, and enforce invariants with keys, constraints, and indexes.
- Validate inputs at the application boundary and enforce critical invariants again in Postgres.
- Use `DATABASE_URL` at runtime; prefer `DATABASE_URL_UNPOOLED` for migrations and maintenance when available.
- Close owned pools in `finally`; do not leak clients or hide ownership of long-lived connections.
- Enforce user and tenant scope on every read and mutation; authentication alone is not authorization.
- Never delete server data only because a mutable export became smaller
- Data migrations, importers and schema changes: follow the `lint-db` skill

# Neon

- Only if the user asks for Neon, or the project already uses it: follow the `lint-db` skill
