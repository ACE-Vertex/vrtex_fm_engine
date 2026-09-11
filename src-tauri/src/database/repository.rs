use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use super::models::{ClipboardItem, SaveClipboardItem};

pub fn list_history(connection: &Connection, limit: usize) -> Result<Vec<ClipboardItem>> {
    let mut statement = connection.prepare(
        "SELECT id, name, format, windows_format, object_type, xml, checksum,
                filemaker_version, notes, favorite, saved_to_library, in_history, created_at, updated_at, last_used_at
         FROM clipboard_items
         WHERE in_history = 1 OR favorite = 1
         ORDER BY last_used_at DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], map_item)?;
    rows.collect()
}

pub fn list_library(connection: &Connection, limit: usize) -> Result<Vec<ClipboardItem>> {
    let mut statement = connection.prepare(
        "SELECT id, name, format, windows_format, object_type, xml, checksum,
                filemaker_version, notes, favorite, saved_to_library, in_history, created_at, updated_at, last_used_at
         FROM clipboard_items
         WHERE saved_to_library = 1
         ORDER BY updated_at DESC
         LIMIT ?1",
    )?;
    let rows = statement.query_map([limit as i64], map_item)?;
    rows.collect()
}

pub fn load(connection: &Connection, id: &str) -> Result<Option<ClipboardItem>> {
    connection
        .query_row(
            "SELECT id, name, format, windows_format, object_type, xml, checksum,
                    filemaker_version, notes, favorite, saved_to_library, in_history, created_at, updated_at, last_used_at
             FROM clipboard_items WHERE id = ?1",
            [id],
            map_item,
        )
        .optional()
}

pub fn save(connection: &Connection, input: SaveClipboardItem) -> Result<ClipboardItem> {
    let checksum = checksum(&input.xml);
    let now = Utc::now().to_rfc3339();
    if let Some(id) = input.id.clone() {
        let previous = connection
            .query_row(
                "SELECT xml, checksum FROM clipboard_items WHERE id = ?1",
                [&id],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()?;
        if let Some((previous_xml, previous_checksum)) = previous {
            if previous_checksum != checksum {
                connection.execute(
                    "INSERT INTO clipboard_revisions (id, clipboard_item_id, xml, checksum, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![Uuid::new_v4().to_string(), id, previous_xml, previous_checksum, now],
                )?;
            }
            connection.execute(
                "UPDATE clipboard_items SET
                    name = ?2, format = ?3, windows_format = ?4, object_type = ?5,
                    xml = ?6, checksum = ?7, filemaker_version = ?8, notes = ?9,
                    favorite = ?10, saved_to_library = ?11, in_history = ?12,
                    updated_at = ?13, last_used_at = ?13
                 WHERE id = ?1",
                params![
                    id,
                    input.name,
                    input.format,
                    input.windows_format,
                    input.object_type,
                    input.xml,
                    checksum,
                    input.filemaker_version,
                    input.notes,
                    input.favorite,
                    input.in_library,
                    input.in_history,
                    now,
                ],
            )?;
            return load(connection, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows);
        }
    }
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    connection.execute(
        "INSERT INTO clipboard_items (
            id, name, format, windows_format, object_type, xml, checksum,
            filemaker_version, notes, favorite, saved_to_library, in_history, created_at, updated_at, last_used_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?13, ?13)
         ON CONFLICT(checksum) DO UPDATE SET
            name = excluded.name,
            format = excluded.format,
            windows_format = excluded.windows_format,
            object_type = excluded.object_type,
            filemaker_version = excluded.filemaker_version,
            notes = excluded.notes,
            favorite = excluded.favorite,
            saved_to_library = MAX(clipboard_items.saved_to_library, excluded.saved_to_library),
            in_history = MAX(clipboard_items.in_history, excluded.in_history),
            updated_at = excluded.updated_at,
            last_used_at = excluded.last_used_at",
        params![
            id,
            input.name,
            input.format,
            input.windows_format,
            input.object_type,
            input.xml,
            checksum,
            input.filemaker_version,
            input.notes,
            input.favorite,
            input.in_library,
            input.in_history,
            now,
        ],
    )?;
    connection.query_row(
        "SELECT id, name, format, windows_format, object_type, xml, checksum,
                filemaker_version, notes, favorite, saved_to_library, in_history, created_at, updated_at, last_used_at
         FROM clipboard_items WHERE checksum = ?1",
        [checksum],
        map_item,
    )
}

pub fn delete(connection: &Connection, id: &str) -> Result<bool> {
    Ok(connection.execute("DELETE FROM clipboard_items WHERE id = ?1", [id])? > 0)
}

pub fn update_favorite(connection: &Connection, id: &str, favorite: bool) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    let updated = connection.execute(
        "UPDATE clipboard_items SET favorite = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, favorite, now],
    )? > 0;
    if updated && !favorite {
        connection.execute(
            "DELETE FROM clipboard_items
             WHERE id = ?1 AND favorite = 0 AND saved_to_library = 0 AND in_history = 0",
            [id],
        )?;
    }
    Ok(updated)
}

