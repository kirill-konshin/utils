# @kirill.konshin/db

Typed, server-only Neon Postgres and Drizzle infrastructure. Schemas, queries, migrations, repositories, tenancy, and authorization remain application-owned.

```sh
yarn add @kirill.konshin/db drizzle-orm
```

Bind the shared database, transaction, and executor types to an application schema once:

```ts
import type { TypesFor } from '@kirill.konshin/db/types';

import type * as schema from './schema';

export type Types = TypesFor<typeof schema>;
```

Use focused entry points so stateless HTTP consumers do not load pooled or migration code:

```ts
import { createNeonHttpDatabase } from '@kirill.konshin/db/neon-http';
import { resolveDatabaseUrl } from '@kirill.konshin/db/url';

const database = createNeonHttpDatabase({
    schema,
    url: () => resolveDatabaseUrl(process.env),
});
```

Use a short-lived pool for connection-oriented work:

```ts
import { withNeonDatabase } from '@kirill.konshin/db/neon-serverless';

const result = await withNeonDatabase({ schema, url: () => resolveDatabaseUrl(process.env) }, async (database) =>
    database.transaction(operation),
);
```

Apply checked-in migrations from an application script:

```ts
import { migrateNeonDatabase } from '@kirill.konshin/db/migrate';

await migrateNeonDatabase({
    migrationsFolder: 'drizzle',
    url: () => resolveDatabaseUrl(process.env, 'maintenance'),
});
```

The HTTP helper is stateless. The serverless and migration helpers create one pool per call and always close it. No module reads environment variables or opens connections during import.
