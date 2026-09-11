import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { aiGateway } from '../services/aiGateway'
import { useSettingsStore } from './settings'
import { useRelationshipDesignerStore } from './relationshipDesigner'
import type {
  AiMessage,
  AiMode,
  AiProviderStatus,
  AiSession,
  RagDocument,
  RiskLevel,
} from '../types/ai'

const PROJECT_ID = 'VertexProject'

export const useAiAssistantStore = defineStore('aiAssistant', () => {
  const settings = useSettingsStore()
  const relationshipDesigner = useRelationshipDesignerStore()
  const sessions = ref<AiSession[]>([])
  const activeSession = ref<AiSession | null>(null)
  const messages = ref<AiMessage[]>([])
  const ragDocuments = ref<RagDocument[]>([])
  const providers = ref<AiProviderStatus[]>([])
  const mode = ref<AiMode>('DEVELOP')
  const provider = ref<string>(settings.codexIntegration)
  const model = ref<string>(settings.codexModel)
  const dryRun = ref(true)
  const originalXml = ref('')
  const generatedXml = ref('')
  const validationStatus = ref<'pending' | 'pass' | 'fail'>('pending')
  const riskLevel = ref<RiskLevel>('LOW')
  const running = ref(false)
  const initialized = ref(false)
  const stages = ref<string[]>([])
  const lastError = ref('')

  const selectedProvider = computed(() =>
    providers.value.find((candidate) => candidate.id === provider.value) ?? null,
  )
  const canRun = computed(() => selectedProvider.value?.authenticated === true && !running.value)

  async function initialize(currentXml = '') {
    if (initialized.value) return
    providers.value = await aiGateway.providerStatus()
    sessions.value = await aiGateway.listSessions(PROJECT_ID)
    originalXml.value = currentXml
    if (sessions.value[0]) await selectSession(sessions.value[0].id)
    else await newSession()
    initialized.value = true
  }

  async function newSession() {
    const session = await aiGateway.createSession({
      projectId: PROJECT_ID,
      title: '新しいAI Session',
      mode: mode.value,
      provider: provider.value,
      model: model.value,
      dryRun: true,
    })
    sessions.value = [session, ...sessions.value.filter((candidate) => candidate.id !== session.id)]
    activeSession.value = session
    messages.value = []
    generatedXml.value = ''
    validationStatus.value = 'pending'
    riskLevel.value = 'LOW'
    dryRun.value = true
    stages.value = []
    lastError.value = ''
  }

  async function selectSession(id: string) {
    const detail = await aiGateway.loadSession(id)
    if (!detail) return
    activeSession.value = detail.session
    messages.value = detail.messages
    mode.value = detail.session.mode
    provider.value = detail.session.provider
    model.value = detail.session.model
    dryRun.value = detail.session.dryRun
    generatedXml.value = detail.session.generatedXml
    validationStatus.value = detail.session.validationStatus as typeof validationStatus.value
    riskLevel.value = detail.session.riskLevel
    stages.value = []
    lastError.value = ''
  }

  async function refreshProviders() {
    providers.value = await aiGateway.providerStatus()
  }

  async function sendPrompt(userPrompt: string, currentXml: string, format?: string) {
    const content = userPrompt.trim()
    if (!content || running.value) return
    if (!activeSession.value) await newSession()
    const session = activeSession.value
    if (!session) return
    running.value = true
    lastError.value = ''
    stages.value = ['要求を解析しています']
    originalXml.value = currentXml
    try {
      const userMessage = await aiGateway.saveMessage({
        sessionId: session.id,
        role: 'user',
        content,
        metadata: JSON.stringify({ mode: mode.value, dryRun: dryRun.value }),
      })
      messages.value.push(userMessage)

      // Keep the user's instruction in history even when the provider is offline.
      const title = session.title === '新しいAI Session' ? content.slice(0, 34) : session.title
      activeSession.value = await aiGateway.updateSession(session.id, {
        title,
        mode: mode.value,
        provider: provider.value,
        model: model.value,
        dryRun: dryRun.value,
      })
      sessions.value = [activeSession.value, ...sessions.value.filter((item) => item.id !== session.id)]

      stages.value.push('Vertex Project RAGを検索しています')
      ragDocuments.value = await aiGateway.searchRag(content, 8)
      stages.value.push(`${ragDocuments.value.length}件の参照情報を取得しました`)
      stages.value.push('AI Providerへ構造化コンテキストを送信しています')

      const response = await aiGateway.run({
        provider: provider.value,
        model: model.value,
        projectId: PROJECT_ID,
        mode: mode.value,
        dryRun: dryRun.value,
        format,
        currentXml,
        ragContext: ragDocuments.value.map((document) => `${document.title}\n${document.content}`),
        userPrompt: content,
      })
      const assistantMessage = await aiGateway.saveMessage({
        sessionId: session.id,
        role: 'assistant',
        content: response.content,
        metadata: JSON.stringify({ provider: response.provider, model: response.model, responseId: response.responseId }),
      })
      messages.value.push(assistantMessage)
      generatedXml.value = extractXml(response.content)
      const generatedCards = relationshipDesigner.addComponentCardsFromAiResponse(response.content)
      riskLevel.value = assessRisk(content, generatedXml.value)
      validationStatus.value = generatedXml.value ? 'pending' : 'pass'
      stages.value.push(generatedXml.value ? 'XMLを抽出しました' : '設計回答を受信しました')
      if (generatedCards.length) stages.value.push(`${generatedCards.length}件のComponent Cardを生成しました`)

      activeSession.value = await aiGateway.updateSession(session.id, {
        mode: mode.value,
        provider: provider.value,
        model: model.value,
        dryRun: dryRun.value,
        riskLevel: riskLevel.value,
        generatedXml: generatedXml.value,
        validationStatus: validationStatus.value,
      })
      sessions.value = [activeSession.value, ...sessions.value.filter((item) => item.id !== session.id)]
    } catch (error) {
      lastError.value = String(error)
      stages.value.push('AI Provider接続で停止しました')
      const systemMessage = await aiGateway.saveMessage({
        sessionId: session.id,
        role: 'system',
        content: lastError.value,
        metadata: JSON.stringify({ error: true }),
      })
      messages.value.push(systemMessage)
    } finally {
      running.value = false
    }
  }

  async function setValidation(status: 'pending' | 'pass' | 'fail') {
    validationStatus.value = status
    if (!activeSession.value) return
    activeSession.value = await aiGateway.updateSession(activeSession.value.id, {
      validationStatus: status,
      generatedXml: generatedXml.value,
      riskLevel: riskLevel.value,
      dryRun: dryRun.value,
    })
  }

  async function persistControls() {
    settings.codexIntegration = provider.value as 'openai' | 'codex'
    settings.codexModel = model.value
    if (!activeSession.value) return
    activeSession.value = await aiGateway.updateSession(activeSession.value.id, {
      mode: mode.value,
      provider: provider.value,
      model: model.value,
      dryRun: dryRun.value,
    })
  }

  return {
    sessions,
    activeSession,
    messages,
    ragDocuments,
    providers,
    mode,
    provider,
    model,
    dryRun,
    originalXml,
    generatedXml,
    validationStatus,
    riskLevel,
    running,
    initialized,
    stages,
    lastError,
    selectedProvider,
    canRun,
    initialize,
    newSession,
    selectSession,
    refreshProviders,
    sendPrompt,
    setValidation,
    persistControls,
  }
})

function extractXml(content: string) {
  const fenced = content.match(/```xml\s*([\s\S]*?<fmxmlsnippet[\s\S]*?<\/fmxmlsnippet>)\s*```/i)
  if (fenced?.[1]) return fenced[1].trim()
  const inline = content.match(/<fmxmlsnippet[\s\S]*?<\/fmxmlsnippet>/i)
  return inline?.[0]?.trim() ?? ''
}

function assessRisk(prompt: string, xml: string): RiskLevel {
  const text = `${prompt}\n${xml}`.toLocaleLowerCase()
  if (/ファイル削除|アカウント削除|権限変更|security|privilege|delete file/.test(text)) return 'CRITICAL'
  if (/削除|全置換|大量|drop |delete |replace all/.test(text)) return 'HIGH'
  if (xml || /変更|追加|修正|modify|add /.test(text)) return 'MEDIUM'
  return 'LOW'
}
