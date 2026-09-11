use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Result};
use uuid::Uuid;

use super::ai_models::{
    AiMessage, AiSession, AiSessionDetail, AiWorkspaceData, CreateAiSession, RagDocument,
    SaveAiMessage, SaveRagDocument, UpdateAiSession,
};

pub fn export_workspace(connection: &Connection) -> Result<AiWorkspaceData> {
    let mut session_statement = connection.prepare(
        "SELECT id, project_id, title, mode, provider, model, dry_run, risk_level,
                status, generated_xml, validation_status, created_at, updated_at
         FROM ai_sessions ORDER BY updated_at DESC",
    )?;
    let sessions = session_statement
        .query_map([], map_session)?
        .collect::<Result<Vec<_>>>()?;
    let mut message_statement = connection.prepare(
        "SELECT id, session_id, role, content, metadata, created_at
         FROM ai_messages ORDER BY created_at ASC",
    )?;
    let messages = message_statement
        .query_map([], map_message)?
        .collect::<Result<Vec<_>>>()?;
    Ok(AiWorkspaceData {
        sessions,
        messages,
        rag_documents: list_rag_documents(connection, usize::MAX)?,
    })
}

pub fn import_workspace(connection: &mut Connection, workspace: AiWorkspaceData) -> Result<()> {
    let transaction = connection.transaction()?;
    transaction.execute("DELETE FROM ai_messages", [])?;
    transaction.execute("DELETE FROM ai_sessions", [])?;
    transaction.execute("DELETE FROM rag_documents", [])?;
    for session in workspace.sessions {
        transaction.execute(
            "INSERT INTO ai_sessions (
               id, project_id, title, mode, provider, model, dry_run, risk_level,
               status, generated_xml, validation_status, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                session.id,
                session.project_id,
                session.title,
                session.mode,
                session.provider,
                session.model,
                session.dry_run,
                session.risk_level,
                session.status,
                session.generated_xml,
                session.validation_status,
                session.created_at,
                session.updated_at,
            ],
        )?;
    }
    for message in workspace.messages {
        transaction.execute(
            "INSERT INTO ai_messages (id, session_id, role, content, metadata, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                message.id,
                message.session_id,
                message.role,
                message.content,
                message.metadata,
                message.created_at,
            ],
        )?;
    }
    let now = Utc::now().to_rfc3339();
    for document in workspace.rag_documents {
        transaction.execute(
            "INSERT INTO rag_documents (id, title, content, source_type, tags, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)",
            params![document.id, document.title, document.content, document.source_type, document.tags, now],
        )?;
    }
    transaction.commit()
}

pub fn list_rag_documents(connection: &Connection, limit: usize) -> Result<Vec<RagDocument>> {
    let mut statement = connection.prepare(
        "SELECT id, title, content, source_type, tags
         FROM rag_documents ORDER BY updated_at DESC LIMIT ?1",
    )?;
    let documents = statement
        .query_map([limit as i64], |row| {
            Ok(RagDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                source_type: row.get(3)?,
                tags: row.get(4)?,
                score: 0,
            })
        })?
        .collect();
    documents
}

pub fn save_rag_document(connection: &Connection, input: SaveRagDocument) -> Result<RagDocument> {
    let id = input.id.unwrap_or_else(|| Uuid::new_v4().to_string());
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO rag_documents (id, title, content, source_type, tags, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           content = excluded.content,
           source_type = excluded.source_type,
           tags = excluded.tags,
           updated_at = excluded.updated_at",
        params![
            id,
            input.title,
            input.content,
            input.source_type,
            input.tags,
            now
        ],
    )?;
    connection.query_row(
        "SELECT id, title, content, source_type, tags FROM rag_documents WHERE id = ?1",
        [id],
        |row| {
            Ok(RagDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                source_type: row.get(3)?,
                tags: row.get(4)?,
                score: 0,
            })
        },
    )
}

pub fn delete_rag_document(connection: &Connection, id: &str) -> Result<bool> {
    Ok(connection.execute("DELETE FROM rag_documents WHERE id = ?1", [id])? > 0)
}

