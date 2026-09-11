import { isKnownRelationshipOperator } from './relationshipOperators'
import { analyzeDesignGraph, findDependencyCycles } from './graphAnalyzer'
import type {
  DesignEntityId,
  DesignField,
  DesignProject,
  DesignTable,
  DesignValidationIssue,
  DesignValidationReport,
  TableOccurrence,
} from '../../types/design'

function issue(
  severity: DesignValidationIssue['severity'],
  code: string,
  message: string,
  path: string,
  entityId?: string,
): DesignValidationIssue {
  return { severity, code, message, path, entityId }
}

export function validateDesignProject(project: DesignProject): DesignValidationReport {
  const issues: DesignValidationIssue[] = []
  const tablesById = new Map(project.tables.map((table) => [table.id, table]))
  const occurrencesById = new Map(project.tableOccurrences.map((occurrence) => [occurrence.id, occurrence]))
  const entityIds = new Map<string, string>()

  registerId(project.projectId, 'project.projectId', issues, entityIds)
  project.tables.forEach((table, tableIndex) => {
    const tablePath = `tables[${tableIndex}]`
    registerId(table.id, `${tablePath}.id`, issues, entityIds)
    if (!table.name.trim()) issues.push(issue('error', 'TABLE_NAME_REQUIRED', 'Table name is required', `${tablePath}.name`, table.id))
    if (!table.fields.some((field) => field.isPrimaryKey)) {
      issues.push(issue('warning', 'PRIMARY_KEY_MISSING', `Table "${table.name}" does not have a primary key`, `${tablePath}.fields`, table.id))
    }
    table.fields.forEach((field, fieldIndex) => {
      const fieldPath = `${tablePath}.fields[${fieldIndex}]`
      registerId(field.id, `${fieldPath}.id`, issues, entityIds)
      if (!field.name.trim()) issues.push(issue('error', 'FIELD_NAME_REQUIRED', 'Field name is required', `${fieldPath}.name`, field.id))
      if (!field.type.trim()) issues.push(issue('error', 'FIELD_TYPE_REQUIRED', `Field "${field.name}" requires a type`, `${fieldPath}.type`, field.id))
      if (field.isPrimaryKey && field.isForeignKey) {
        issues.push(issue('warning', 'FIELD_KEY_ROLE_AMBIGUOUS', `Field "${field.name}" is both primary and foreign key`, fieldPath, field.id))
      }
    })
  })

  const occurrenceNames = new Map<string, string>()
  project.tableOccurrences.forEach((occurrence, occurrenceIndex) => {
    const occurrencePath = `tableOccurrences[${occurrenceIndex}]`
    registerId(occurrence.id, `${occurrencePath}.id`, issues, entityIds)
    const normalizedName = occurrence.name.trim().toLocaleLowerCase()
    const previousId = occurrenceNames.get(normalizedName)
    if (normalizedName && previousId) {
      issues.push(issue('warning', 'TABLE_OCCURRENCE_NAME_DUPLICATE', `Table occurrence name "${occurrence.name}" is duplicated`, `${occurrencePath}.name`, occurrence.id))
    } else if (normalizedName) occurrenceNames.set(normalizedName, occurrence.id)
    if (!tablesById.has(occurrence.baseTableId)) {
      issues.push(issue('error', 'TABLE_OCCURRENCE_TABLE_MISSING', `Table occurrence "${occurrence.name}" references a missing table`, `${occurrencePath}.baseTableId`, occurrence.id))
    }
    if (!Number.isFinite(occurrence.x) || !Number.isFinite(occurrence.y)) {
      issues.push(issue('error', 'TABLE_OCCURRENCE_POSITION_INVALID', `Table occurrence "${occurrence.name}" has an invalid canvas position`, occurrencePath, occurrence.id))
    }
    if (!Number.isFinite(occurrence.width) || occurrence.width < 120) {
      issues.push(issue('warning', 'TABLE_OCCURRENCE_WIDTH_INVALID', `Table occurrence "${occurrence.name}" width was expected to be at least 120`, `${occurrencePath}.width`, occurrence.id))
    }
  })

  project.relationships.forEach((relationship, relationshipIndex) => {
    const relationshipPath = `relationships[${relationshipIndex}]`
    registerId(relationship.id, `${relationshipPath}.id`, issues, entityIds)
    const leftOccurrence = occurrencesById.get(relationship.leftOccurrenceId)
    const rightOccurrence = occurrencesById.get(relationship.rightOccurrenceId)
    if (!leftOccurrence) issues.push(issue('error', 'RELATIONSHIP_LEFT_OCCURRENCE_MISSING', 'Relationship references a missing left table occurrence', `${relationshipPath}.leftOccurrenceId`, relationship.id))
    if (!rightOccurrence) issues.push(issue('error', 'RELATIONSHIP_RIGHT_OCCURRENCE_MISSING', 'Relationship references a missing right table occurrence', `${relationshipPath}.rightOccurrenceId`, relationship.id))
    if (!isKnownRelationshipOperator(relationship.operator)) {
      issues.push(issue('error', 'RELATIONSHIP_OPERATOR_UNKNOWN', `Unknown relationship operator "${relationship.operator}"`, `${relationshipPath}.operator`, relationship.id))
    }

    const leftField = resolveOccurrenceField(leftOccurrence, relationship.leftFieldId, tablesById)
    const rightField = resolveOccurrenceField(rightOccurrence, relationship.rightFieldId, tablesById)
    if (leftOccurrence && !leftField) issues.push(issue('error', 'RELATIONSHIP_LEFT_FIELD_MISSING', 'Relationship references a field that is not in the left occurrence base table', `${relationshipPath}.leftFieldId`, relationship.id))
    if (rightOccurrence && !rightField) issues.push(issue('error', 'RELATIONSHIP_RIGHT_FIELD_MISSING', 'Relationship references a field that is not in the right occurrence base table', `${relationshipPath}.rightFieldId`, relationship.id))
    if (relationship.leftOccurrenceId === relationship.rightOccurrenceId && relationship.leftFieldId === relationship.rightFieldId) {
      issues.push(issue('error', 'RELATIONSHIP_SELF_REFERENCE_INVALID', 'Relationship cannot connect a field to itself on the same occurrence', relationshipPath, relationship.id))
    }
    if (leftField && rightField && !fieldTypesCompatible(leftField.type, rightField.type)) {
      issues.push(issue('warning', 'RELATIONSHIP_FIELD_TYPE_MISMATCH', `Relationship fields use incompatible types: "${leftField.type}" and "${rightField.type}"`, relationshipPath, relationship.id))
    }
    validateKeyPair(leftField, rightField, relationshipPath, relationship.id, issues)
  })

  const graph = analyzeDesignGraph(project)
  for (const occurrenceId of graph.isolatedOccurrenceIds) {
    const occurrenceIndex = project.tableOccurrences.findIndex((candidate) => candidate.id === occurrenceId)
    issues.push(issue('warning', 'TABLE_OCCURRENCE_ORPHAN', 'Table occurrence is not connected to any relationship', `tableOccurrences[${occurrenceIndex}]`, occurrenceId))
  }
  if (graph.components.length > 1 && project.tableOccurrences.length > 1) {
    issues.push(issue('warning', 'RELATIONSHIP_GRAPH_DISCONNECTED', `Relationship graph contains ${graph.components.length} disconnected groups`, 'relationships'))
  }
  for (const cycle of graph.cycles) {
    issues.push(issue('warning', 'RELATIONSHIP_GRAPH_CYCLE', `Relationship graph cycle detected: ${cycle.join(' -> ')}`, 'relationships', cycle[0]))
  }
  for (const relationshipId of graph.duplicateRelationshipIds) {
    const relationshipIndex = project.relationships.findIndex((candidate) => candidate.id === relationshipId)
    issues.push(issue('error', 'RELATIONSHIP_DUPLICATE', 'An identical relationship is already defined', `relationships[${relationshipIndex}]`, relationshipId))
  }

  project.valueLists.forEach((valueList, valueListIndex) => {
    const valueListPath = `valueLists[${valueListIndex}]`
    registerId(valueList.id, `${valueListPath}.id`, issues, entityIds)
    if (valueList.source === 'field' && (!valueList.sourceFieldId || !findField(project.tables, valueList.sourceFieldId))) {
      issues.push(issue('error', 'VALUE_LIST_SOURCE_FIELD_MISSING', `Value list "${valueList.name}" references a missing source field`, `${valueListPath}.sourceFieldId`, valueList.id))
    }
  })

  project.scripts.forEach((script, index) => registerId(script.id, `scripts[${index}].id`, issues, entityIds))
  project.layouts.forEach((layout, index) => {
    registerId(layout.id, `layouts[${index}].id`, issues, entityIds)
    if (layout.baseOccurrenceId && !occurrencesById.has(layout.baseOccurrenceId)) {
      issues.push(issue('error', 'LAYOUT_OCCURRENCE_MISSING', `Layout "${layout.name}" references a missing table occurrence`, `layouts[${index}].baseOccurrenceId`, layout.id))
    }
  })
  const componentCardsById = new Map(project.componentCards.map((card) => [card.id, card]))
  const componentSequences = new Map<number, string>()
  project.componentCards.forEach((card, index) => {
    const cardPath = `componentCards[${index}]`
    registerId(card.id, `${cardPath}.id`, issues, entityIds)
    if (!card.title.trim()) issues.push(issue('error', 'COMPONENT_CARD_TITLE_REQUIRED', 'Component card title is required', `${cardPath}.title`, card.id))
    if (!Number.isInteger(card.sequence) || card.sequence < 1) issues.push(issue('error', 'COMPONENT_CARD_SEQUENCE_INVALID', 'Component card sequence must be a positive integer', `${cardPath}.sequence`, card.id))
    else if (componentSequences.has(card.sequence)) issues.push(issue('error', 'COMPONENT_CARD_SEQUENCE_DUPLICATE', `Component card sequence ${card.sequence} is duplicated`, `${cardPath}.sequence`, card.id))
    else componentSequences.set(card.sequence, card.id)
    if (card.executionMode === 'clipboard' && (!card.generatedXml || !card.clipboardFormat)) {
      issues.push(issue('warning', 'COMPONENT_CARD_CLIPBOARD_INCOMPLETE', `Component card "${card.title}" is missing clipboard XML or format`, cardPath, card.id))
    }
    card.dependencies.forEach((dependencyId, dependencyIndex) => {
      if (dependencyId === card.id) issues.push(issue('error', 'COMPONENT_CARD_DEPENDENCY_SELF', 'Component card cannot depend on itself', `${cardPath}.dependencies[${dependencyIndex}]`, card.id))
      else if (!componentCardsById.has(dependencyId)) issues.push(issue('error', 'COMPONENT_CARD_DEPENDENCY_MISSING', `Component card dependency "${dependencyId}" was not found`, `${cardPath}.dependencies[${dependencyIndex}]`, card.id))
    })
  })
  for (const cycle of findDependencyCycles(project.componentCards)) {
    issues.push(issue('error', 'COMPONENT_CARD_DEPENDENCY_CYCLE', `Component card dependency cycle detected: ${cycle.join(' -> ')}`, 'componentCards', cycle[0]))
  }

  if (!Number.isFinite(project.canvasState.zoom) || project.canvasState.zoom <= 0) {
    issues.push(issue('error', 'CANVAS_ZOOM_INVALID', 'Canvas zoom must be greater than zero', 'canvasState.zoom'))
  }
  if (!Number.isFinite(project.canvasState.pan.x) || !Number.isFinite(project.canvasState.pan.y)) {
    issues.push(issue('error', 'CANVAS_PAN_INVALID', 'Canvas pan position is invalid', 'canvasState.pan'))
  }

  const errors = issues.filter((candidate) => candidate.severity === 'error')
  const warnings = issues.filter((candidate) => candidate.severity === 'warning')
  return { valid: errors.length === 0, errors, warnings, issues }
}

