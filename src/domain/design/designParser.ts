import { normalizeRelationshipOperator } from './relationshipOperators'
import { validateAiDesignSchema } from './schemaValidator'
import { validateDesignProject } from './designValidator'
import {
  DESIGN_MODEL_VERSION,
  type ComponentCard,
  type DesignField,
  type DesignLayout,
  type DesignParseResult,
  type DesignProject,
  type DesignRelationship,
  type DesignScript,
  type DesignTable,
  type DesignValidationIssue,
  type DesignValueList,
  type TableOccurrence,
} from '../../types/design'

type JsonObject = Record<string, unknown>

export function createEmptyDesignProject(name = 'Untitled Design'): DesignProject {
  const now = new Date().toISOString()
  return {
    modelVersion: DESIGN_MODEL_VERSION,
    projectId: makeId('project', 0),
    name,
    description: '',
    createdAt: now,
    updatedAt: now,
    tables: [],
    tableOccurrences: [],
    relationships: [],
    valueLists: [],
    scripts: [],
    layouts: [],
    componentCards: [],
    canvasState: {
      zoom: 1,
      pan: { x: 0, y: 0 },
      selectedOccurrenceIds: [],
      selectedRelationshipId: null,
      arrangement: 'anchorBuoy',
    },
  }
}

export function parseAiDesign(input: string | unknown): DesignParseResult {
  const parsed = parseInput(input)
  if (!parsed.value) return failed(parsed.issues)
  const source = parsed.value
  const schemaIssues = validateAiDesignSchema(source)
  if (schemaIssues.length) return failed(schemaIssues)
  const projectSource = object(source.project)
  if (!projectSource) {
    return failed([validationIssue('error', 'AI_DESIGN_PROJECT_REQUIRED', 'AI Design JSON requires a project object', 'project')])
  }
  const projectName = text(projectSource.name)
  if (!projectName) {
    return failed([validationIssue('error', 'AI_DESIGN_PROJECT_NAME_REQUIRED', 'AI Design project requires a name', 'project.name')])
  }

  const now = new Date().toISOString()
  const tablesSource = array(source.tables ?? projectSource.tables)
  const occurrencesSource = array(source.occurrences ?? source.tableOccurrences ?? projectSource.occurrences ?? projectSource.tableOccurrences)
  const relationshipsSource = array(source.relationships ?? projectSource.relationships)
  const valueListsSource = array(source.valueLists ?? projectSource.valueLists)
  const scriptsSource = array(source.scripts ?? projectSource.scripts)
  const layoutsSource = array(source.layouts ?? projectSource.layouts)
  const cardsSource = array(source.componentCards ?? projectSource.componentCards)

  const project: DesignProject = {
    modelVersion: text(source.modelVersion) || DESIGN_MODEL_VERSION,
    projectId: text(projectSource.projectId) || text(projectSource.id) || makeId('project', 0),
    name: projectName,
    description: text(projectSource.description),
    createdAt: dateTime(projectSource.createdAt, now),
    updatedAt: dateTime(projectSource.updatedAt, now),
    tables: tablesSource.map(parseTable),
    tableOccurrences: occurrencesSource.map(parseOccurrence),
    relationships: relationshipsSource.map(parseRelationship),
    valueLists: valueListsSource.map(parseValueList),
    scripts: scriptsSource.map(parseScript),
    layouts: layoutsSource.map(parseLayout),
    componentCards: cardsSource.map(parseComponentCard),
    canvasState: parseCanvasState(object(source.canvasState ?? projectSource.canvasState)),
    aiDesignInfo: object(source.aiDesignInfo ?? projectSource.aiDesignInfo) as DesignProject['aiDesignInfo'],
    extensions: extensionData(source, ['modelVersion', 'project', 'tables', 'occurrences', 'tableOccurrences', 'relationships', 'valueLists', 'scripts', 'layouts', 'componentCards', 'canvasState', 'aiDesignInfo']),
  }
  const validation = validateDesignProject(project)
  return { project, validation }
}

