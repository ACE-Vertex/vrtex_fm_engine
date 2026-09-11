mod ai;
mod clipboard;
mod commands;
mod database;
mod license;
mod xml;

use std::io;

use ai::CredentialStore;
use database::Database;
use license::LicenseService;
use tauri::Manager;

pub struct AppState {
    pub database: Database,
    pub credentials: CredentialStore,
    pub license: LicenseService,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;
            let database = Database::open(app_data_dir.join("vertex-fm-engine.db"))
                .map_err(|error| io::Error::other(error.to_string()))?;
            let credentials = CredentialStore::new(app_data_dir.join("credentials"));
            let license = LicenseService::from_runtime();
            app.manage(AppState {
                database,
                credentials,
                license,
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::ai::list_ai_sessions,
            commands::ai::create_ai_session,
            commands::ai::load_ai_session,
            commands::ai::save_ai_message,
            commands::ai::update_ai_session,
            commands::ai::search_ai_rag,
            commands::ai::list_ai_rag_documents,
            commands::ai::save_ai_rag_document,
            commands::ai::delete_ai_rag_document,
            commands::ai::export_ai_workspace,
            commands::ai::import_ai_workspace,
            commands::ai::get_ai_provider_status,
            commands::ai::save_openai_api_key,
            commands::ai::delete_openai_api_key,
            commands::ai::test_ai_provider_connection,
            commands::ai::run_ai_assistant,
            commands::ai::run_ai_relationship_design,
            commands::knowledge::list_knowledge_packs,
            commands::knowledge::load_knowledge_pack,
            commands::knowledge::save_knowledge_pack,
            commands::knowledge::delete_knowledge_pack,
            commands::license::get_license_state,
            commands::license::refresh_license_state,
            commands::clipboard::get_filemaker_clipboard,
            commands::clipboard::set_filemaker_clipboard,
            commands::xml::detect_xml_format,
            commands::xml::validate_filemaker_xml,
            commands::xml::preview_filemaker_xml,
            commands::library::list_clipboard_history,
            commands::library::list_library_items,
            commands::library::save_clipboard_item,
            commands::library::load_clipboard_item,
            commands::library::delete_clipboard_item,
            commands::library::update_clipboard_favorite,
            commands::library::update_clipboard_notes,
            commands::library::clear_clipboard_history,
            commands::library::clear_library_data,
            commands::library::clear_all_data,
            commands::library::list_clipboard_tags,
            commands::library::set_clipboard_tags,
            commands::library::list_collections,
            commands::library::save_collection,
            commands::library::delete_collection,
            commands::library::list_collection_assignments,
            commands::library::assign_collection_item,
            commands::system::detect_filemaker,
            commands::update::check_for_updates,
            commands::workspace::save_workspace_file,
            commands::workspace::read_workspace_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Vertex FM Engine");
}
