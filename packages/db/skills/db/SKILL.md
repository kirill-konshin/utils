---
name: db
description: Neon Postgres and Drizzle plumbing of `@kirill.konshin/db` - which entry point for which work (`neon-http`, `neon-serverless`, `migrate`), database URLs (`resolveDatabaseUrl`, `DATABASE_URL_UNPOOLED` for migrations), schema-bound types (`TypesFor`), what stays in the app. Use when connecting an app to Postgres with `@kirill.konshin/db`, choosing a driver or running migrations.
---

# Ownership

- The package: driver setup, URL selection, schema-bound types, cleanup of the pools it opens
- The app: schemas, queries, migrations, repositories, fixtures, authorization, tenancy
- The package reads no environment variables and opens no connection during import: pass a URL or a lazy resolver

# Entry Points

Import the subpath, never the root, so the app does not load drivers it does not use.

| Subpath            | Use                                                                                                                     |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| `/types`           | `TypesFor<typeof schema>`: bind the database, transaction and executor types to the schema once                         |
| `/neon-http`       | `createNeonHttpDatabase`: stateless queries, the default for request handlers                                           |
| `/neon-serverless` | `withNeonDatabase`: a short-lived pool for transactions and connection-oriented APIs; it closes the pool after the call |
| `/migrate`         | `migrateNeonDatabase`: apply the checked-in migrations from an app script                                               |
| `/url`             | `resolveDatabaseUrl(process.env)`: `DATABASE_URL`; with `'maintenance'`, `DATABASE_URL_UNPOOLED` first                  |

```ts
import type { TypesFor } from '@kirill.konshin/db/types';
import { createNeonHttpDatabase } from '@kirill.konshin/db/neon-http';
import { migrateNeonDatabase } from '@kirill.konshin/db/migrate';
import { resolveDatabaseUrl } from '@kirill.konshin/db/url';

import type * as schema from './schema';

export type Types = TypesFor<typeof schema>;

export const database = createNeonHttpDatabase({ schema, url: () => resolveDatabaseUrl(process.env) });

// scripts/migrate.ts
await migrateNeonDatabase({ migrationsFolder: 'drizzle', url: () => resolveDatabaseUrl(process.env, 'maintenance') });
```
