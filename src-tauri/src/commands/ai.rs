use tauri::State;

use crate::ai::{
    build_prompt, build_relationship_design_prompt, provider_status, run_provider,
    test_provider_connection, AiConnectionTest, AiProviderRequest, AiProviderResponse,
    AiProviderStatus,
};
use crate::database::ai_models::{
    AiMessage, AiSession, AiSessionDetail, AiWorkspaceData, CreateAiSession, RagDocument,
    SaveAiMessage, SaveRagDocument, UpdateAiSession,
};
use crate::database::ai_repository;
use crate::AppState;

#[tauri::command]
pub fn list_ai_sessions(
    state: State<'_, AppState>,
    project_id: String,
    limit: Option<usize>,
) -> Result<Vec<AiSession>, String> {
    state
        .database
        .with_connection(|connection| {
            ai_repository::list_sessions(connection, &project_id, limit.unwrap_or(100))
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn create_ai_session(
    state: State<'_, AppState>,
    session: CreateAiSession,
) -> Result<AiSession, String> {
    state
        .database
        .with_connection(|connection| ai_repository::create_session(connection, session))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn load_ai_session(
    state: State<'_, AppState>,
    id: String,
) -> Result<Option<AiSessionDetail>, String> {
    state
        .database
        .with_connection(|connection| ai_repository::load_detail(connection, &id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_ai_message(
    state: State<'_, AppState>,
    message: SaveAiMessage,
) -> Result<AiMessage, String> {
    state
        .database
        .with_connection(|connection| ai_repository::save_message(connection, message))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn update_ai_session(
    state: State<'_, AppState>,
    id: String,
    changes: UpdateAiSession,
) -> Result<AiSession, String> {
    state
        .database
        .with_connection(|connection| ai_repository::update_session(connection, &id, changes))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn search_ai_rag(
    state: State<'_, AppState>,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<RagDocument>, String> {
    state
        .database
        .with_connection(|connection| {
            ai_repository::search_rag(connection, &query, limit.unwrap_or(8))
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn list_ai_rag_documents(
    state: State<'_, AppState>,
    limit: Option<usize>,
) -> Result<Vec<RagDocument>, String> {
    state
        .database
        .with_connection(|connection| {
            ai_repository::list_rag_documents(connection, limit.unwrap_or(500))
        })
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn save_ai_rag_document(
    state: State<'_, AppState>,
    document: SaveRagDocument,
) -> Result<RagDocument, String> {
    state
        .database
        .with_connection(|connection| ai_repository::save_rag_document(connection, document))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn delete_ai_rag_document(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state
        .database
        .with_connection(|connection| ai_repository::delete_rag_document(connection, &id))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn export_ai_workspace(state: State<'_, AppState>) -> Result<AiWorkspaceData, String> {
    state
        .database
        .with_connection(ai_repository::export_workspace)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn import_ai_workspace(
    state: State<'_, AppState>,
    workspace: AiWorkspaceData,
) -> Result<(), String> {
    state
        .database
        .with_connection_mut(|connection| ai_repository::import_workspace(connection, workspace))
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_ai_provider_status(state: State<'_, AppState>) -> Vec<AiProviderStatus> {
    provider_status(&state.credentials)
}

#[tauri::command]
pub fn save_openai_api_key(
    state: State<'_, AppState>,
    api_key: String,
) -> Result<AiProviderStatus, String> {
    state.credentials.save_openai_key(&api_key)?;
    provider_status(&state.credentials)
        .into_iter()
        .find(|provider| provider.id == "openai")
        .ok_or_else(|| "OpenAI Providerが見つかりません".to_owned())
}

#[tauri::command]
pub fn delete_openai_api_key(state: State<'_, AppState>) -> Result<bool, String> {
    state.credentials.delete_openai_key()
}

#[tauri::command]
pub async fn test_ai_provider_connection(
    state: State<'_, AppState>,
    provider: String,
) -> Result<AiConnectionTest, String> {
    test_provider_connection(&provider, &state.credentials).await
}

#[tauri::command]
pub async fn run_ai_assistant(
    state: State<'_, AppState>,
    request: AiProviderRequest,
) -> Result<AiProviderResponse, String> {
    let prompt = build_prompt(&request);
    run_provider(&request, prompt, &state.credentials).await
}

#[tauri::command]
pub async fn run_ai_relationship_design(
    state: State<'_, AppState>,
    request: AiProviderRequest,
) -> Result<AiProviderResponse, String> {
    if request.current_design.as_deref().unwrap_or("").len() > 4 * 1024 * 1024 {
        return Err("Current relationship design exceeds the 4 MB AI request limit".to_owned());
    }
    if request.response_schema.is_none() {
        return Err("Relationship design requires a JSON response schema".to_owned());
    }
    let prompt = build_relationship_design_prompt(&request);
    run_provider(&request, prompt, &state.credentials).await
}
