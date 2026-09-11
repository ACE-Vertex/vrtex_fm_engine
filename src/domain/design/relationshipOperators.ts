import type { RelationshipOperatorId } from '../../types/design'

export interface RelationshipOperatorDefinition {
  id: RelationshipOperatorId
  symbol: string
  nameJa: string
  nameEn: string
  fileMakerToken: string
}

export const RELATIONSHIP_OPERATORS: readonly RelationshipOperatorDefinition[] = [
  { id: 'equal', symbol: '=', nameJa: '等しい', nameEn: 'Equal', fileMakerToken: '=' },
  { id: 'notEqual', symbol: '≠', nameJa: '等しくない', nameEn: 'Not equal', fileMakerToken: '≠' },
  { id: 'lessThan', symbol: '<', nameJa: 'より小さい', nameEn: 'Less than', fileMakerToken: '<' },
  { id: 'lessThanOrEqual', symbol: '≤', nameJa: '以下', nameEn: 'Less than or equal', fileMakerToken: '≤' },
  { id: 'greaterThan', symbol: '>', nameJa: 'より大きい', nameEn: 'Greater than', fileMakerToken: '>' },
  { id: 'greaterThanOrEqual', symbol: '≥', nameJa: '以上', nameEn: 'Greater than or equal', fileMakerToken: '≥' },
  { id: 'cartesian', symbol: '×', nameJa: 'すべてのレコード', nameEn: 'Cartesian', fileMakerToken: 'x' },
] as const

const aliases = new Map<string, RelationshipOperatorId>([
  ...RELATIONSHIP_OPERATORS.flatMap((operator) => [
    [operator.id.toLocaleLowerCase(), operator.id] as const,
    [operator.symbol.toLocaleLowerCase(), operator.id] as const,
    [operator.fileMakerToken.toLocaleLowerCase(), operator.id] as const,
  ]),
  ['==', 'equal'],
  ['!=', 'notEqual'],
  ['<>', 'notEqual'],
  ['<=', 'lessThanOrEqual'],
  ['>=', 'greaterThanOrEqual'],
  ['*', 'cartesian'],
])

export function normalizeRelationshipOperator(value: unknown): RelationshipOperatorId {
  const normalized = typeof value === 'string' ? value.trim().toLocaleLowerCase() : ''
  return aliases.get(normalized) ?? (normalized || 'equal')
}

export function relationshipOperator(value: RelationshipOperatorId) {
  return RELATIONSHIP_OPERATORS.find((operator) => operator.id === value) ?? null
}

export function isKnownRelationshipOperator(value: RelationshipOperatorId) {
  return relationshipOperator(value) !== null
}
