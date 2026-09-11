use serde::{Deserialize, Serialize};

const REPOSITORY: &str = "ACE-FRDS/vrtex_fm_engine";

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    published_at: Option<String>,
    body: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheck {
    current_version: String,
    latest_version: String,
    update_available: bool,
    release_url: String,
    published_at: Option<String>,
    notes: String,
}

#[tauri::command]
pub async fn check_for_updates(current_version: String) -> Result<UpdateCheck, String> {
    let client = reqwest::Client::builder()
        .user_agent("Vertex-FM-Engine")
        .build()
        .map_err(|error| error.to_string())?;
    let mut request = client.get(format!(
        "https://api.github.com/repos/{REPOSITORY}/releases/latest"
    ));
    if let Ok(token) = std::env::var("VFE_GITHUB_TOKEN") {
        if !token.trim().is_empty() {
            request = request.bearer_auth(token.trim());
        }
    }
    let response = request.send().await.map_err(|error| error.to_string())?;
    if !response.status().is_success() {
        return Err(match response.status().as_u16() {
            404 => "更新情報へアクセスできません。PrivateリポジトリではVFE_GITHUB_TOKENを設定してください。".to_owned(),
            403 => "GitHub APIの利用上限またはアクセス権限を確認してください。".to_owned(),
            status => format!("GitHub Releases API returned HTTP {status}"),
        });
    }
    let release = response
        .json::<GitHubRelease>()
        .await
        .map_err(|error| error.to_string())?;
    let latest_version = release.tag_name.trim_start_matches(['v', 'V']).to_owned();
    Ok(UpdateCheck {
        update_available: version_parts(&latest_version) > version_parts(&current_version),
        current_version,
        latest_version,
        release_url: release.html_url,
        published_at: release.published_at,
        notes: release.body.unwrap_or_default(),
    })
}

fn version_parts(version: &str) -> Vec<u64> {
    version
        .trim_start_matches(['v', 'V'])
        .split(['.', '-', '+'])
        .map(|part| part.parse::<u64>().unwrap_or(0))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn compares_release_versions_numerically() {
        assert!(version_parts("0.10.0") > version_parts("0.9.9"));
        assert!(version_parts("1.0.1") > version_parts("1.0.0"));
        assert_eq!(version_parts("v1.2.3"), vec![1, 2, 3]);
    }
}
