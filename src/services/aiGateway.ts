import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './nativeGateway'
import type {
  AiMessage,
  AiConnectionTest,
  AiWorkspaceData,
  AiProviderRequest,
  AiProviderResponse,
  AiProviderStatus,
  AiSession,
  AiSessionDetail,
  CreateAiSessionInput,
  RagDocument,
  SaveRagDocumentInput,
  UpdateAiSessionInput,
} from '../types/ai'

const SESSIONS_KEY = 'vertex.aiSessions'
const MESSAGES_KEY = 'vertex.aiMessages'
const RAG_DOCUMENTS_KEY = 'vertex.ragDocuments'

const load = <T>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T
  } catch {
    return fallback
  }
}

const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))
const timestamp = () => new Date().toISOString()

const fallbackRag: RagDocument[] = [
  {
    id: 'relationship-design-safety',
    title: 'FileMaker Relationship Design safety',
    content: 'Base TableとTable Occurrenceを区別し、左右のフィールド型・演算子・孤立TO・重複関係・循環を確認します。Anchor-Buoyでは文脈ごとにTOを分け、既存IDを維持します。',
    sourceType: 'relationship-design-rules',
    tags: 'relationship design Anchor-Buoy table occurrence field type cycle orphan duplicate safety',
    score: 1,
  },
  {
    id: 'fm-clipboard-root',
    title: 'FileMaker Clipboard XML root',
    content: 'fmxmlsnippet type="FMObjectList"を使用し、XMSCはScript、XMSSはStepを直下に保持します。',
    sourceType: 'filemaker-spec',
    tags: 'FileMaker XML XMSC XMSS',
    score: 1,
  },
  {
    id: 'vertex-ai-policy',
    title: 'Vertex AI execution policy',
    content: 'Dry Runを既定とし、XML検証・差分・ユーザー承認の後だけFileMakerへ送信します。',
    sourceType: 'vertex-rule',
    tags: 'safety approval validation',
    score: 1,
  },
]

