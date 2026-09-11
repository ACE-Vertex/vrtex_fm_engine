import { featureAccess } from './featureAccess'
import { findDependencyCycles } from '../domain/design/graphAnalyzer'
import { relationshipOperator } from '../domain/design/relationshipOperators'
import type {
  ComponentCard,
  ComponentCardHistoryAction,
  ComponentCardKind,
  ComponentCardStatus,
  ComponentCardValidationIssue,
  ComponentCardValidationResult,
  ComponentExecutionMode,
  DesignProject,
  DesignRelationship,
  DesignTable,
} from '../types/design'

const IMPLEMENTED_STATUSES = new Set<ComponentCardStatus>(['copied', 'applied', 'verified', 'skipped'])
const STATUS_TRANSITIONS: Record<ComponentCardStatus, readonly ComponentCardStatus[]> = {
  draft: ['aiGenerated', 'validating', 'skipped'],
  aiGenerated: ['validating', 'validationError', 'warning', 'ready', 'skipped', 'failed'],
  validating: ['validationError', 'warning', 'ready', 'failed'],
  validationError: ['aiGenerated', 'validating', 'skipped'],
  warning: ['aiGenerated', 'validating', 'ready', 'copied', 'applied', 'skipped', 'failed'],
  ready: ['aiGenerated', 'validating', 'copied', 'applied', 'skipped', 'failed'],
  copied: ['aiGenerated', 'validating', 'applied', 'verified', 'failed'],
  applied: ['aiGenerated', 'validating', 'verified', 'failed'],
  verified: ['aiGenerated', 'validating'],
  skipped: ['aiGenerated', 'validating'],
  failed: ['aiGenerated', 'validating', 'skipped'],
}

export class ComponentCardDependencyCycleError extends Error {
  constructor(public readonly cycles: string[][]) {
    super(`Component card dependency cycle detected: ${cycles.map((cycle) => cycle.join(' -> ')).join('; ')}`)
    this.name = 'ComponentCardDependencyCycleError'
  }
}

export interface ComponentCardDependencyState {
  ready: boolean
  pendingIds: string[]
}