function fieldTypesCompatible(left: string, right: string) {
  const normalize = (value: string) => value.trim().toLocaleLowerCase()
    .replace(/^calculation\s*[:(]?\s*/, '')
    .replace(/[)]$/, '')
  const leftType = normalize(left)
  const rightType = normalize(right)
  if (leftType === rightType) return true
  const numeric = new Set(['number', 'numeric', 'decimal', 'integer'])
  const temporal = new Set(['date', 'time', 'timestamp'])
  return (numeric.has(leftType) && numeric.has(rightType))
    || (temporal.has(leftType) && temporal.has(rightType))
}

function registerId(id: DesignEntityId, path: string, issues: DesignValidationIssue[], ids: Map<string, string>) {
  if (!id.trim()) {
    issues.push(issue('error', 'ENTITY_ID_REQUIRED', 'Entity ID is required', path))
    return
  }
  const previousPath = ids.get(id)
  if (previousPath) issues.push(issue('error', 'ENTITY_ID_DUPLICATE', `ID "${id}" is already used at ${previousPath}`, path, id))
  else ids.set(id, path)
}

function resolveOccurrenceField(
  occurrence: TableOccurrence | undefined,
  fieldId: string,
  tablesById: Map<string, DesignTable>,
) {
  if (!occurrence) return null
  return tablesById.get(occurrence.baseTableId)?.fields.find((field) => field.id === fieldId) ?? null
}

