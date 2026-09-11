use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgePack {
    pub id: String,
    pub name: String,
    pub version: String,
    pub description: String,
    pub category: String,
    pub applicable_task_types: Vec<String>,
    pub rules: Vec<String>,
    pub examples: Vec<String>,
    pub anti_patterns: Vec<String>,
    pub validation_hints: Vec<String>,
    pub priority: i32,
    pub enabled: bool,
    pub updated_at: String,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveKnowledgePack {
    pub id: Option<String>,
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub description: String,
    pub category: String,
    #[serde(default)]
    pub applicable_task_types: Vec<String>,
    #[serde(default)]
    pub rules: Vec<String>,
    #[serde(default)]
    pub examples: Vec<String>,
    #[serde(default)]
    pub anti_patterns: Vec<String>,
    #[serde(default)]
    pub validation_hints: Vec<String>,
    #[serde(default)]
    pub priority: i32,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

fn default_true() -> bool {
    true
}