export const aiGateway = {
  async exportWorkspace(): Promise<AiWorkspaceData> {
    if (isTauriRuntime()) return invoke<AiWorkspaceData>('export_ai_workspace')
    return {
      sessions: load<AiSession[]>(SESSIONS_KEY, []),
      messages: load<AiMessage[]>(MESSAGES_KEY, []),
      ragDocuments: load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag),
    }
  },

  async importWorkspace(workspace: AiWorkspaceData) {
    if (isTauriRuntime()) return invoke<void>('import_ai_workspace', { workspace })
    save(SESSIONS_KEY, workspace.sessions)
    save(MESSAGES_KEY, workspace.messages)
    save(RAG_DOCUMENTS_KEY, workspace.ragDocuments)
  },

  async listRagDocuments(limit = 500) {
    if (isTauriRuntime()) return invoke<RagDocument[]>('list_ai_rag_documents', { limit })
    return load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag).slice(0, limit)
  },

  async saveRagDocument(document: SaveRagDocumentInput) {
    if (isTauriRuntime()) return invoke<RagDocument>('save_ai_rag_document', { document })
    const documents = load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag)
    const saved: RagDocument = { ...document, id: document.id ?? crypto.randomUUID(), score: 0 }
    const index = documents.findIndex((candidate) => candidate.id === saved.id)
    if (index >= 0) documents[index] = saved
    else documents.unshift(saved)
    save(RAG_DOCUMENTS_KEY, documents)
    return saved
  },

  async deleteRagDocument(id: string) {
    if (isTauriRuntime()) return invoke<boolean>('delete_ai_rag_document', { id })
    const documents = load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag)
    const next = documents.filter((document) => document.id !== id)
    save(RAG_DOCUMENTS_KEY, next)
    return next.length !== documents.length
  },

  async listSessions(projectId: string, limit = 100) {
    if (isTauriRuntime()) return invoke<AiSession[]>('list_ai_sessions', { projectId, limit })
    return load<AiSession[]>(SESSIONS_KEY, [])
      .filter((session) => session.projectId === projectId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit)
  },

  async createSession(session: CreateAiSessionInput) {
    if (isTauriRuntime()) return invoke<AiSession>('create_ai_session', { session })
    const now = timestamp()
    const created: AiSession = {
      ...session,
      id: crypto.randomUUID(),
      riskLevel: 'LOW',
      status: 'active',
      generatedXml: '',
      validationStatus: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    save(SESSIONS_KEY, [created, ...load<AiSession[]>(SESSIONS_KEY, [])])
    return created
  },

  async loadSession(id: string) {
    if (isTauriRuntime()) return invoke<AiSessionDetail | null>('load_ai_session', { id })
    const session = load<AiSession[]>(SESSIONS_KEY, []).find((candidate) => candidate.id === id)
    if (!session) return null
    return {
      session,
      messages: load<AiMessage[]>(MESSAGES_KEY, []).filter((message) => message.sessionId === id),
    }
  },

  async saveMessage(message: Omit<AiMessage, 'id' | 'createdAt'>) {
    if (isTauriRuntime()) return invoke<AiMessage>('save_ai_message', { message })
    const created: AiMessage = { ...message, id: crypto.randomUUID(), createdAt: timestamp() }
    save(MESSAGES_KEY, [...load<AiMessage[]>(MESSAGES_KEY, []), created])
    return created
  },

  async updateSession(id: string, changes: UpdateAiSessionInput) {
    if (isTauriRuntime()) return invoke<AiSession>('update_ai_session', { id, changes })
    const sessions = load<AiSession[]>(SESSIONS_KEY, [])
    const index = sessions.findIndex((session) => session.id === id)
    if (index < 0) throw new Error('AI Sessionが見つかりません')
    sessions[index] = { ...sessions[index], ...changes, updatedAt: timestamp() }
    save(SESSIONS_KEY, sessions)
    return sessions[index]
  },

  async searchRag(query: string, limit = 8) {
    if (isTauriRuntime()) return invoke<RagDocument[]>('search_ai_rag', { query, limit })
    const normalizedQuery = query.toLocaleLowerCase()
    const terms = normalizedQuery.split(/[\s、。,:：/()[\]「」]+/).filter((term) => term.length >= 2)
    const intentAliases: Array<[string, string[]]> = [
      ['スクリプト', ['script', 'xmsc']],
      ['ステップ', ['step', 'xmss']],
      ['レビュー', ['review', 'validation', 'inspect']],
      ['検証', ['validation', 'validate']],
      ['差分', ['diff', 'change']],
      ['安全', ['safety', 'approval']],
      ['削除', ['deletion', 'destructive']],
    ]
    for (const [keyword, aliases] of intentAliases) {
      if (normalizedQuery.includes(keyword)) terms.push(...aliases)
    }
    const ranked = load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag)
      .map((document) => ({
        ...document,
        score: terms.reduce((score, term) =>
          `${document.title} ${document.content} ${document.tags}`.toLocaleLowerCase().includes(term)
            ? score + 2
            : score, 0),
      }))
      .filter((document) => document.score > 0)
      .sort((left, right) => right.score - left.score)
    return (ranked.length > 0 ? ranked : load<RagDocument[]>(RAG_DOCUMENTS_KEY, fallbackRag).map((document) => ({ ...document, score: 1 })))
      .slice(0, limit)
  },

  async providerStatus() {
    if (isTauriRuntime()) return invoke<AiProviderStatus[]>('get_ai_provider_status')
    return [
      {
        id: 'openai',
        name: 'OpenAI Responses API',
        available: true,
        authenticated: false,
        detail: 'Tauriアプリの起動環境へOPENAI_API_KEYを設定してください',
      },
      {
        id: 'codex',
        name: 'Codex App Server',
        available: false,
        authenticated: false,
        detail: 'Phase 2で接続予定',
      },
    ]
  },

  async saveOpenAiApiKey(apiKey: string) {
    if (isTauriRuntime()) return invoke<AiProviderStatus>('save_openai_api_key', { apiKey })
    throw new Error('APIキーの保存はデスクトップアプリでのみ利用できます')
  },

  async deleteOpenAiApiKey() {
    if (isTauriRuntime()) return invoke<boolean>('delete_openai_api_key')
    throw new Error('APIキーの削除はデスクトップアプリでのみ利用できます')
  },

  async testProviderConnection(provider: string) {
    if (isTauriRuntime()) return invoke<AiConnectionTest>('test_ai_provider_connection', { provider })
    throw new Error('AI Providerの接続確認はデスクトップアプリでのみ利用できます')
  },

  async run(request: AiProviderRequest) {
    if (isTauriRuntime()) return invoke<AiProviderResponse>('run_ai_assistant', { request })
    throw new Error('ブラウザプレビューではAI Providerへ接続できません。Tauriアプリから実行してください。')
  },

  async runRelationshipDesign(request: AiProviderRequest) {
    if (isTauriRuntime()) return invoke<AiProviderResponse>('run_ai_relationship_design', { request })
    throw new Error('AIリレーション設計はデスクトップアプリでのみ利用できます。')
  },
}
