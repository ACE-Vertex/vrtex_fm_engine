# Vertex FM Engine Production Completion — DB Migration Safety 000002

Scope is intentionally narrow.

## Production change
Only `src-tauri/src/database/migrations.rs` changes.

## Guarantee
Every migration's schema SQL and its `schema_migrations` version marker are
written in one SQLite transaction. If execution fails or the process exits
before commit, SQLite rolls the migration back and the next launch can retry
from a consistent state.

## Preserved
- Existing migration SQL files are unchanged.
- Existing database schema versions remain 1..5, including knowledge packs.
- FileMaker Clipboard code is untouched.
- XML validation code is untouched.
- UI is untouched.

## Verify
Runs only the migration test module, including an injected invalid SQL migration
that must leave neither the test table nor version marker behind.
