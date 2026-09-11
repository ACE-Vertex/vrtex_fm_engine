use std::future::Future;
use std::pin::Pin;

use serde::{Deserialize, Serialize};

use super::CredentialStore;

pub type ProviderFuture<'a> =
    Pin<Box<dyn Future<Output = Result<AiProviderResponse, String>> + Send + 'a>>;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderRequest {
    pub provider: String,
    pub model: String,
    pub project_id: String,
    pub mode: String,
    pub dry_run: bool,
    pub format: Option<String>,
    pub current_xml: Option<String>,
    pub current_design: Option<String>,
    pub response_schema: Option<serde_json::Value>,
    #[serde(default)]
    pub rag_context: Vec<String>,
    pub user_prompt: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderResponse {
    pub provider: String,
    pub model: String,
    pub content: String,
    pub response_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiProviderStatus {
    pub id: String,
    pub name: String,
    pub available: bool,
    pub authenticated: bool,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AiConnectionTest {
    pub provider: String,
    pub success: bool,
    pub detail: String,
    pub request_id: Option<String>,
}

pub trait AiProvider: Send + Sync {
    fn id(&self) -> &'static str;
    fn send<'a>(&'a self, request: &'a AiProviderRequest, prompt: String) -> ProviderFuture<'a>;
}

pub struct OpenAiProvider {
    api_key: String,
}

impl AiProvider for OpenAiProvider {
    fn id(&self) -> &'static str {
        "openai"
    }

    fn send<'a>(&'a self, request: &'a AiProviderRequest, prompt: String) -> ProviderFuture<'a> {
        Box::pin(async move {
            let client = reqwest::Client::new();
            let mut body = serde_json::json!({
                "model": request.model,
                "input": prompt,
                "store": false
            });
            if let Some(schema) = &request.response_schema {
                body["text"] = serde_json::json!({
                    "format": {
                        "type": "json_schema",
                        "name": "vrtex_relationship_design",
                        "strict": false,
                        "schema": schema
                    }
                });
            }
            let response = client
                .post("https://api.openai.com/v1/responses")
                .bearer_auth(&self.api_key)
                .json(&body)
                .send()
                .await
                .map_err(|error| format!("OpenAI connection failed: {error}"))?;
            let status = response.status();
            let payload: serde_json::Value = response
                .json()
                .await
                .map_err(|error| format!("OpenAI response parsing failed: {error}"))?;
            if !status.is_success() {
                let message = payload
                    .pointer("/error/message")
                    .and_then(serde_json::Value::as_str)
                    .unwrap_or("Unknown OpenAI API error");
                return Err(format!(
                    "OpenAI API returned {status}: {}",
                    sanitize_provider_error(message)
                ));
            }
            let content = extract_output_text(&payload)
                .ok_or_else(|| "OpenAI response did not contain output text".to_owned())?;
            Ok(AiProviderResponse {
                provider: "openai".to_owned(),
                model: request.model.clone(),
                content,
                response_id: payload
                    .get("id")
                    .and_then(serde_json::Value::as_str)
                    .map(str::to_owned),
            })
        })
    }
}

pub fn provider_status(credentials: &CredentialStore) -> Vec<AiProviderStatus> {
    let resolved_key = credentials.resolve_openai_key();
    let (openai_key_present, openai_detail) = match resolved_key {
        Ok(Some((_, source))) => (true, format!("認証情報を{source}から読み込みました")),
        Ok(None) => (
            false,
            "APIキーをWindows保護ストレージへ保存するか、OPENAI_API_KEYを設定してください"
                .to_owned(),
        ),
        Err(error) => (false, error),
    };
    vec![
        AiProviderStatus {
            id: "openai".to_owned(),
            name: "OpenAI Responses API".to_owned(),
            available: true,
            authenticated: openai_key_present,
            detail: openai_detail,
        },
        AiProviderStatus {
            id: "codex".to_owned(),
            name: "Codex App Server".to_owned(),
            available: false,
            authenticated: false,
            detail: "Provider boundary is ready; App Server transport is planned for Phase 2"
                .to_owned(),
        },
    ]
}

pub async fn run_provider(
    request: &AiProviderRequest,
    prompt: String,
    credentials: &CredentialStore,
) -> Result<AiProviderResponse, String> {
    let provider = create_provider(request, credentials)?;
    provider.send(request, prompt).await
}

pub fn create_provider(
    request: &AiProviderRequest,
    credentials: &CredentialStore,
) -> Result<Box<dyn AiProvider>, String> {
    match request.provider.as_str() {
        "openai" => {
            let api_key = credentials
                .resolve_openai_key()?
                .map(|(key, _)| key)
                .ok_or_else(|| "OpenAI APIキーが設定されていません。設定 > Codex連携から登録してください。".to_owned())?;
            Ok(Box::new(OpenAiProvider { api_key }))
        }
        "codex" => Err(
            "Codex App Server transport is not connected yet. Select OpenAI or continue with Dry Run tools."
                .to_owned(),
        ),
        provider => Err(format!("Unknown AI provider: {provider}")),
    }
}

pub async fn test_provider_connection(
    provider: &str,
    credentials: &CredentialStore,
) -> Result<AiConnectionTest, String> {
    match provider {
        "openai" => {
            let (api_key, source) = credentials
                .resolve_openai_key()?
                .ok_or_else(|| "OpenAI APIキーが設定されていません".to_owned())?;
            let response = reqwest::Client::new()
                .get("https://api.openai.com/v1/models")
                .bearer_auth(api_key)
                .send()
                .await
                .map_err(|error| format!("OpenAIへの接続に失敗しました: {error}"))?;
            let status = response.status();
            let request_id = response
                .headers()
                .get("x-request-id")
                .and_then(|value| value.to_str().ok())
                .map(str::to_owned);
            if status.is_success() {
                return Ok(AiConnectionTest {
                    provider: "openai".to_owned(),
                    success: true,
                    detail: format!("OpenAI Responses APIへ接続できました（認証元: {source}）"),
                    request_id,
                });
            }
            let payload: serde_json::Value = response.json().await.unwrap_or_default();
            let message = payload
                .pointer("/error/message")
                .and_then(serde_json::Value::as_str)
                .unwrap_or("OpenAI APIの認証に失敗しました");
            Ok(AiConnectionTest {
                provider: "openai".to_owned(),
                success: false,
                detail: format!(
                    "OpenAI API returned {status}: {}",
                    sanitize_provider_error(message)
                ),
                request_id,
            })
        }
        "codex" => Ok(AiConnectionTest {
            provider: "codex".to_owned(),
            success: false,
            detail: "Codex App Server接続はPhase 2で実装予定です".to_owned(),
            request_id: None,
        }),
        value => Err(format!("Unknown AI provider: {value}")),
    }
}

fn sanitize_provider_error(message: &str) -> String {
    message
        .split_whitespace()
        .map(|word| {
            if word.to_ascii_lowercase().contains("sk-") {
                "[APIキーは非表示]"
            } else {
                word
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

fn extract_output_text(payload: &serde_json::Value) -> Option<String> {
    let mut parts = Vec::new();
    for output in payload.get("output")?.as_array()? {
        if output.get("type")?.as_str()? != "message" {
            continue;
        }
        for content in output.get("content")?.as_array()? {
            if content.get("type").and_then(serde_json::Value::as_str) == Some("output_text") {
                if let Some(text) = content.get("text").and_then(serde_json::Value::as_str) {
                    parts.push(text);
                }
            }
        }
    }
    (!parts.is_empty()).then(|| parts.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_responses_api_output_text() {
        let payload = serde_json::json!({
            "id": "resp_1",
            "output": [{
                "type": "message",
                "content": [{ "type": "output_text", "text": "Change plan" }]
            }]
        });
        assert_eq!(
            extract_output_text(&payload).as_deref(),
            Some("Change plan")
        );
    }

    #[test]
    fn removes_api_key_fragments_from_provider_errors() {
        let message = "Incorrect API key provided: sk-test****************use. Check it.";
        let sanitized = sanitize_provider_error(message);
        assert!(!sanitized.contains("sk-"));
        assert!(!sanitized.contains("test"));
        assert!(!sanitized.contains("use"));
        assert!(sanitized.contains("[APIキーは非表示]"));
    }

    #[test]
    fn structured_request_fields_deserialize() {
        let request: AiProviderRequest = serde_json::from_value(serde_json::json!({
            "provider": "openai", "model": "gpt-5", "projectId": "p", "mode": "DESIGN",
            "dryRun": true, "ragContext": [], "userPrompt": "design",
            "currentDesign": "{}", "responseSchema": {"type": "object"}
        }))
        .unwrap();
        assert!(request.current_design.is_some());
        assert!(request.response_schema.is_some());
    }
}
