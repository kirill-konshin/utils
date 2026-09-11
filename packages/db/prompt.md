# Design contract

- Keep driver setup, URL selection, schema-aware generic types, and owned-pool cleanup here.
- Keep schemas, queries, migrations, repositories, fixtures, authorization, and tenancy in applications.
- Use Neon HTTP for stateless work and a serverless pool only for transactions, migrations, or connection-oriented APIs.
- Require explicit URLs or lazy resolvers; never read environment variables or connect during import.
- Use focused subpath imports and preserve exact Drizzle schema and PGlite executor types without broad casts.
- Test without network access or credentials and close every owned pool on success and failure.
