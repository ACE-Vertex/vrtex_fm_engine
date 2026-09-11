export type AiMode = 'DEVELOP' | 'DESIGN' | 'REVIEW' | 'DEBUG' | 'XML'
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type AiMessageRole = 'user' | 'assistant' | 'system'

export interface AiSession {
  id: string
  projectId: string
  title: string
  mode: AiMode
  provider: string
  model: string
  dryRun: boolean
  riskLevel: RiskLevel
  status: string
  generatedXml: string
  validationStatus: string
  createdAt: string
  updatedAt: string
}

export interface AiMessage {
  id: string
  sessionId: string
  role: AiMessageRole
  content: string
  metadata: string
  createdAt: string
}

export interface AiSessionDetail {
  session: AiSession
  messages: AiMessage[]
}

export interface RagDocument {
  id: string
  title: string
  content: string
  sourceType: string
  tags: string
  score: number
}

export interface SaveRagDocumentInput {
  id?: string
  title: string
  content: string
  sourceType: string
  tags: string
}

export interface AiWorkspaceData {
  sessions: AiSession[]
  messages: AiMessage[]
  ragDocuments: RagDocument[]
}

export interface AiProviderStatus {
  id: string
  name: string
  available: boolean
  authenticated: boolean
  detail: string
}

export interface AiConnectionTest {
  provider: string
  success: boolean
  detail: string
  requestId: string | null
}

export interface AiProviderRequest {
  provider: string
  model: string
  projectId: string
  mode: AiMode
  dryRun: boolean
  format?: string
  currentXml?: string
  currentDesign?: string
  responseSchema?: Record<string, unknown>
  ragContext: string[]
  userPrompt: string
}

export interface AiProviderResponse {
  provider: string
  model: string
  content: string
  responseId: string | null
}

export interface CreateAiSessionInput {
  projectId: string
  title: string
  mode: AiMode
  provider: string
  model: string
  dryRun: boolean
}

export interface UpdateAiSessionInput {
  title?: string
  mode?: AiMode
  provider?: string
  model?: string
  dryRun?: boolean
  riskLevel?: RiskLevel
  status?: string
  generatedXml?: string
  validationStatus?: string
}
