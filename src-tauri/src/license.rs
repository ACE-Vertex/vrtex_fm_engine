use std::sync::RwLock;

use chrono::{DateTime, Utc};
use serde::Serialize;

pub const KNOWLEDGE_PACK_ENGINE: &str = "knowledgePackEngine";
pub const KNOWLEDGE_PACK_BUILDER: &str = "knowledgePackBuilder";
pub const FILEMAKER_KNOWLEDGE_BASE: &str = "fileMakerKnowledgeBase";
pub const KNOWLEDGE_LEARNING: &str = "knowledgeLearning";
pub const REPAIR_LEARNING: &str = "repairLearning";
pub const KNOWLEDGE_IMPORT_EXPORT: &str = "knowledgeImportExport";

const PRO_FEATURES: &[&str] = &[
    "relationshipDesigner",
    "tableOccurrenceCanvas",
    "relationshipGraph",
    "autoArrange",
    "relationshipInspector",
    "projectSnapshot",
    "designTemplates",
    "layoutDesigner",
    KNOWLEDGE_PACK_ENGINE,
    KNOWLEDGE_PACK_BUILDER,
    FILEMAKER_KNOWLEDGE_BASE,
    KNOWLEDGE_LEARNING,
    REPAIR_LEARNING,
    KNOWLEDGE_IMPORT_EXPORT,
];

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LicenseState {
    pub tier: String,
    pub status: String,
    pub expires_at: Option<String>,
    pub granted_features: Vec<String>,
}

impl LicenseState {
    fn free() -> Self {
        Self {
            tier: "free".to_owned(),
            status: "active".to_owned(),
            expires_at: None,
            granted_features: Vec::new(),
        }
    }

    #[cfg(debug_assertions)]
    fn development() -> Self {
        Self {
            tier: "development".to_owned(),
            status: "active".to_owned(),
            expires_at: None,
            granted_features: Vec::new(),
        }
    }
}

/// Boundary for a verified license provider. A signed-file or online provider can
/// replace RuntimeLicenseProvider without changing feature consumers.
trait LicenseProvider {
    fn verified_state(&self) -> LicenseState;
}

struct RuntimeLicenseProvider;

impl LicenseProvider for RuntimeLicenseProvider {
    fn verified_state(&self) -> LicenseState {
        #[cfg(debug_assertions)]
        {
            LicenseState::development()
        }
        #[cfg(not(debug_assertions))]
        {
            // Release builds fail closed until a signed license provider verifies Pro.
            LicenseState::free()
        }
    }
}

pub struct LicenseService {
    state: RwLock<LicenseState>,
}

impl LicenseService {
    pub fn from_runtime() -> Self {
        Self {
            state: RwLock::new(RuntimeLicenseProvider.verified_state()),
        }
    }

    pub fn snapshot(&self) -> LicenseState {
        self.state.read().expect("license state poisoned").clone()
    }

    pub fn refresh(&self) -> LicenseState {
        let state = RuntimeLicenseProvider.verified_state();
        *self.state.write().expect("license state poisoned") = state.clone();
        state
    }

    pub fn can_use(&self, feature: &str) -> bool {
        let state = self.state.read().expect("license state poisoned");
        if state.status != "active" || is_expired(state.expires_at.as_deref()) {
            return false;
        }
        if state
            .granted_features
            .iter()
            .any(|granted| granted == feature)
        {
            return true;
        }
        matches!(state.tier.as_str(), "pro" | "development") && PRO_FEATURES.contains(&feature)
    }

    pub fn require(&self, feature: &str) -> Result<(), String> {
        if self.can_use(feature) {
            Ok(())
        } else {
            Err(format!(
                "この機能はVRTEX FM Engine Proで利用できます。（Feature: {feature}）"
            ))
        }
    }
}

fn is_expired(value: Option<&str>) -> bool {
    value
        .and_then(|expires_at| DateTime::parse_from_rfc3339(expires_at).ok())
        .is_some_and(|expires_at| expires_at.with_timezone(&Utc) <= Utc::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn service(state: LicenseState) -> LicenseService {
        LicenseService {
            state: RwLock::new(state),
        }
    }

    #[test]
    fn free_license_cannot_use_knowledge_features() {
        let service = service(LicenseState::free());
        assert!(!service.can_use(KNOWLEDGE_PACK_ENGINE));
        assert!(service.require(KNOWLEDGE_PACK_BUILDER).is_err());
    }

    #[test]
    fn pro_license_can_use_all_knowledge_features() {
        let mut state = LicenseState::free();
        state.tier = "pro".to_owned();
        let service = service(state);
        assert!(service.can_use(KNOWLEDGE_PACK_ENGINE));
        assert!(service.can_use(KNOWLEDGE_IMPORT_EXPORT));
    }

    #[test]
    fn expired_license_fails_closed_without_changing_data() {
        let service = service(LicenseState {
            tier: "pro".to_owned(),
            status: "active".to_owned(),
            expires_at: Some("2000-01-01T00:00:00Z".to_owned()),
            granted_features: Vec::new(),
        });
        assert!(!service.can_use(FILEMAKER_KNOWLEDGE_BASE));
    }
}
