use serde::Serialize;

use crate::clipboard::encode_filemaker_payload;

use super::{detector, parser::parse_filemaker_xml, schema};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationIssue {
    pub level: ValidationLevel,
    pub code: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ValidationLevel {
    Success,
    Warning,
    Error,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationReport {
    pub valid: bool,
    pub detected_format: String,
    pub issues: Vec<ValidationIssue>,
}

pub fn validate(xml: &str, expected_format: Option<&str>) -> ValidationReport {
    let mut issues = Vec::new();
    let document = match parse_filemaker_xml(xml) {
        Ok(document) => document,
        Err(error) => {
            issues.push(issue(
                ValidationLevel::Error,
                "XML_PARSE",
                error.to_string(),
            ));
            return ValidationReport {
                valid: false,
                detected_format: "UNKNOWN".to_owned(),
                issues,
            };
        }
    };

    issues.push(issue(ValidationLevel::Success, "XML_VALID", "XML is valid"));
    let detection = detector::detect(xml);
    if detection.format == "UNKNOWN" {
        issues.push(issue(
            ValidationLevel::Warning,
            "FORMAT_UNKNOWN",
            "Clipboard format could not be inferred",
        ));
    } else {
        issues.push(issue(
            ValidationLevel::Success,
            "FORMAT_DETECTED",
            format!("Format {}", detection.format),
        ));
    }

    if let Some(expected) = expected_format {
        // A known, positively detected FileMaker object must never be delivered
        // under a different Windows Clipboard format. Keep UNKNOWN permissive so
        // captured/newer FileMaker objects remain round-trippable.
        if detection.format != "UNKNOWN" && !detection.format.eq_ignore_ascii_case(expected) {
            issues.push(issue(
                ValidationLevel::Error,
                "FORMAT_MISMATCH",
                format!("Expected {expected}, detected {}", detection.format),
            ));
        }
    }

    let structural_format = expected_format
        .or_else(|| (detection.format != "UNKNOWN").then_some(detection.format.as_str()));
    for structural_issue in schema::validate_filemaker_structure(&document, structural_format) {
        let level = match structural_issue.code {
            // FileMaker itself can preserve steps introduced by another version or
            // unavailable plug-in as <unknown>/<不明>. They must remain capturable
            // and round-trippable even though Vertex cannot identify them.
            "STEP_ID_UNKNOWN" => ValidationLevel::Warning,
            _ => ValidationLevel::Error,
        };
        issues.push(issue(
            level,
            structural_issue.code,
            structural_issue.message,
        ));
    }

    if !issues
        .iter()
        .any(|issue| matches!(issue.level, ValidationLevel::Error))
    {
        issues.push(issue(
            ValidationLevel::Success,
            "FILEMAKER_STRUCTURE_VALID",
            "FileMaker clipboard structure is valid",
        ));
    }

    let has_validation_error = issues
        .iter()
        .any(|issue| matches!(issue.level, ValidationLevel::Error));
    match encode_filemaker_payload(xml) {
        Ok(_) if !has_validation_error => issues.push(issue(
            ValidationLevel::Success,
            "PAYLOAD_VALID",
            "Clipboard data can be generated",
        )),
        Ok(_) => {}
        Err(error) => issues.push(issue(
            ValidationLevel::Error,
            "PAYLOAD_INVALID",
            error.to_string(),
        )),
    }

    let valid = !issues
        .iter()
        .any(|issue| matches!(issue.level, ValidationLevel::Error));
    ValidationReport {
        valid,
        detected_format: detection.format,
        issues,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_generated_script_is_not_sendable() {
        let xml = concat!(
            "<fmxmlsnippet type=\"FMObjectList\">",
            "<Script id=\"1\" name=\"Vertex Clipboard Round Trip\">",
            "<Step enable=\"True\" id=\"1\" name=\"Halt Script\" />",
            "</Script></fmxmlsnippet>"
        );
        let report = validate(xml, Some("XMSC"));
        assert!(!report.valid);
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "STEP_ID_NAME_MISMATCH"));
        assert!(!report
            .issues
            .iter()
            .any(|issue| issue.code == "PAYLOAD_VALID"));
    }

    #[test]
    fn captured_unknown_step_is_preserved_as_a_warning() {
        let xml = concat!(
            "<fmxmlsnippet type=\"FMObjectList\">",
            "<Step enable=\"True\" id=\"1\" name=\"スクリプト実行\" />",
            "<Step enable=\"True\" id=\"2\" name=\"&lt;不明&gt; [2]\" />",
            "<Step enable=\"True\" id=\"103\" name=\"現在のスクリプト終了\" />",
            "</fmxmlsnippet>"
        );
        let report = validate(xml, Some("XMSS"));
        assert!(report.valid);
        assert!(report.issues.iter().any(|issue| {
            issue.code == "STEP_ID_UNKNOWN"
                && matches!(issue.level, ValidationLevel::Warning)
        }));
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "PAYLOAD_VALID"));
    }

    #[test]
    fn detected_format_mismatch_is_fail_closed() {
        let xml =
            "<fmxmlsnippet type=\"FMObjectList\"><Field name=\"horse_id\" /></fmxmlsnippet>";
        let report = validate(xml, Some("XMTB"));
        assert!(!report.valid);
        assert!(report.issues.iter().any(|issue| {
            issue.code == "FORMAT_MISMATCH"
                && matches!(issue.level, ValidationLevel::Error)
        }));
        assert!(!report
            .issues
            .iter()
            .any(|issue| issue.code == "PAYLOAD_VALID"));
    }

    #[test]
    fn unknown_future_format_remains_round_trip_compatible() {
        let xml =
            "<fmxmlsnippet type=\"FMObjectList\"><SomethingNew name=\"Future\" /></fmxmlsnippet>";
        let report = validate(xml, Some("XNEW"));
        assert!(report
            .issues
            .iter()
            .any(|issue| issue.code == "FORMAT_UNKNOWN"));
        assert!(!report
            .issues
            .iter()
            .any(|issue| issue.code == "FORMAT_MISMATCH"));
    }
}

fn issue(
    level: ValidationLevel,
    code: impl Into<String>,
    message: impl Into<String>,
) -> ValidationIssue {
    ValidationIssue {
        level,
        code: code.into(),
        message: message.into(),
    }
}