export function generateComponentCards(project: DesignProject): ComponentCard[] {
  featureAccess.require('componentCards')
  const now = new Date().toISOString()
  const existing = new Map(project.componentCards.map((card) => [card.id, card]))
  const generated: ComponentCard[] = []

  for (const table of project.tables) {
    const id = `card_table_${table.id}`
    const xml = generateTableXml(table)
    generated.push(mergeCard(existing.get(id) ?? findLegacyCard(project, 'table', table.id), {
      id,
      projectId: project.projectId,
      sequence: 0,
      title: table.name,
      description: table.description || `${table.name}と${table.fields.length}フィールドを作成します。`,
      kind: 'table',
      executionMode: 'clipboard',
      sourceType: 'designTable',
      sourceContent: JSON.stringify(table, null, 2),
      sourceIds: [table.id],
      dependencies: [],
      tags: ['Table', ...table.fields.some((field) => field.isPrimaryKey) ? ['PrimaryKey'] : []],
      clipboardFormat: 'XMTB',
      generatedXml: xml,
      aiExplanation: table.description || 'FileMakerでデータを保持する基礎テーブルです。',
      elements: table.fields.map((field) => `${field.name} · ${field.type}${field.isPrimaryKey ? ' · PK' : field.isForeignKey ? ' · FK' : ''}`),
      now,
    }))
  }

  for (const valueList of project.valueLists) {
    const dependencyTableIds = project.tables
      .filter((table) => table.fields.some((field) => field.id === valueList.sourceFieldId || field.id === valueList.secondFieldId))
      .map((table) => `card_table_${table.id}`)
    generated.push(mergeCard(existing.get(`card_value_list_${valueList.id}`) ?? findLegacyCard(project, 'valueList', valueList.id), {
      id: `card_value_list_${valueList.id}`,
      projectId: project.projectId,
      sequence: 0,
      title: valueList.name,
      description: `値一覧「${valueList.name}」を設定します。`,
      kind: 'valueList',
      executionMode: 'manual',
      sourceType: 'designValueList',
      sourceContent: JSON.stringify(valueList, null, 2),
      sourceIds: [valueList.id],
      dependencies: dependencyTableIds,
      tags: ['ValueList'],
      aiExplanation: '入力値を統一するためのFileMaker値一覧です。',
      elements: valueList.values.length ? valueList.values : [valueList.source === 'field' ? 'フィールド参照値一覧' : '値一覧設定'],
      now,
    }))
  }

  for (const script of project.scripts) {
    const hasXml = Boolean(script.generatedXml?.trim())
    generated.push(mergeCard(existing.get(`card_script_${script.id}`) ?? findLegacyCard(project, 'script', script.id), {
      id: `card_script_${script.id}`,
      projectId: project.projectId,
      sequence: 0,
      title: script.name,
      description: script.description || `スクリプト「${script.name}」を実装します。`,
      kind: 'script',
      executionMode: hasXml ? 'clipboard' : 'manual',
      sourceType: 'designScript',
      sourceContent: JSON.stringify(script, null, 2),
      sourceIds: [script.id],
      dependencies: project.tables.map((table) => `card_table_${table.id}`),
      tags: ['Script'],
      clipboardFormat: hasXml ? 'XMSC' : undefined,
      generatedXml: script.generatedXml,
      aiExplanation: script.description || 'FileMakerの処理を自動化するスクリプトです。',
      elements: [`${script.steps.length} Script Steps`],
      now,
    }))
  }

  for (const layout of project.layouts) {
    const occurrence = project.tableOccurrences.find((candidate) => candidate.id === layout.baseOccurrenceId)
    generated.push(mergeCard(existing.get(`card_layout_${layout.id}`) ?? findLegacyCard(project, 'layout', layout.id), {
      id: `card_layout_${layout.id}`,
      projectId: project.projectId,
      sequence: 0,
      title: layout.name,
      description: layout.description || `レイアウト「${layout.name}」を構成します。`,
      kind: 'layout',
      executionMode: 'manual',
      sourceType: 'designLayout',
      sourceContent: JSON.stringify(layout, null, 2),
      sourceIds: [layout.id],
      dependencies: occurrence ? [`card_table_${occurrence.baseTableId}`] : [],
      tags: ['Layout'],
      aiExplanation: layout.description || 'ユーザーが情報を確認・入力するFileMakerレイアウトです。',
      elements: layout.objects.map((object) => `${object.type} · ${object.name}`),
      now,
    }))
  }

  for (const relationship of project.relationships) {
    generated.push(relationshipGuideCard(project, relationship, existing.get(`card_relationship_${relationship.id}`), now))
  }

  const generatedIds = new Set(generated.map((card) => card.id))
  for (const card of project.componentCards) {
    if (!generatedIds.has(card.id) && !generated.some((candidate) => candidate.kind === card.kind && candidate.sourceIds.some((id) => card.sourceIds.includes(id)))) {
      generated.push(normalizeExistingCard(card, project.projectId, now))
    }
  }

  return optimizeComponentCardSequence(generated).map((card, index) => ({ ...card, sequence: index + 1 }))
}

export function generateComponentCardsFromAiResponse(response: string, projectId: string): ComponentCard[] {
  featureAccess.require('componentCards')
  const now = new Date().toISOString()
  const structured = extractStructuredCards(response)
  if (structured.length) {
    return structured.map((source, index) => {
      const generatedXml = typeof source.generatedXml === 'string' ? source.generatedXml.trim() : undefined
      const kind = normalizeKind(source.componentType ?? source.kind)
      return mergeCard(undefined, {
        id: typeof source.id === 'string' && source.id.trim() ? source.id.trim() : `card_ai_${Date.now().toString(36)}_${index + 1}`,
        projectId,
        sequence: index + 1,
        title: typeof source.title === 'string' && source.title.trim() ? source.title.trim() : `AI Component ${index + 1}`,
        description: typeof source.description === 'string' ? source.description.trim() : '',
        kind,
        executionMode: generatedXml ? 'clipboard' : normalizeExecutionMode(source.executionMode),
        sourceType: 'aiResponse',
        sourceContent: JSON.stringify(source, null, 2),
        sourceIds: stringArray(source.sourceIds),
        dependencies: stringArray(source.dependencies),
        tags: stringArray(source.tags),
        clipboardFormat: typeof source.clipboardFormat === 'string' ? source.clipboardFormat.trim() : generatedXml ? detectClipboardFormat(generatedXml) : undefined,
        generatedXml,
        aiExplanation: typeof source.aiExplanation === 'string' ? source.aiExplanation.trim() : undefined,
        elements: stringArray(source.elements),
        now,
      })
    })
  }

  const xmlBlocks = [...response.matchAll(/<fmxmlsnippet\b[\s\S]*?<\/fmxmlsnippet>/gi)].map((match) => match[0])
  return xmlBlocks.map((generatedXml, index) => {
    const kind = detectKindFromXml(generatedXml)
    return mergeCard(undefined, {
      id: `card_ai_xml_${Date.now().toString(36)}_${index + 1}`,
      projectId,
      sequence: index + 1,
      title: extractXmlTitle(generatedXml) || `AI ${kind} ${index + 1}`,
      description: 'AIレスポンスから抽出したFileMakerコンポーネントです。',
      kind,
      executionMode: 'clipboard',
      sourceType: 'aiResponseXml',
      sourceContent: response,
      sourceIds: [],
      dependencies: [],
      tags: ['AI', 'Generated'],
      clipboardFormat: detectClipboardFormat(generatedXml),
      generatedXml,
      aiExplanation: 'AIが生成したXMLを検証してからFileMakerへ送信します。',
      elements: [],
      now,
    })
  })
}

