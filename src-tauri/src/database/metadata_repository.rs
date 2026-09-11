use std::collections::BTreeMap;

use chrono::Utc;
use rusqlite::{params, Connection, Result};

use super::models::{CollectionAssignment, CollectionRecord, ItemTags};

pub fn list_tags(connection: &Connection) -> Result<Vec<ItemTags>> {
    let mut statement = connection.prepare(
        "SELECT ct.clipboard_item_id, t.name
         FROM clipboard_tags ct
         JOIN tags t ON t.id = ct.tag_id
         ORDER BY ct.clipboard_item_id, t.name COLLATE NOCASE",
    )?;
    let rows = statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })?;
    let mut grouped = BTreeMap::<String, Vec<String>>::new();
    for row in rows {
        let (item_id, tag) = row?;
        grouped.entry(item_id).or_default().push(tag);
    }
    Ok(grouped
        .into_iter()
        .map(|(clipboard_item_id, tags)| ItemTags {
            clipboard_item_id,
            tags,
        })
        .collect())
}

pub fn set_tags(
    connection: &mut Connection,
    item_id: &str,
    tags: &[String],
) -> Result<Vec<String>> {
    let transaction = connection.transaction()?;
    transaction.execute(
        "DELETE FROM clipboard_tags WHERE clipboard_item_id = ?1",
        [item_id],
    )?;
    let now = Utc::now().to_rfc3339();
    let mut normalized = Vec::<String>::new();
    for value in tags {
        let tag = value.trim();
        if tag.is_empty()
            || normalized
                .iter()
                .any(|saved| saved.eq_ignore_ascii_case(tag))
        {
            continue;
        }
        transaction.execute(
            "INSERT OR IGNORE INTO tags (id, name, created_at) VALUES (lower(hex(randomblob(16))), ?1, ?2)",
            params![tag, now],
        )?;
        let tag_id: String =
            transaction.query_row("SELECT id FROM tags WHERE name = ?1", [tag], |row| {
                row.get(0)
            })?;
        transaction.execute(
            "INSERT OR IGNORE INTO clipboard_tags (clipboard_item_id, tag_id) VALUES (?1, ?2)",
            params![item_id, tag_id],
        )?;
        normalized.push(tag.to_owned());
    }
    transaction.execute(
        "DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM clipboard_tags)",
        [],
    )?;
    transaction.commit()?;
    Ok(normalized)
}

pub fn list_collections(connection: &Connection) -> Result<Vec<CollectionRecord>> {
    let mut statement = connection.prepare(
        "SELECT c.id, c.name, c.parent_id, COUNT(ci.clipboard_item_id)
         FROM collections c
         LEFT JOIN collection_items ci ON ci.collection_id = c.id
         GROUP BY c.id, c.name, c.parent_id
         ORDER BY c.created_at, c.name COLLATE NOCASE",
    )?;
    let collections = statement
        .query_map([], |row| {
            Ok(CollectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                parent_id: row.get(2)?,
                count: row.get(3)?,
            })
        })?
        .collect();
    collections
}

pub fn save_collection(
    connection: &Connection,
    collection: CollectionRecord,
) -> Result<CollectionRecord> {
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO collections (id, name, parent_id, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, updated_at = excluded.updated_at",
        params![collection.id, collection.name, collection.parent_id, now],
    )?;
    Ok(collection)
}

pub fn delete_collection(
    connection: &mut Connection,
    id: &str,
    fallback_id: Option<&str>,
) -> Result<bool> {
    let transaction = connection.transaction()?;
    if let Some(fallback) = fallback_id.filter(|fallback| *fallback != id) {
        transaction.execute(
            "INSERT OR IGNORE INTO collection_items (collection_id, clipboard_item_id, added_at)
             SELECT ?1, clipboard_item_id, added_at FROM collection_items WHERE collection_id = ?2",
            params![fallback, id],
        )?;
    }
    transaction.execute(
        "DELETE FROM collection_items WHERE collection_id = ?1",
        [id],
    )?;
    let deleted = transaction.execute("DELETE FROM collections WHERE id = ?1", [id])? > 0;
    transaction.commit()?;
    Ok(deleted)
}

pub fn list_assignments(connection: &Connection) -> Result<Vec<CollectionAssignment>> {
    let mut statement = connection.prepare(
        "SELECT collection_id, clipboard_item_id FROM collection_items ORDER BY added_at",
    )?;
    let assignments = statement
        .query_map([], |row| {
            Ok(CollectionAssignment {
                collection_id: row.get(0)?,
                clipboard_item_id: row.get(1)?,
            })
        })?
        .collect();
    assignments
}

pub fn assign_item(
    connection: &mut Connection,
    collection_id: &str,
    item_id: &str,
) -> Result<bool> {
    let transaction = connection.transaction()?;
    transaction.execute(
        "DELETE FROM collection_items WHERE clipboard_item_id = ?1",
        [item_id],
    )?;
    let inserted = transaction.execute(
        "INSERT INTO collection_items (collection_id, clipboard_item_id, added_at) VALUES (?1, ?2, ?3)",
        params![collection_id, item_id, Utc::now().to_rfc3339()],
    )? > 0;
    transaction.commit()?;
    Ok(inserted)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::database::{migrations, models::SaveClipboardItem, repository};

    fn connection() -> Connection {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .pragma_update(None, "foreign_keys", "ON")
            .unwrap();
        migrations::run(&connection).unwrap();
        connection
    }

    fn save_item(connection: &Connection, id: &str) {
        repository::save(
            connection,
            SaveClipboardItem {
                id: Some(id.to_owned()),
                name: "Test".to_owned(),
                format: "XMSS".to_owned(),
                windows_format: "Mac-XMSS".to_owned(),
                object_type: "Step".to_owned(),
                xml: format!("<fmxmlsnippet><Step id=\"{id}\" /></fmxmlsnippet>"),
                filemaker_version: None,
                notes: String::new(),
                favorite: false,
                in_library: false,
                in_history: true,
            },
        )
        .unwrap();
    }

    #[test]
    fn persists_tags_and_collection_assignments() {
        let mut connection = connection();
        save_item(&connection, "item-1");
        let default = CollectionRecord {
            id: "default".to_owned(),
            name: "Default".to_owned(),
            parent_id: None,
            count: 0,
        };
        save_collection(&connection, default).unwrap();
        set_tags(
            &mut connection,
            "item-1",
            &["JSON".to_owned(), "Import".to_owned()],
        )
        .unwrap();
        assign_item(&mut connection, "default", "item-1").unwrap();
        assert_eq!(
            list_tags(&connection).unwrap()[0].tags,
            vec!["Import", "JSON"]
        );
        assert_eq!(list_assignments(&connection).unwrap().len(), 1);
        assert_eq!(list_collections(&connection).unwrap()[0].count, 1);
    }
}