pub fn update_notes(connection: &Connection, id: &str, notes: &str) -> Result<bool> {
    let now = Utc::now().to_rfc3339();
    Ok(connection.execute(
        "UPDATE clipboard_items SET notes = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, notes, now],
    )? > 0)
}

pub fn clear_clipboard(connection: &mut Connection) -> Result<usize> {
    let transaction = connection.transaction()?;
    let hidden = transaction.execute(
        "UPDATE clipboard_items SET in_history = 0, updated_at = ?1
         WHERE in_history = 1 AND (saved_to_library = 1 OR favorite = 1)",
        [Utc::now().to_rfc3339()],
    )?;
    let deleted = transaction.execute(
        "DELETE FROM clipboard_items
         WHERE in_history = 1 AND saved_to_library = 0 AND favorite = 0",
        [],
    )?;
    transaction.commit()?;
    Ok(hidden + deleted)
}

pub fn clear_library(connection: &mut Connection) -> Result<usize> {
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM collection_items", [])?;
    let collections = transaction.execute("DELETE FROM collections", [])?;
    transaction.execute("DELETE FROM clipboard_tags", [])?;
    let tags = transaction.execute("DELETE FROM tags", [])?;
    let items = transaction.execute(
        "UPDATE clipboard_items SET saved_to_library = 0, updated_at = ?1 WHERE saved_to_library = 1",
        [Utc::now().to_rfc3339()],
    )?;
    let removed_orphans = transaction.execute(
        "DELETE FROM clipboard_items
         WHERE saved_to_library = 0 AND in_history = 0 AND favorite = 0",
        [],
    )?;
    transaction.commit()?;
    Ok(items + collections + tags + removed_orphans)
}

pub fn clear_all(connection: &mut Connection) -> Result<usize> {
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM collection_items", [])?;
    transaction.execute("DELETE FROM clipboard_tags", [])?;
    transaction.execute("DELETE FROM clipboard_revisions", [])?;
    let items = transaction.execute("DELETE FROM clipboard_items", [])?;
    let collections = transaction.execute("DELETE FROM collections", [])?;
    let tags = transaction.execute("DELETE FROM tags", [])?;
    transaction.commit()?;
    Ok(items + collections + tags)
}

fn checksum(xml: &str) -> String {
    format!("{:x}", Sha256::digest(xml.as_bytes()))
}

fn map_item(row: &rusqlite::Row<'_>) -> Result<ClipboardItem> {
    Ok(ClipboardItem {
        id: row.get(0)?,
        name: row.get(1)?,
        format: row.get(2)?,
        windows_format: row.get(3)?,
        object_type: row.get(4)?,
        xml: row.get(5)?,
        checksum: row.get(6)?,
        filemaker_version: row.get(7)?,
        notes: row.get(8)?,
        favorite: row.get(9)?,
        in_library: row.get(10)?,
        in_history: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
        last_used_at: row.get(14)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> SaveClipboardItem {
        SaveClipboardItem {
            id: None,
            name: "Script".to_owned(),
            format: "XMSC".to_owned(),
            windows_format: "Mac-XMSC".to_owned(),
            object_type: "Script".to_owned(),
            xml: "<fmxmlsnippet><Script /></fmxmlsnippet>".to_owned(),
            filemaker_version: Some("26.0".to_owned()),
            notes: String::new(),
            favorite: false,
            in_library: false,
            in_history: true,
        }
    }

    #[test]
    fn duplicate_checksum_reuses_the_existing_item() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let first = save(&connection, sample()).unwrap();
        let second = save(&connection, sample()).unwrap();
        assert_eq!(first.id, second.id);
        assert_eq!(list_history(&connection, 20).unwrap().len(), 1);
    }

    #[test]
    fn clearing_history_preserves_favorites_until_they_are_unfavorited() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let item = save(&connection, sample()).unwrap();

        assert!(update_favorite(&connection, &item.id, true).unwrap());
        assert!(update_notes(&connection, &item.id, "reviewed").unwrap());
        let updated = load(&connection, &item.id).unwrap().unwrap();
        assert!(updated.favorite);
        assert_eq!(updated.notes, "reviewed");

        assert_eq!(clear_clipboard(&mut connection).unwrap(), 1);
        let favorites = list_history(&connection, 20).unwrap();
        assert_eq!(favorites.len(), 1);
        assert!(favorites[0].favorite);
        assert!(!favorites[0].in_history);

        assert!(update_favorite(&connection, &item.id, false).unwrap());
        assert!(load(&connection, &item.id).unwrap().is_none());
        assert!(list_history(&connection, 20).unwrap().is_empty());
    }

    #[test]
    fn clearing_history_deletes_items_without_favorite_or_library_protection() {
        let mut connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let item = save(&connection, sample()).unwrap();

        assert_eq!(clear_clipboard(&mut connection).unwrap(), 1);
        assert!(load(&connection, &item.id).unwrap().is_none());
        assert!(list_history(&connection, 20).unwrap().is_empty());
    }
}