function parseInput(input: string | unknown): { value: JsonObject | null; issues: DesignValidationIssue[] } {
  const directObject = object(input)
  if (directObject) return { value: directObject, issues: [] }
  if (typeof input !== 'string') {
    return { value: null, issues: [validationIssue('error', 'AI_DESIGN_INPUT_INVALID', 'AI Design input must be JSON text or an object', '$')] }
  }
  const normalized = input.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  try {
    const value: unknown = JSON.parse(normalized)
    const root = object(value)
    return root
      ? { value: root, issues: [] }
      : { value: null, issues: [validationIssue('error', 'AI_DESIGN_ROOT_INVALID', 'AI Design JSON root must be an object', '$')] }
  } catch (error) {
    return { value: null, issues: [validationIssue('error', 'AI_DESIGN_JSON_PARSE', `AI Design JSON could not be parsed: ${String(error)}`, '$')] }
  }
}

function parseTable(value: unknown, index: number): DesignTable {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('table', index),
    name: text(source.name),
    description: text(source.description),
    fields: array(source.fields).map((field, fieldIndex) => parseField(field, index, fieldIndex)),
    extensions: extensionData(source, ['id', 'name', 'description', 'fields']),
  }
}

function parseField(value: unknown, tableIndex: number, fieldIndex: number): DesignField {
  const source = object(value) ?? {}
  const autoEnter = object(source.autoEnter ?? source.autoEnterSettings) ?? {}
  const storage = object(source.storage ?? source.storageSettings) ?? {}
  const validation = object(source.validation ?? source.validationSettings) ?? {}
  const calculation = object(source.calculation ?? source.calculationSettings) ?? {}
  return {
    id: text(source.id) || makeId(`field_${tableIndex + 1}`, fieldIndex),
    name: text(source.name),
    type: text(source.type) || 'text',
    comment: text(source.comment),
    isPrimaryKey: bool(source.isPrimaryKey),
    isForeignKey: bool(source.isForeignKey),
    isRequired: bool(source.isRequired),
    autoEnter: {
      serial: optionalBool(autoEnter.serial), nextValue: optionalNumber(autoEnter.nextValue), increment: optionalNumber(autoEnter.increment),
      creationTimestamp: optionalBool(autoEnter.creationTimestamp), modificationTimestamp: optionalBool(autoEnter.modificationTimestamp),
      creationAccountName: optionalBool(autoEnter.creationAccountName), modificationAccountName: optionalBool(autoEnter.modificationAccountName),
      calculation: optionalText(autoEnter.calculation), prohibitModification: optionalBool(autoEnter.prohibitModification),
      extensions: extensionData(autoEnter, ['serial', 'nextValue', 'increment', 'creationTimestamp', 'modificationTimestamp', 'creationAccountName', 'modificationAccountName', 'calculation', 'prohibitModification']),
    },
    storage: {
      global: optionalBool(storage.global), indexed: optionalBool(storage.indexed), repetitions: optionalNumber(storage.repetitions), language: optionalText(storage.language),
      extensions: extensionData(storage, ['global', 'indexed', 'repetitions', 'language']),
    },
    validation: {
      notEmpty: optionalBool(validation.notEmpty), unique: optionalBool(validation.unique), existingValue: optionalBool(validation.existingValue),
      memberOfValueListId: optionalText(validation.memberOfValueListId), minimum: scalar(validation.minimum), maximum: scalar(validation.maximum),
      calculation: optionalText(validation.calculation), message: optionalText(validation.message),
      extensions: extensionData(validation, ['notEmpty', 'unique', 'existingValue', 'memberOfValueListId', 'minimum', 'maximum', 'calculation', 'message']),
    },
    calculation: {
      formula: optionalText(calculation.formula), resultType: optionalText(calculation.resultType), unstored: optionalBool(calculation.unstored),
      extensions: extensionData(calculation, ['formula', 'resultType', 'unstored']),
    },
    extensions: extensionData(source, ['id', 'name', 'type', 'comment', 'isPrimaryKey', 'isForeignKey', 'isRequired', 'autoEnter', 'autoEnterSettings', 'storage', 'storageSettings', 'validation', 'validationSettings', 'calculation', 'calculationSettings']),
  }
}

function parseOccurrence(value: unknown, index: number): TableOccurrence {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('to', index),
    name: text(source.name),
    baseTableId: text(source.baseTableId),
    x: number(source.x, 60 + (index % 4) * 290),
    y: number(source.y, 60 + Math.floor(index / 4) * 260),
    width: number(source.width, 240),
    height: optionalNumber(source.height),
    collapsed: bool(source.collapsed),
    extensions: extensionData(source, ['id', 'name', 'baseTableId', 'x', 'y', 'width', 'height', 'collapsed']),
  }
}