function findField(tables: DesignTable[], fieldId: string) {
  for (const table of tables) {
    const field = table.fields.find((candidate) => candidate.id === fieldId)
    if (field) return field
  }
  return null
}

function validateKeyPair(
  leftField: DesignField | null,
  rightField: DesignField | null,
  path: string,
  relationshipId: string,
  issues: DesignValidationIssue[],
) {
  if (!leftField || !rightField) return
  const leftKey = leftField.isPrimaryKey || leftField.isForeignKey
  const rightKey = rightField.isPrimaryKey || rightField.isForeignKey
  if (!leftKey && !rightKey) {
    issues.push(issue('warning', 'RELATIONSHIP_KEY_ROLE_MISSING', 'Neither relationship field is marked as a primary or foreign key', path, relationshipId))
  }
  if (leftField.isForeignKey && !rightField.isPrimaryKey) {
    issues.push(issue('warning', 'FOREIGN_KEY_TARGET_MISMATCH', `Foreign key "${leftField.name}" does not target a primary key`, path, relationshipId))
  }
  if (rightField.isForeignKey && !leftField.isPrimaryKey) {
    issues.push(issue('warning', 'FOREIGN_KEY_TARGET_MISMATCH', `Foreign key "${rightField.name}" does not target a primary key`, path, relationshipId))
  }
}