pub fn list_sessions(
    connection: &Connection,
    project_id: &str,
    limit: usize,
) -> Result<Vec<AiSession>> {
    let mut statement = connection.prepare(
        "SELECT id, project_id, title, mode, provider, model, dry_run, risk_level,
                status, generated_xml, validation_status, created_at, updated_at
         FROM ai_sessions
         WHERE project_id = ?1
         ORDER BY updated_at DESC
         LIMIT ?2",
    )?;
    let rows = statement.query_map(params![project_id, limit as i64], map_session)?;
    rows.collect()
}

pub fn create_session(connection: &Connection, input: CreateAiSession) -> Result<AiSession> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO ai_sessions (
            id, project_id, title, mode, provider, model, dry_run, risk_level,
            status, generated_xml, validation_status, created_at, updated_at
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'LOW', 'active', '', 'pending', ?8, ?8)",
        params![
            id,
            input.project_id,
            input.title,
            input.mode,
            input.provider,
            input.model,
            input.dry_run,
            now,
        ],
    )?;
    load_session(connection, &id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn load_detail(connection: &Connection, id: &str) -> Result<Option<AiSessionDetail>> {
    let Some(session) = load_session(connection, id)? else {
        return Ok(None);
    };
    let mut statement = connection.prepare(
        "SELECT id, session_id, role, content, metadata, created_at
         FROM ai_messages WHERE session_id = ?1 ORDER BY created_at ASC",
    )?;
    let messages = statement
        .query_map([id], map_message)?
        .collect::<Result<Vec<_>>>()?;
    Ok(Some(AiSessionDetail { session, messages }))
}

pub fn save_message(connection: &Connection, input: SaveAiMessage) -> Result<AiMessage> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "INSERT INTO ai_messages (id, session_id, role, content, metadata, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            id,
            input.session_id,
            input.role,
            input.content,
            input.metadata,
            now,
        ],
    )?;
    connection.execute(
        "UPDATE ai_sessions SET updated_at = ?2 WHERE id = ?1",
        params![input.session_id, now],
    )?;
    connection.query_row(
        "SELECT id, session_id, role, content, metadata, created_at
         FROM ai_messages WHERE id = ?1",
        [id],
        map_message,
    )
}

pub fn update_session(
    connection: &Connection,
    id: &str,
    input: UpdateAiSession,
) -> Result<AiSession> {
    let current = load_session(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    let now = Utc::now().to_rfc3339();
    connection.execute(
        "UPDATE ai_sessions SET
            title = ?2, mode = ?3, provider = ?4, model = ?5, dry_run = ?6,
            risk_level = ?7, status = ?8, generated_xml = ?9,
            validation_status = ?10, updated_at = ?11
         WHERE id = ?1",
        params![
            id,
            input.title.unwrap_or(current.title),
            input.mode.unwrap_or(current.mode),
            input.provider.unwrap_or(current.provider),
            input.model.unwrap_or(current.model),
            input.dry_run.unwrap_or(current.dry_run),
            input.risk_level.unwrap_or(current.risk_level),
            input.status.unwrap_or(current.status),
            input.generated_xml.unwrap_or(current.generated_xml),
            input.validation_status.unwrap_or(current.validation_status),
            now,
        ],
    )?;
    load_session(connection, id)?.ok_or(rusqlite::Error::QueryReturnedNoRows)
}

pub fn search_rag(connection: &Connection, query: &str, limit: usize) -> Result<Vec<RagDocument>> {
    let mut statement = connection.prepare(
        "SELECT id, title, content, source_type, tags FROM rag_documents ORDER BY updated_at DESC",
    )?;
    let documents = statement
        .query_map([], |row| {
            Ok(RagDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: row.get(2)?,
                source_type: row.get(3)?,
                tags: row.get(4)?,
                score: 0,
            })
        })?
        .collect::<Result<Vec<_>>>()?;
    let normalized_query = query.to_lowercase();
    let mut terms = normalized_query
        .split(|character: char| {
            character.is_whitespace() || ",、。:：/()[]「」".contains(character)
        })
        .map(str::trim)
        .filter(|term| term.chars().count() >= 2)
        .map(str::to_lowercase)
        .collect::<Vec<_>>();
    let intent_aliases = [
        ("スクリプト", &["script", "xmsc"][..]),
        ("ステップ", &["step", "xmss"][..]),
        ("レビュー", &["review", "validation", "inspect"][..]),
        ("検証", &["validation", "validate"][..]),
        ("差分", &["diff", "change"][..]),
        ("安全", &["safety", "approval"][..]),
        ("削除", &["deletion", "destructive"][..]),
    ];
    for (keyword, aliases) in intent_aliases {
        if normalized_query.contains(keyword) {
            terms.extend(aliases.iter().map(|alias| (*alias).to_string()));
        }
    }
    let mut ranked = documents
        .into_iter()
        .map(|mut document| {
            let haystack =
                format!("{} {} {}", document.title, document.content, document.tags).to_lowercase();
            document.score = terms
                .iter()
                .map(|term| if haystack.contains(term) { 2 } else { 0 })
                .sum::<usize>();
            if document.score == 0 && terms.is_empty() {
                document.score = 1;
            }
            document
        })
        .filter(|document| document.score > 0)
        .collect::<Vec<_>>();
    if ranked.is_empty() {
        ranked = statement
            .query_map([], |row| {
                Ok(RagDocument {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    content: row.get(2)?,
                    source_type: row.get(3)?,
                    tags: row.get(4)?,
                    score: 1,
                })
            })?
            .collect::<Result<Vec<_>>>()?;
    }
    ranked.sort_by(|left, right| {
        right
            .score
            .cmp(&left.score)
            .then(left.title.cmp(&right.title))
    });
    ranked.truncate(limit);
    Ok(ranked)
}