function parseRelationship(value: unknown, index: number): DesignRelationship {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('rel', index),
    leftOccurrenceId: text(source.leftOccurrenceId), leftFieldId: text(source.leftFieldId),
    operator: normalizeRelationshipOperator(source.operator),
    rightOccurrenceId: text(source.rightOccurrenceId), rightFieldId: text(source.rightFieldId),
    allowCreateLeft: bool(source.allowCreateLeft), allowCreateRight: bool(source.allowCreateRight),
    deleteRelatedLeft: bool(source.deleteRelatedLeft), deleteRelatedRight: bool(source.deleteRelatedRight),
    sortRelatedLeft: bool(source.sortRelatedLeft), sortRelatedRight: bool(source.sortRelatedRight),
    extensions: extensionData(source, ['id', 'leftOccurrenceId', 'leftFieldId', 'operator', 'rightOccurrenceId', 'rightFieldId', 'allowCreateLeft', 'allowCreateRight', 'deleteRelatedLeft', 'deleteRelatedRight', 'sortRelatedLeft', 'sortRelatedRight']),
  }
}

function parseValueList(value: unknown, index: number): DesignValueList {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('value_list', index), name: text(source.name), source: text(source.source) || 'custom',
    values: array(source.values).map(text).filter(Boolean), sourceFieldId: optionalText(source.sourceFieldId), secondFieldId: optionalText(source.secondFieldId),
    extensions: extensionData(source, ['id', 'name', 'source', 'values', 'sourceFieldId', 'secondFieldId']),
  }
}

function parseScript(value: unknown, index: number): DesignScript {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('script', index), name: text(source.name), description: text(source.description), steps: array(source.steps), generatedXml: optionalText(source.generatedXml),
    extensions: extensionData(source, ['id', 'name', 'description', 'steps', 'generatedXml']),
  }
}

function parseLayout(value: unknown, index: number): DesignLayout {
  const source = object(value) ?? {}
  return {
    id: text(source.id) || makeId('layout', index), name: text(source.name), baseOccurrenceId: optionalText(source.baseOccurrenceId), description: text(source.description), objects: array(source.objects) as DesignLayout['objects'],
    extensions: extensionData(source, ['id', 'name', 'baseOccurrenceId', 'description', 'objects']),
  }
}

function parseComponentCard(value: unknown, index: number): ComponentCard {
  const source = object(value) ?? {}
  const now = new Date().toISOString()
  const validation = object(source.validationResult) ?? {}
  const parseIssues = (value: unknown, level: 'warning' | 'error') => array(value).map((candidate) => {
    const item = object(candidate) ?? {}
    return { level, code: text(item.code) || 'CARD_VALIDATION', message: text(item.message) }
  }).filter((item) => item.message)
  const errors = parseIssues(validation.errors, 'error')
  const warnings = parseIssues(validation.warnings, 'warning')
  return {
    id: text(source.id) || makeId('card', index),
    projectId: text(source.projectId),
    sequence: number(source.sequence, index + 1),
    title: text(source.title),
    description: text(source.description),
    kind: text(source.kind) || text(source.componentType) || 'other',
    status: componentCardStatus(source.status),
    executionMode: componentExecutionMode(source.executionMode),
    sourceType: text(source.sourceType) || 'aiDesign',
    sourceContent: text(source.sourceContent),
    sourceIds: array(source.sourceIds).map(text).filter(Boolean),
    dependencies: array(source.dependencies).map(text).filter(Boolean),
    tags: array(source.tags).map(text).filter(Boolean),
    clipboardFormat: optionalText(source.clipboardFormat),
    generatedXml: optionalText(source.generatedXml),
    validatedXml: optionalText(source.validatedXml),
    validationResult: {
      valid: validation.valid === true && errors.length === 0,
      errors,
      warnings,
      validatedAt: optionalText(validation.validatedAt),
    },
    aiExplanation: optionalText(source.aiExplanation),
    elements: array(source.elements).map(text).filter(Boolean),
    createdAt: dateTime(source.createdAt, now),
    updatedAt: dateTime(source.updatedAt, now),
    copiedAt: optionalText(source.copiedAt),
    completedAt: optionalText(source.completedAt),
    isRequired: source.isRequired === undefined ? true : bool(source.isRequired),
    isSkipped: bool(source.isSkipped),
    retryCount: number(source.retryCount, 0),
    history: array(source.history).map((candidate, historyIndex) => {
      const item = object(candidate) ?? {}
      return {
        id: text(item.id) || `history_${index}_${historyIndex}`,
        action: componentHistoryAction(item.action),
        timestamp: dateTime(item.timestamp, now),
        detail: optionalText(item.detail),
      }
    }),
    extensions: extensionData(source, ['id', 'projectId', 'sequence', 'title', 'description', 'kind', 'componentType', 'status', 'executionMode', 'sourceType', 'sourceContent', 'sourceIds', 'dependencies', 'tags', 'clipboardFormat', 'generatedXml', 'validatedXml', 'validationResult', 'aiExplanation', 'elements', 'createdAt', 'updatedAt', 'copiedAt', 'completedAt', 'isRequired', 'isSkipped', 'retryCount', 'history']),
  }
}

