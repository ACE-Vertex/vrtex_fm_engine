use std::io;

use chrono::Utc;
use rusqlite::{params, types::Type, Connection, OptionalExtension, Result};
use uuid::Uuid;

use super::knowledge_models::{KnowledgePack, SaveKnowledgePack};

pub fn list(
    connection: &Connection,
    enabled_only: bool,
    limit: usize,
) -> Result<Vec<KnowledgePack>> {
    let mut statement = connection.prepare(
        "SELECT id, name, version, description, category, applicable_task_types, rules,
                examples, anti_patterns, validation_hints, priority, enabled, updated_at
         FROM knowledge_packs
         WHERE (?1 = 0 OR enabled = 1)
         ORDER BY priority DESC, name ASC
         LIMIT ?2",
    )?;
    let packs = statement
        .query_map(params![enabled_only, limit as i64], map_pack)?
        .collect();
    packs
}

pub fn load(connection: &Connection, id: &str) -> Result<Option<KnowledgePack>> {
    connection
        .query_row(
            "SELECT id, name, version, description, category, applicable_task_types, rules,
                    examples, anti_patterns, validation_hints, priority, enabled, updated_at
             FROM knowledge_packs WHERE id = ?1",
            [id],
            map_pack,
        )
        .optional()
}

pub fn save(connection: &Connection, input: SaveKnowledgePack) -> Result<KnowledgePack> {
    let id = input
        .id
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    let task_types = encode(&input.applicable_task_types)?;
    let rules = encode(&input.rules)?;
    let examples = encode(&input.examples)?;
    let anti_patterns = encode(&input.anti_patterns)?;
    let validation_hints = encode(&input.validation_hints)?;
    connection.execute(
        "INSERT INTO knowledge_packs (
            id, name, version, description, category, applicable_task_types, rules,
            examples, anti_patterns, validation_hints, priority, enabled, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
         ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            version = excluded.version,
            description = excluded.description,
            category = excluded.category,
            applicable_task_types = excluded.applicable_task_types,
            rules = excluded.rules,
            examples = excluded.examples,
            anti_patterns = excluded.anti_patterns,
            validation_hints = excluded.validation_hints,
            priority = excluded.priority,
            enabled = excluded.enabled,
            updated_at = excluded.updated_at",
        params![
            id,
            input.name.trim(),
            input.version.trim(),
            input.description.trim(),
            input.category.trim(),
            task_types,
            rules,
            examples,
            anti_patterns,
            validation_hints,
            input.priority,
            input.enabled,
            now,
        ],
    )?;
    load(connection, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn delete(connection: &Connection, id: &str) -> Result<bool> {
    Ok(connection.execute("DELETE FROM knowledge_packs WHERE id = ?1", [id])? > 0)
}

fn encode(values: &[String]) -> Result<String> {
    serde_json::to_string(values)
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn decode(value: String, column: usize) -> Result<Vec<String>> {
    serde_json::from_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            Type::Text,
            Box::new(io::Error::new(io::ErrorKind::InvalidData, error)),
        )
    })
}

fn map_pack(row: &rusqlite::Row<'_>) -> Result<KnowledgePack> {
    Ok(KnowledgePack {
        id: row.get(0)?,
        name: row.get(1)?,
        version: row.get(2)?,
        description: row.get(3)?,
        category: row.get(4)?,
        applicable_task_types: decode(row.get(5)?, 5)?,
        rules: decode(row.get(6)?, 6)?,
        examples: decode(row.get(7)?, 7)?,
        anti_patterns: decode(row.get(8)?, 8)?,
        validation_hints: decode(row.get(9)?, 9)?,
        priority: row.get(10)?,
        enabled: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample() -> SaveKnowledgePack {
        SaveKnowledgePack {
            id: Some("custom-script-rules".to_owned()),
            name: "Custom Script Rules".to_owned(),
            version: "1.0.0".to_owned(),
            description: "Project-specific rules".to_owned(),
            category: "script".to_owned(),
            applicable_task_types: vec!["script".to_owned()],
            rules: vec!["Always restore error capture state".to_owned()],
            examples: vec!["Set Error Capture [ On ]".to_owned()],
            anti_patterns: vec!["Ignore Get ( LastError )".to_owned()],
            validation_hints: vec!["Check error branches".to_owned()],
            priority: 120,
            enabled: true,
        }
    }

    #[test]
    fn stores_and_restores_typed_knowledge_pack_fields() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let saved = save(&connection, sample()).unwrap();
        assert_eq!(saved.rules, vec!["Always restore error capture state"]);
        assert_eq!(saved.applicable_task_types, vec!["script"]);

        let enabled = list(&connection, true, 100).unwrap();
        assert!(enabled.iter().any(|pack| pack.id == saved.id));
        assert!(delete(&connection, &saved.id).unwrap());
        assert!(load(&connection, &saved.id).unwrap().is_none());
    }

    #[test]
    fn enabled_filter_excludes_disabled_packs() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let mut input = sample();
        input.enabled = false;
        save(&connection, input).unwrap();
        assert!(!list(&connection, true, 100)
            .unwrap()
            .iter()
            .any(|pack| pack.id == "custom-script-rules"));
        assert!(list(&connection, false, 100)
            .unwrap()
            .iter()
            .any(|pack| pack.id == "custom-script-rules"));
    }
}
