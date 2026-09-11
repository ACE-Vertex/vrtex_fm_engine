pub mod ai_models;
pub mod ai_repository;
pub mod knowledge_models;
pub mod knowledge_repository;
pub mod metadata_repository;
pub mod migrations;
pub mod models;
pub mod repository;

use std::path::Path;
use std::sync::Mutex;

use rusqlite::{Connection, Result};

pub struct Database {
    connection: Mutex<Connection>,
}

impl Database {
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        let connection = Connection::open(path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        migrations::run(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
        })
    }

    pub fn with_connection<T>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T>,
    ) -> Result<T> {
        let connection = self
            .connection
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        operation(&connection)
    }

    pub fn with_connection_mut<T>(
        &self,
        operation: impl FnOnce(&mut Connection) -> Result<T>,
    ) -> Result<T> {
        let mut connection = self
            .connection
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        operation(&mut connection)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creates_the_initial_schema() {
        let database = Database::open(":memory:").unwrap();
        let table_count: i64 = database
            .with_connection(|connection| {
                connection.query_row(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'clipboard_items'",
                    [],
                    |row| row.get(0),
                )
            })
            .unwrap();
        assert_eq!(table_count, 1);
    }
}
