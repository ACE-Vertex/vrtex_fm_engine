use tauri::State;

use crate::database::knowledge_models::{KnowledgePack, SaveKnowledgePack};
use crate::database::knowledge_repository;
use crate::license::{FILEMAKER_KNOWLEDGE_BASE, KNOWLEDGE_PACK_BUILDER};
use crate::AppState;

#[tauri::command]
pub fn list_knowledge_packs(
    state: State<'_, AppState>,
    enabled_only: Option<bool>,
    limit: Option<usize>,
) -> Result<Vec<KnowledgePack>, String> {
    state.license.require(FILEMAKER_KNOWLEDGE_BASE)?;
    state
        .database
        .with_connection(|connection| {
            knowledge_repository::list(
                connection,
                enabled_only.unwrap_or(false),
                limit.unwrap_or(500).min(2_000),
            )
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_knowledge_pack(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<KnowledgePack>, String> {
    state.license.require(FILEMAKER_KNOWLEDGE_BASE)?;
    state
        .database
        .with_connection(|connection| knowledge_repository::load(connection, &id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_knowledge_pack(
    state: State<'_, AppState>,
    pack: SaveKnowledgePack,
) -> Result<KnowledgePack, String> {
    state.license.require(KNOWLEDGE_PACK_BUILDER)?;
    if pack.id.as_deref().is_some_and(is_official_pack) {
        return Err("Official Knowledge Packは複製して編集してください".to_owned());
    }
    validate_pack(&pack)?;
    state
        .database
        .with_connection(|connection| knowledge_repository::save(connection, pack))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_knowledge_pack(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.license.require(KNOWLEDGE_PACK_BUILDER)?;
    if is_official_pack(&id) {
        return Err("Official Knowledge Packは削除できません".to_owned());
    }
    state
        .database
        .with_connection(|connection| knowledge_repository::delete(connection, &id))
        .map_err(|error| error.to_string())
}

fn validate_pack(pack: &SaveKnowledgePack) -> Result<(), String> {
    if pack.name.trim().is_empty() {
        return Err("Knowledge Pack名を入力してください".to_owned());
    }
    if pack.version.trim().is_empty() {
        return Err("Knowledge PackのVersionを入力してください".to_owned());
    }
    if pack.category.trim().is_empty() {
        return Err("Knowledge PackのCategoryを入力してください".to_owned());
    }
    if pack.rules.len() > 2_000
        || pack.examples.len() > 2_000
        || pack.anti_patterns.len() > 2_000
        || pack.validation_hints.len() > 2_000
    {
        return Err("Knowledge Packの項目数が上限を超えています".to_owned());
    }
    Ok(())
}

fn is_official_pack(id: &str) -> bool {
    matches!(
        id,
        "filemaker-xml-core"
            | "fmxmlsnippet-core"
            | "table-definition"
            | "field-definition"
            | "script-rules"
            | "script-step-rules"
            | "calculation-rules"
            | "naming-rules"
            | "vertex-validation-rules"
            | "relationship-design-rules"
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_pack_without_identity_fields() {
        let input = SaveKnowledgePack {
            id: None,
            name: "".to_owned(),
            version: "1.0.0".to_owned(),
            description: String::new(),
            category: "script".to_owned(),
            applicable_task_types: Vec::new(),
            rules: Vec::new(),
            examples: Vec::new(),
            anti_patterns: Vec::new(),
            validation_hints: Vec::new(),
            priority: 0,
            enabled: true,
        };
        assert!(validate_pack(&input).is_err());
    }
}