export function validateComponentCard(card: ComponentCard): ComponentCardValidationResult {
  featureAccess.require('xmlValidation')
  const errors: ComponentCardValidationIssue[] = []
  const warnings: ComponentCardValidationIssue[] = []
  if (!card.title.trim()) errors.push(issue('error', 'CARD_TITLE_REQUIRED', 'カードタイトルが必要です。'))
  if (!card.sourceIds.length) warnings.push(issue('warning', 'CARD_SOURCE_EMPTY', 'カードの生成元が設定されていません。'))
  if (card.executionMode === 'clipboard') {
    if (!card.clipboardFormat) errors.push(issue('error', 'CARD_FORMAT_REQUIRED', 'FileMakerクリップボード形式が必要です。'))
    if (!card.generatedXml?.trim()) errors.push(issue('error', 'CARD_XML_REQUIRED', '送信用XMLが生成されていません。'))
    else {
      const root = card.generatedXml.match(/^\s*(?:<\?xml[^>]*>\s*)?<fmxmlsnippet\b([^>]*)>/i)
      if (!root || !/<\/fmxmlsnippet>\s*$/i.test(card.generatedXml)) errors.push(issue('error', 'CARD_XML_ROOT', '完全なfmxmlsnippetルートが必要です。'))
      else if (!/\btype\s*=\s*["']FMObjectList["']/i.test(root[1] ?? '')) errors.push(issue('error', 'CARD_XML_TYPE', 'fmxmlsnippet type="FMObjectList"が必要です。'))
      else if (typeof DOMParser !== 'undefined') {
        const parsed = new DOMParser().parseFromString(card.generatedXml, 'application/xml')
        if (parsed.querySelector('parsererror')) errors.push(issue('error', 'CARD_XML_PARSE', 'XMLを解析できません。'))
      }
    }
  }
  if (card.executionMode === 'manual' && !card.elements.length) warnings.push(issue('warning', 'CARD_MANUAL_STEPS_EMPTY', '手動作業の内容を確認してください。'))
  return { valid: errors.length === 0, errors, warnings, validatedAt: new Date().toISOString() }
}

export function applyCardValidation(card: ComponentCard, validation = validateComponentCard(card)): ComponentCard {
  const status: ComponentCardStatus = validation.errors.length ? 'validationError' : validation.warnings.length ? 'warning' : 'ready'
  const now = new Date().toISOString()
  return {
    ...card,
    status: IMPLEMENTED_STATUSES.has(card.status) ? card.status : status,
    validatedXml: validation.valid ? card.generatedXml : undefined,
    validationResult: validation,
    updatedAt: now,
    history: appendHistory(card.history, 'validated', `${validation.errors.length} errors / ${validation.warnings.length} warnings`, now),
  }
}

export function dependencyState(card: ComponentCard, cards: ComponentCard[]): ComponentCardDependencyState {
  const byId = new Map(cards.map((candidate) => [candidate.id, candidate]))
  const pendingIds = card.dependencies.filter((id) => {
    const dependency = byId.get(id)
    return !dependency || !['applied', 'verified', 'skipped'].includes(dependency.status)
  })
  return { ready: pendingIds.length === 0, pendingIds }
}

export function transitionComponentCard(card: ComponentCard, status: ComponentCardStatus, detail?: string): ComponentCard {
  if (status !== card.status && !STATUS_TRANSITIONS[card.status].includes(status)) {
    throw new Error(`Invalid component card status transition: ${card.status} -> ${status}`)
  }
  const now = new Date().toISOString()
  const action = statusAction(status)
  return {
    ...card,
    status,
    isSkipped: status === 'skipped',
    copiedAt: status === 'copied' ? now : card.copiedAt,
    completedAt: ['verified', 'skipped'].includes(status) ? now : card.completedAt,
    retryCount: status === 'failed' ? card.retryCount + 1 : card.retryCount,
    updatedAt: now,
    history: action ? appendHistory(card.history, action, detail, now) : card.history,
  }
}

function relationshipGuideCard(project: DesignProject, relationship: DesignRelationship, existing: ComponentCard | undefined, now: string) {
  const leftOccurrence = project.tableOccurrences.find((item) => item.id === relationship.leftOccurrenceId)
  const rightOccurrence = project.tableOccurrences.find((item) => item.id === relationship.rightOccurrenceId)
  const leftTable = leftOccurrence ? project.tables.find((table) => table.id === leftOccurrence.baseTableId) : undefined
  const rightTable = rightOccurrence ? project.tables.find((table) => table.id === rightOccurrence.baseTableId) : undefined
  const leftField = leftTable?.fields.find((field) => field.id === relationship.leftFieldId)
  const rightField = rightTable?.fields.find((field) => field.id === relationship.rightFieldId)
  const title = `${leftOccurrence?.name ?? 'TO'} → ${rightOccurrence?.name ?? 'TO'}`
  const operator = relationshipOperator(relationship.operator)?.symbol ?? relationship.operator
  const expression = `${leftOccurrence?.name ?? '?'}::${leftField?.name ?? '?'} ${operator} ${rightOccurrence?.name ?? '?'}::${rightField?.name ?? '?'}`
  return mergeCard(existing, {
    id: `card_relationship_${relationship.id}`,
    projectId: project.projectId,
    sequence: 0,
    title,
    description: 'FileMakerのリレーションシップグラフで関連を設定します。',
    kind: 'relationship',
    executionMode: 'manual',
    sourceType: 'designRelationship',
    sourceContent: JSON.stringify(relationship, null, 2),
    sourceIds: [relationship.id],
    dependencies: [leftTable && `card_table_${leftTable.id}`, rightTable && `card_table_${rightTable.id}`].filter(Boolean) as string[],
    tags: ['Relationship', 'ManualStep'],
    aiExplanation: 'FileMaker上で参照先のレコードへアクセスするための手動設定です。',
    elements: [expression],
    now,
  })
}

interface CardSeed extends Omit<ComponentCard, 'status' | 'validationResult' | 'createdAt' | 'updatedAt' | 'copiedAt' | 'completedAt' | 'isRequired' | 'isSkipped' | 'retryCount' | 'history' | 'extensions'> {
  now: string
}

function mergeCard(existing: ComponentCard | undefined, seed: CardSeed): ComponentCard {
  const base: ComponentCard = {
    id: seed.id,
    projectId: seed.projectId,
    sequence: seed.sequence,
    title: seed.title,
    description: seed.description,
    kind: seed.kind,
    status: 'aiGenerated',
    executionMode: seed.executionMode,
    sourceType: seed.sourceType,
    sourceContent: seed.sourceContent,
    sourceIds: seed.sourceIds,
    dependencies: seed.dependencies,
    tags: seed.tags,
    clipboardFormat: seed.clipboardFormat,
    generatedXml: seed.generatedXml,
    validationResult: { valid: false, errors: [], warnings: [] },
    aiExplanation: seed.aiExplanation,
    elements: seed.elements,
    createdAt: seed.now,
    updatedAt: seed.now,
    isRequired: true,
    isSkipped: false,
    retryCount: 0,
    history: [{ id: historyId(), action: 'generated', timestamp: seed.now }],
  }
  if (!existing) return applyCardValidation(base)
  const merged = {
    ...base,
    ...existing,
    id: seed.id,
    projectId: seed.projectId,
    kind: seed.kind,
    executionMode: seed.executionMode,
    sourceType: seed.sourceType,
    sourceContent: seed.sourceContent,
    sourceIds: seed.sourceIds,
    dependencies: seed.dependencies,
    clipboardFormat: seed.clipboardFormat,
    generatedXml: seed.generatedXml,
    elements: seed.elements,
    tags: existing.tags.length ? existing.tags : seed.tags,
    aiExplanation: existing.aiExplanation || seed.aiExplanation,
    history: existing.history.length ? existing.history : base.history,
    updatedAt: seed.now,
  }
  return IMPLEMENTED_STATUSES.has(merged.status) ? merged : applyCardValidation({ ...merged, status: 'aiGenerated' })
}

function normalizeExistingCard(card: ComponentCard, projectId: string, now: string): ComponentCard {
  return applyCardValidation({ ...card, projectId: card.projectId || projectId, updatedAt: now })
}

function findLegacyCard(project: DesignProject, kind: ComponentCardKind, sourceId: string) {
  return project.componentCards.find((card) => card.kind === kind && card.sourceIds.includes(sourceId))
}

export function optimizeComponentCardSequence(cards: ComponentCard[]) {
  const cycles = findDependencyCycles(cards)
  if (cycles.length) throw new ComponentCardDependencyCycleError(cycles)
  const priority: Record<string, number> = { table: 10, valueList: 20, customFunction: 30, script: 40, scriptGroup: 41, relationship: 50, layout: 60, layoutObject: 70, button: 71, portal: 72, fieldPlacement: 73, calculation: 80, other: 90 }
  const remaining = [...cards].sort((a, b) => (priority[a.kind] ?? 99) - (priority[b.kind] ?? 99))
  const result: ComponentCard[] = []
  const emitted = new Set<string>()
  while (remaining.length) {
    const availableIndex = remaining.findIndex((card) => card.dependencies.every((id) => emitted.has(id) || !cards.some((candidate) => candidate.id === id)))
    if (availableIndex < 0) throw new ComponentCardDependencyCycleError(findDependencyCycles(remaining))
    const [card] = remaining.splice(availableIndex, 1)
    if (!card) break
    result.push(card)
    emitted.add(card.id)
  }
  return result
}

function generateTableXml(table: DesignTable) {
  const fields = table.fields.map((field) => {
    const attributes = [
      `name="${escapeXml(field.name)}"`,
      `type="${escapeXml(field.type)}"`,
      field.isPrimaryKey ? 'primaryKey="true"' : '',
      field.isForeignKey ? 'foreignKey="true"' : '',
      field.isRequired ? 'required="true"' : '',
    ].filter(Boolean).join(' ')
    return `    <Field ${attributes} />`
  }).join('\n')
  return `<fmxmlsnippet type="FMObjectList">\n  <BaseTable name="${escapeXml(table.name)}">\n${fields}\n  </BaseTable>\n</fmxmlsnippet>`
}

function escapeXml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
}

function extractStructuredCards(response: string): Array<Record<string, unknown>> {
  const candidates = [response.match(/```json\s*([\s\S]*?)```/i)?.[1], response].filter(Boolean) as string[]
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate.trim())
      if (Array.isArray(parsed)) return parsed.filter(isRecord)
      if (isRecord(parsed) && Array.isArray(parsed.componentCards)) return parsed.componentCards.filter(isRecord)
    } catch {
      // Continue with XML extraction when the AI returned prose around structured data.
    }
  }
  return []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item.trim())).map((item) => item.trim()) : []
}

