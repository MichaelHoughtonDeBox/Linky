# Migrations

This folder holds incremental, idempotent SQL migrations. Apply them in
numerical order to upgrade an existing Linky database without losing data.

## Running migrations

```bash
npm run db:migrate
```

Applies every file in this folder in order, skipping ones that have
already been applied (thanks to `CREATE TABLE IF NOT EXISTS`, `ADD
COLUMN IF NOT EXISTS`, and similar guards). Safe to re-run.

## Fresh installs

For a brand-new database, prefer `db/schema.sql`:

```bash
npm run db:schema
```

`db/schema.sql` is the canonical current-state snapshot. It is kept in
sync by hand whenever a new migration is added — always reflect the
post-migration shape in `schema.sql` in the same commit.

## Authoring new migrations

1. Bump the numeric prefix: `003_<short-name>.sql`, `004_...`, etc.
2. Wrap changes in `BEGIN; ... COMMIT;` so partial failures are rolled back.
3. Every statement must be idempotent:
   - `CREATE TABLE IF NOT EXISTS`
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
   - `CREATE INDEX IF NOT EXISTS`
   - For constraints and other constructs without an `IF NOT EXISTS`, use
     a `DO $$ BEGIN ... END $$` block that checks `pg_constraint` /
     `pg_indexes` / etc. first. (See `002_auth_ownership.sql` for an
     example.)
4. Update `db/schema.sql` in the same commit so fresh installs produce
   the same end state.
5. Do not edit migration files after they land on `main`. If a migration
   is wrong, write a follow-up migration to fix it — that preserves the
   property that anyone who applied the broken version first can still
   converge to the correct state.

## Backfills

Data backfills (UPDATE/INSERT with non-trivial logic) should live in
migration files too, guarded so they only run once. Prefer to read a
sentinel column (`WHERE new_column IS NULL`) rather than tracking
applied-migrations state in a separate table — we'd rather have
idempotent SQL than infrastructure for managing it.