function componentCardStatus(value: unknown): ComponentCard['status'] {
  const status = text(value)
  if (status === 'invalid') return 'validationError'
  return ['draft', 'aiGenerated', 'validating', 'validationError', 'warning', 'ready', 'copied', 'applied', 'verified', 'skipped', 'failed'].includes(status)
    ? status as ComponentCard['status']
    : 'draft'
}

function componentExecutionMode(value: unknown): ComponentCard['executionMode'] {
  const mode = text(value)
  return ['clipboard', 'manual', 'review', 'automated'].includes(mode) ? mode as ComponentCard['executionMode'] : 'manual'
}

function componentHistoryAction(value: unknown): ComponentCard['history'][number]['action'] {
  const action = text(value)
  return ['generated', 'validated', 'copied', 'applied', 'verified', 'modified', 'regenerated', 'skipped', 'failed'].includes(action)
    ? action as ComponentCard['history'][number]['action']
    : 'modified'
}

function parseCanvasState(source: JsonObject | null): DesignProject['canvasState'] {
  const value = source ?? {}
  const pan = object(value.pan) ?? {}
  return {
    zoom: number(value.zoom, 1), pan: { x: number(pan.x, 0), y: number(pan.y, 0) },
    selectedOccurrenceIds: array(value.selectedOccurrenceIds).map(text).filter(Boolean), selectedRelationshipId: optionalText(value.selectedRelationshipId) ?? null,
    arrangement: text(value.arrangement) || 'anchorBuoy',
    extensions: extensionData(value, ['zoom', 'pan', 'selectedOccurrenceIds', 'selectedRelationshipId', 'arrangement']),
  }
}

function failed(issues: DesignValidationIssue[]): DesignParseResult {
  return { project: null, validation: { valid: false, errors: issues.filter((item) => item.severity === 'error'), warnings: issues.filter((item) => item.severity === 'warning'), issues } }
}

function validationIssue(severity: DesignValidationIssue['severity'], code: string, message: string, path: string): DesignValidationIssue {
  return { severity, code, message, path }
}

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : [] }
function text(value: unknown): string { return typeof value === 'string' ? value.trim() : '' }
function optionalText(value: unknown): string | undefined { const result = text(value); return result || undefined }
function bool(value: unknown): boolean { return value === true || value === 'true' || value === 'True' || value === 1 }
function optionalBool(value: unknown): boolean | undefined { return value === undefined || value === null ? undefined : bool(value) }
function number(value: unknown, fallback: number): number { const result = typeof value === 'number' ? value : Number(value); return Number.isFinite(result) ? result : fallback }
function optionalNumber(value: unknown): number | undefined { if (value === undefined || value === null || value === '') return undefined; const result = Number(value); return Number.isFinite(result) ? result : undefined }
function scalar(value: unknown): number | string | undefined { return typeof value === 'number' || typeof value === 'string' ? value : undefined }
function dateTime(value: unknown, fallback: string): string { const result = text(value); return result && !Number.isNaN(Date.parse(result)) ? new Date(result).toISOString() : fallback }
function makeId(prefix: string, index: number): string { return `${prefix}_${String(index + 1).padStart(3, '0')}` }

function extensionData(source: JsonObject, knownKeys: string[]): Record<string, unknown> | undefined {
  const explicit = object(source.extensions) ?? {}
  const unknown = Object.fromEntries(Object.entries(source).filter(([key]) => key !== 'extensions' && !knownKeys.includes(key)))
  const combined = { ...unknown, ...explicit }
  return Object.keys(combined).length ? combined : undefined
}