function normalizeKind(value: unknown): ComponentCardKind {
  const normalized = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  const kinds: Record<string, ComponentCardKind> = { table: 'table', valuelist: 'valueList', script: 'script', scriptgroup: 'scriptGroup', customfunction: 'customFunction', layout: 'layout', layoutobject: 'layoutObject', button: 'button', portal: 'portal', fieldplacement: 'fieldPlacement', calculation: 'calculation', relationship: 'relationship' }
  return kinds[normalized] ?? 'other'
}

function normalizeExecutionMode(value: unknown): ComponentExecutionMode {
  const normalized = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  return normalized === 'review' || normalized === 'automated' || normalized === 'clipboard' ? normalized : 'manual'
}

function detectKindFromXml(xml: string): ComponentCardKind {
  if (/<Script\b/i.test(xml)) return 'script'
  if (/<BaseTable\b|<Table\b/i.test(xml)) return 'table'
  if (/<Layout\b/i.test(xml)) return 'layout'
  if (/<Field\b/i.test(xml)) return 'fieldPlacement'
  return 'other'
}

function detectClipboardFormat(xml: string) {
  if (/<Script\b/i.test(xml)) return 'XMSC'
  if (/<Step\b/i.test(xml)) return 'XMSS'
  if (/<BaseTable\b|<Table\b/i.test(xml)) return 'XMTB'
  if (/<Layout\b|<Object\b/i.test(xml)) return 'XML2'
  if (/<Field\b/i.test(xml)) return 'XMFD'
  return 'UNKNOWN'
}

function extractXmlTitle(xml: string) {
  return xml.match(/<(?:Script|BaseTable|Table|Layout|Field)\b[^>]*\bname="([^"]+)"/i)?.[1]
}

function issue(level: ComponentCardValidationIssue['level'], code: string, message: string): ComponentCardValidationIssue {
  return { level, code, message }
}

function appendHistory(history: ComponentCard['history'], action: ComponentCardHistoryAction, detail: string | undefined, timestamp: string) {
  const previous = history.at(-1)
  if (previous?.action === action && previous.detail === detail) return history
  return [...history, { id: historyId(), action, timestamp, detail }]
}

function statusAction(status: ComponentCardStatus): ComponentCardHistoryAction | null {
  if (status === 'copied' || status === 'applied' || status === 'verified' || status === 'skipped' || status === 'failed') return status
  return null
}

function historyId() {
  return `history_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
