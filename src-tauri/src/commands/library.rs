use tauri::State;

use crate::database::models::{
    ClipboardItem, CollectionAssignment, CollectionRecord, ItemTags, SaveClipboardItem,
};
use crate::database::{metadata_repository, repository};
use crate::AppState;

#[tauri::command]
pub fn list_clipboard_history(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ClipboardItem>, String> {
    state
        .database
        .with_connection(|connection| repository::list_history(connection, limit.unwrap_or(200)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_library_items(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<ClipboardItem>, String> {
    state
        .database
        .with_connection(|connection| repository::list_library(connection, limit.unwrap_or(500)))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_clipboard_item(
    state: State<'_, AppState>,
    item: SaveClipboardItem,
) -> Result<ClipboardItem, String> {
    state
        .database
        .with_connection(|connection| repository::save(connection, item))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_clipboard_item(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<ClipboardItem>, String> {
    state
        .database
        .with_connection(|connection| repository::load(connection, &id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_clipboard_item(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state
        .database
        .with_connection(|connection| repository::delete(connection, &id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_clipboard_favorite(
    state: State<'_, AppState>,
    id: String,
    favorite: bool,
) -> Result<bool, String> {
    state
        .database
        .with_connection(|connection| repository::update_favorite(connection, &id, favorite))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_clipboard_notes(
    state: State<'_, AppState>,
    id: String,
    notes: String,
) -> Result<bool, String> {
    state
        .database
        .with_connection(|connection| repository::update_notes(connection, &id, &notes))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_clipboard_history(state: State<'_, AppState>) -> Result<usize, String> {
    state
        .database
        .with_connection_mut(repository::clear_clipboard)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_library_data(state: State<'_, AppState>) -> Result<usize, String> {
    state
        .database
        .with_connection_mut(repository::clear_library)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn clear_all_data(state: State<'_, AppState>) -> Result<usize, String> {
    state
        .database
        .with_connection_mut(repository::clear_all)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_clipboard_tags(state: State<'_, AppState>) -> Result<Vec<ItemTags>, String> {
    state
        .database
        .with_connection(metadata_repository::list_tags)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn set_clipboard_tags(
    state: State<'_, AppState>,
    item_id: String,
    tags: Vec<String>,
) -> Result<Vec<String>, String> {
    state
        .database
        .with_connection_mut(|connection| {
            metadata_repository::set_tags(connection, &item_id, &tags)
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> Result<Vec<CollectionRecord>, String> {
    state
        .database
        .with_connection(metadata_repository::list_collections)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_collection(
    state: State<'_, AppState>,
    collection: CollectionRecord,
) -> Result<CollectionRecord, String> {
    state
        .database
        .with_connection(|connection| metadata_repository::save_collection(connection, collection))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_collection(
    state: State<'_, AppState>,
    id: String,
    fallback_id: Option<String>,
) -> Result<bool, String> {
    state
        .database
        .with_connection_mut(|connection| {
            metadata_repository::delete_collection(connection, &id, fallback_id.as_deref())
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_collection_assignments(
    state: State<'_, AppState>,
) -> Result<Vec<CollectionAssignment>, String> {
    state
        .database
        .with_connection(metadata_repository::list_assignments)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn assign_collection_item(
    state: State<'_, AppState>,
    collection_id: String,
    item_id: String,
) -> Result<bool, String> {
    state
        .database
        .with_connection_mut(|connection| {
            metadata_repository::assign_item(connection, &collection_id, &item_id)
        })
        .map_err(|error| error.to_string())
}
