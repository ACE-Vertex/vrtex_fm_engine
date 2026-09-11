use chrono::Utc;
use rusqlite::{params, Connection, Result};

const INITIAL_SCHEMA: &str = include_str!("../../migrations/001_initial.sql");
const LIBRARY_STATE_SCHEMA: &str = include_str!("../../migrations/002_library_state.sql");
const HISTORY_STATE_SCHEMA: &str = include_str!("../../migrations/003_history_state.sql");
const AI_ASSISTANT_SCHEMA: &str = include_str!("../../migrations/004_ai_assistant.sql");
const KNOWLEDGE_PACK_SCHEMA: &str = include_str!("../../migrations/005_knowledge_packs.sql");
const INITIAL_VERSION: i64 = 1;

pub fn run(connection: &Connection) -> Result<()> {
    // Bootstrap only the migration ledger before checking any version.
    // All actual schema changes and version markers are committed atomically
    // by apply().
    connection.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version INTEGER PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;

    apply(connection, INITIAL_VERSION, INITIAL_SCHEMA)?;
    apply(connection, 2, LIBRARY_STATE_SCHEMA)?;
    apply(connection, 3, HISTORY_STATE_SCHEMA)?;
    apply(connection, 4, AI_ASSISTANT_SCHEMA)?;
    apply(connection, 5, KNOWLEDGE_PACK_SCHEMA)?;
    Ok(())
}

fn apply(connection: &Connection, version: i64, sql: &str) -> Result<()> {
    let applied: bool = connection.query_row(
        "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
        [version],
        |row| row.get(0),
    )?;
    if applied {
        return Ok(());
    }

    // unchecked_transaction is intentional here: the database wrapper owns
    // the connection behind a Mutex, while migration code receives &Connection.
    // The transaction still guarantees that schema mutation and its version
    // marker either both commit or both roll back.
    let transaction = connection.unchecked_transaction()?;
    transaction.execute_batch(sql)?;
    transaction.execute(
        "INSERT INTO schema_migrations(version, applied_at) VALUES (?1, ?2)",
        params![version, Utc::now().to_rfc3339()],
    )?;
    transaction.commit()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn applies_all_migrations_once_and_is_idempotent() {
        let connection = Connection::open_in_memory().unwrap();

        run(&connection).unwrap();
        run(&connection).unwrap();

        let versions: Vec<i64> = {
            let mut statement = connection
                .prepare("SELECT version FROM schema_migrations ORDER BY version")
                .unwrap();
            statement
                .query_map([], |row| row.get(0))
                .unwrap()
                .collect::<Result<Vec<_>>>()
                .unwrap()
        };

        assert_eq!(versions, vec![1, 2, 3, 4, 5]);
    }

    #[test]
    fn failed_migration_rolls_back_schema_and_version_marker() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch(
                "CREATE TABLE schema_migrations (
                    version INTEGER PRIMARY KEY,
                    applied_at TEXT NOT NULL
                );",
            )
            .unwrap();

        let broken = "
            CREATE TABLE atomic_probe (
                id INTEGER PRIMARY KEY,
                value TEXT NOT NULL
            );
            THIS IS INTENTIONALLY INVALID SQL;
        ";

        assert!(apply(&connection, 99, broken).is_err());

        let table_exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM sqlite_master
                    WHERE type = 'table' AND name = 'atomic_probe'
                )",
                [],
                |row| row.get(0),
            )
            .unwrap();

        let marker_exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                    SELECT 1
                    FROM schema_migrations
                    WHERE version = 99
                )",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert!(!table_exists);
        assert!(!marker_exists);
    }
}