fn load_session(connection: &Connection, id: &str) -> Result<Option<AiSession>> {
    connection
        .query_row(
            "SELECT id, project_id, title, mode, provider, model, dry_run, risk_level,
                    status, generated_xml, validation_status, created_at, updated_at
             FROM ai_sessions WHERE id = ?1",
            [id],
            map_session,
        )
        .optional()
}

fn map_session(row: &rusqlite::Row<'_>) -> Result<AiSession> {
    Ok(AiSession {
        id: row.get(0)?,
        project_id: row.get(1)?,
        title: row.get(2)?,
        mode: row.get(3)?,
        provider: row.get(4)?,
        model: row.get(5)?,
        dry_run: row.get(6)?,
        risk_level: row.get(7)?,
        status: row.get(8)?,
        generated_xml: row.get(9)?,
        validation_status: row.get(10)?,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn map_message(row: &rusqlite::Row<'_>) -> Result<AiMessage> {
    Ok(AiMessage {
        id: row.get(0)?,
        session_id: row.get(1)?,
        role: row.get(2)?,
        content: row.get(3)?,
        metadata: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn persists_sessions_messages_and_rag_results() {
        let connection = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&connection).unwrap();
        let session = create_session(
            &connection,
            CreateAiSession {
                project_id: "VertexProject".to_owned(),
                title: "Test".to_owned(),
                mode: "DESIGN".to_owned(),
                provider: "openai".to_owned(),
                model: "gpt-5.6-terra".to_owned(),
                dry_run: true,
            },
        )
        .unwrap();
        save_message(
            &connection,
            SaveAiMessage {
                session_id: session.id.clone(),
                role: "user".to_owned(),
                content: "XMSCを検証".to_owned(),
                metadata: "{}".to_owned(),
            },
        )
        .unwrap();
        let detail = load_detail(&connection, &session.id).unwrap().unwrap();
        assert_eq!(detail.messages.len(), 1);
        assert!(!search_rag(&connection, "XMSC XML", 5).unwrap().is_empty());
        assert!(search_rag(&connection, "選択スクリプトをレビュー", 5)
            .unwrap()
            .iter()
            .any(|document| document.tags.to_lowercase().contains("xmsc")));

        let workspace = export_workspace(&connection).unwrap();
        let mut restored = Connection::open_in_memory().unwrap();
        crate::database::migrations::run(&restored).unwrap();
        import_workspace(&mut restored, workspace).unwrap();
        let restored_detail = load_detail(&restored, &session.id).unwrap().unwrap();
        assert_eq!(restored_detail.messages.len(), 1);
        assert!(!list_rag_documents(&restored, 20).unwrap().is_empty());
    }
}
