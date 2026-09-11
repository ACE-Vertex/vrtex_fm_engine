use crate::database::knowledge_models::KnowledgePack;

#[derive(Debug)]
pub struct PromptBuildInput<'a> {
    pub system_instructions: &'a str,
    pub selected_knowledge_packs: &'a [KnowledgePack],
    pub project_context: &'a str,
    pub task_instructions: &'a str,
    pub user_request: &'a str,
    pub expected_response_schema: &'a str,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct KnowledgePackReference {
    pub id: String,
    pub version: String,
}

#[derive(Debug, Clone)]
pub struct BuiltPrompt {
    pub content: String,
    pub selected_packs: Vec<KnowledgePackReference>,
}

#[derive(Debug, Default, Clone, Copy)]
pub struct KnowledgePromptBuilder;

impl KnowledgePromptBuilder {
    pub fn build(&self, input: PromptBuildInput<'_>) -> BuiltPrompt {
        let mut packs = input
            .selected_knowledge_packs
            .iter()
            .filter(|pack| pack.enabled)
            .collect::<Vec<_>>();
        packs.sort_by(|left, right| {
            right
                .priority
                .cmp(&left.priority)
                .then_with(|| left.name.cmp(&right.name))
        });

        let pack_context = if packs.is_empty() {
            "No Knowledge Pack was selected for this task.".to_owned()
        } else {
            packs
                .iter()
                .map(|pack| render_pack(pack))
                .collect::<Vec<_>>()
                .join("\n\n")
        };
        let selected_packs = packs
            .iter()
            .map(|pack| KnowledgePackReference {
                id: pack.id.clone(),
                version: pack.version.clone(),
            })
            .collect();

        BuiltPrompt {
            content: format!(
                "SYSTEM INSTRUCTIONS\n{system}\n\nSELECTED KNOWLEDGE PACKS\n{packs}\n\nPROJECT CONTEXT\n{project}\n\nTASK-SPECIFIC INSTRUCTIONS\n{task}\n\nUSER REQUEST\n{user}\n\nEXPECTED RESPONSE SCHEMA\n{schema}",
                system = input.system_instructions.trim(),
                packs = pack_context,
                project = normalized(input.project_context, "No project context was selected."),
                task = normalized(input.task_instructions, "Follow the user request safely."),
                user = input.user_request.trim(),
                schema = normalized(
                    input.expected_response_schema,
                    "Return a concise, explicit response."
                ),
            ),
            selected_packs,
        }
    }
}

fn normalized<'a>(value: &'a str, fallback: &'a str) -> &'a str {
    if value.trim().is_empty() {
        fallback
    } else {
        value.trim()
    }
}

fn render_pack(pack: &KnowledgePack) -> String {
    let mut sections = vec![format!(
        "## {} (id: {}, version: {}, category: {}, priority: {})\n{}\nApplicable tasks: {}",
        pack.name,
        pack.id,
        pack.version,
        pack.category,
        pack.priority,
        pack.description,
        render_inline(&pack.applicable_task_types)
    )];
    push_list(&mut sections, "Rules", &pack.rules);
    push_list(&mut sections, "Examples", &pack.examples);
    push_list(&mut sections, "Anti-patterns", &pack.anti_patterns);
    push_list(&mut sections, "Validation hints", &pack.validation_hints);
    sections.join("\n")
}

fn render_inline(values: &[String]) -> String {
    if values.is_empty() {
        "unspecified".to_owned()
    } else {
        values.join(", ")
    }
}

fn push_list(sections: &mut Vec<String>, title: &str, values: &[String]) {
    if values.is_empty() {
        return;
    }
    sections.push(format!(
        "{title}:\n{}",
        values
            .iter()
            .map(|value| format!("- {}", value.trim()))
            .collect::<Vec<_>>()
            .join("\n")
    ));
}

#[cfg(test)]
mod tests {
    use super::*;

    fn pack(id: &str, priority: i32, enabled: bool) -> KnowledgePack {
        KnowledgePack {
            id: id.to_owned(),
            name: format!("Pack {id}"),
            version: "1.2.0".to_owned(),
            description: "Typed FileMaker knowledge".to_owned(),
            category: "script".to_owned(),
            applicable_task_types: vec!["script".to_owned()],
            rules: vec![format!("Rule for {id}")],
            examples: vec!["Example".to_owned()],
            anti_patterns: vec!["Do not guess".to_owned()],
            validation_hints: vec!["Validate wrapper".to_owned()],
            priority,
            enabled,
            updated_at: "2026-08-11T00:00:00Z".to_owned(),
        }
    }

    #[test]
    fn composes_layers_and_reports_selected_versions() {
        let packs = vec![pack("low", 10, true), pack("high", 100, true)];
        let built = KnowledgePromptBuilder.build(PromptBuildInput {
            system_instructions: "System",
            selected_knowledge_packs: &packs,
            project_context: "Project",
            task_instructions: "Task",
            user_request: "User",
            expected_response_schema: "Schema",
        });
        assert!(built.content.contains("SYSTEM INSTRUCTIONS\nSystem"));
        assert!(built.content.contains("SELECTED KNOWLEDGE PACKS"));
        assert!(built.content.find("Pack high").unwrap() < built.content.find("Pack low").unwrap());
        assert_eq!(built.selected_packs[0].id, "high");
        assert_eq!(built.selected_packs[0].version, "1.2.0");
    }

    #[test]
    fn excludes_disabled_packs() {
        let packs = vec![pack("disabled", 100, false)];
        let built = KnowledgePromptBuilder.build(PromptBuildInput {
            system_instructions: "System",
            selected_knowledge_packs: &packs,
            project_context: "",
            task_instructions: "",
            user_request: "User",
            expected_response_schema: "",
        });
        assert!(!built.content.contains("Pack disabled"));
        assert!(built.selected_packs.is_empty());
    }
}
