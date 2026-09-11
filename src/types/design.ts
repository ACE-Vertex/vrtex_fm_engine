export const DESIGN_MODEL_VERSION = '1.0.0' as const

export type DesignEntityId = string
export type DesignValidationSeverity = 'error' | 'warning'

export interface ExtensibleDesignEntity {
  extensions?: Record<string, unknown>
}

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'container'
  | 'calculation'
  | 'summary'
  | (string & {})

export interface FieldAutoEnterSettings extends ExtensibleDesignEntity {
  serial?: boolean
  nextValue?: number
  increment?: number
  creationTimestamp?: boolean
  modificationTimestamp?: boolean
  creationAccountName?: boolean
  modificationAccountName?: boolean
  calculation?: string
  prohibitModification?: boolean
}

export interface FieldStorageSettings extends ExtensibleDesignEntity {
  global?: boolean
  indexed?: boolean
  repetitions?: number
  language?: string
}

export interface FieldValidationSettings extends ExtensibleDesignEntity {
  notEmpty?: boolean
  unique?: boolean
  existingValue?: boolean
  memberOfValueListId?: DesignEntityId
  minimum?: number | string
  maximum?: number | string
  calculation?: string
  message?: string
}

export interface FieldCalculationSettings extends ExtensibleDesignEntity {
  formula?: string
  resultType?: FieldType
  unstored?: boolean
}

export interface DesignField extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  type: FieldType
  comment: string
  isPrimaryKey: boolean
  isForeignKey: boolean
  isRequired: boolean
  autoEnter: FieldAutoEnterSettings
  storage: FieldStorageSettings
  validation: FieldValidationSettings
  calculation: FieldCalculationSettings
}

export interface DesignTable extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  description: string
  fields: DesignField[]
}

export interface TableOccurrence extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  baseTableId: DesignEntityId
  x: number
  y: number
  width: number
  height?: number
  collapsed: boolean
}

export type RelationshipOperatorId =
  | 'equal'
  | 'notEqual'
  | 'lessThan'
  | 'lessThanOrEqual'
  | 'greaterThan'
  | 'greaterThanOrEqual'
  | 'cartesian'
  | (string & {})

export interface DesignRelationship extends ExtensibleDesignEntity {
  id: DesignEntityId
  leftOccurrenceId: DesignEntityId
  leftFieldId: DesignEntityId
  operator: RelationshipOperatorId
  rightOccurrenceId: DesignEntityId
  rightFieldId: DesignEntityId
  allowCreateLeft: boolean
  allowCreateRight: boolean
  deleteRelatedLeft: boolean
  deleteRelatedRight: boolean
  sortRelatedLeft: boolean
  sortRelatedRight: boolean
}

export interface DesignValueList extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  source: 'custom' | 'field' | 'external' | (string & {})
  values: string[]
  sourceFieldId?: DesignEntityId
  secondFieldId?: DesignEntityId
}

export interface DesignScript extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  description: string
  steps: unknown[]
  generatedXml?: string
}

export interface DesignLayoutObject extends ExtensibleDesignEntity {
  id: DesignEntityId
  type: string
  name: string
  bounds?: { x: number; y: number; width: number; height: number }
}

export interface DesignLayout extends ExtensibleDesignEntity {
  id: DesignEntityId
  name: string
  baseOccurrenceId?: DesignEntityId
  description: string
  objects: DesignLayoutObject[]
}

export const COMPONENT_CARD_TYPES = [
  'table', 'valueList', 'script', 'scriptGroup', 'customFunction', 'layout',
  'layoutObject', 'button', 'portal', 'fieldPlacement', 'calculation',
  'relationship', 'other',
] as const

export type ComponentCardKind = typeof COMPONENT_CARD_TYPES[number] | (string & {})

export const COMPONENT_CARD_STATUSES = [
  'draft', 'aiGenerated', 'validating', 'validationError', 'warning', 'ready',
  'copied', 'applied', 'verified', 'skipped', 'failed',
] as const

export type ComponentCardStatus = typeof COMPONENT_CARD_STATUSES[number]

export const COMPONENT_EXECUTION_MODES = ['clipboard', 'manual', 'review', 'automated'] as const
export type ComponentExecutionMode = typeof COMPONENT_EXECUTION_MODES[number]

export type ComponentCardHistoryAction = 'generated' | 'validated' | 'copied' | 'applied' | 'verified' | 'modified' | 'regenerated' | 'skipped' | 'failed'

export interface ComponentCardValidationIssue {
  level: 'warning' | 'error'
  code: string
  message: string
}

export interface ComponentCardValidationResult {
  valid: boolean
  errors: ComponentCardValidationIssue[]
  warnings: ComponentCardValidationIssue[]
  validatedAt?: string
}

export interface ComponentCardHistoryEntry {
  id: string
  action: ComponentCardHistoryAction
  timestamp: string
  detail?: string
}

export interface ComponentCard extends ExtensibleDesignEntity {
  id: DesignEntityId
  projectId: DesignEntityId
  sequence: number
  title: string
  description: string
  kind: ComponentCardKind
  status: ComponentCardStatus
  executionMode: ComponentExecutionMode
  sourceType: string
  sourceContent: string
  sourceIds: DesignEntityId[]
  dependencies: DesignEntityId[]
  tags: string[]
  clipboardFormat?: string
  generatedXml?: string
  validatedXml?: string
  validationResult: ComponentCardValidationResult
  aiExplanation?: string
  elements: string[]
  createdAt: string
  updatedAt: string
  copiedAt?: string
  completedAt?: string
  isRequired: boolean
  isSkipped: boolean
  retryCount: number
  history: ComponentCardHistoryEntry[]
}

export interface CanvasPoint {
  x: number
  y: number
}

export interface CanvasState extends ExtensibleDesignEntity {
  zoom: number
  pan: CanvasPoint
  selectedOccurrenceIds: DesignEntityId[]
  selectedRelationshipId: DesignEntityId | null
  arrangement: 'anchorBuoy' | 'hierarchy' | 'cluster' | 'manual' | (string & {})
}

export interface AiDesignInfo extends ExtensibleDesignEntity {
  provider?: string
  model?: string
  responseId?: string
  sourcePrompt?: string
  generatedAt?: string
  conversationSessionId?: string
}

export interface DesignProject extends ExtensibleDesignEntity {
  modelVersion: string
  projectId: DesignEntityId
  name: string
  description: string
  createdAt: string
  updatedAt: string
  tables: DesignTable[]
  tableOccurrences: TableOccurrence[]
  relationships: DesignRelationship[]
  valueLists: DesignValueList[]
  scripts: DesignScript[]
  layouts: DesignLayout[]
  componentCards: ComponentCard[]
  canvasState: CanvasState
  aiDesignInfo?: AiDesignInfo
}

export interface DesignValidationIssue {
  severity: DesignValidationSeverity
  code: string
  message: string
  path: string
  entityId?: DesignEntityId
}

export interface DesignValidationReport {
  valid: boolean
  errors: DesignValidationIssue[]
  warnings: DesignValidationIssue[]
  issues: DesignValidationIssue[]
}

export interface DesignParseResult {
  project: DesignProject | null
  validation: DesignValidationReport
}

export interface DesignProjectSnapshot {
  snapshotVersion: string
  savedAt: string
  project: DesignProject
}
