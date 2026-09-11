use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSession {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub mode: String,
    pub provider: String,
    pub model: String,
    pub dry_run: bool,
    pub risk_level: String,
    pub status: String,
    pub generated_xml: String,
    pub validation_status: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiMessage {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub metadata: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiSessionDetail {
    pub session: AiSession,
    pub messages: Vec<AiMessage>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateAiSession {
    pub project_id: String,
    pub title: String,
    pub mode: String,
    pub provider: String,
    pub model: String,
    #[serde(default = "default_true")]
    pub dry_run: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveAiMessage {
    pub session_id: String,
    pub role: String,
    pub content: String,
    #[serde(default = "default_metadata")]
    pub metadata: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateAiSession {
    pub title: Option<String>,
    pub mode: Option<String>,
    pub provider: Option<String>,
    pub model: Option<String>,
    pub dry_run: Option<bool>,
    pub risk_level: Option<String>,
    pub status: Option<String>,
    pub generated_xml: Option<String>,
    pub validation_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RagDocument {
    pub id: String,
    pub title: String,
    pub content: String,
    pub source_type: String,
    pub tags: String,
    pub score: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiWorkspaceData {
    pub sessions: Vec<AiSession>,
    pub messages: Vec<AiMessage>,
    pub rag_documents: Vec<RagDocument>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRagDocument {
    pub id: Option<String>,
    pub title: String,
    pub content: String,
    pub source_type: String,
    #[serde(default)]
    pub tags: String,
}

fn default_true() -> bool {
    true
}

fn default_metadata() -> String {
    "{}".to_owned()
}
