import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { createEmptyDesignProject, parseAiDesign } from '../domain/design/designParser'
import { validateDesignProject } from '../domain/design/designValidator'
import { applyCardValidation, generateComponentCards, generateComponentCardsFromAiResponse, transitionComponentCard, validateComponentCard } from '../services/componentCardEngine'
import { featureAccess } from '../services/featureAccess'
import type {
  ComponentCard,
  ComponentCardStatus,
  ComponentCardValidationResult,
  DesignParseResult,
  DesignProject,
  DesignProjectSnapshot,
  DesignRelationship,
  DesignValidationReport,
  TableOccurrence,
} from '../types/design'

const SNAPSHOT_VERSION = '1.0.0'

function emptyValidation(): DesignValidationReport {
  return { valid: true, errors: [], warnings: [], issues: [] }
}

export const useRelationshipDesignerStore = defineStore('relationshipDesigner', () => {
  const project = ref<DesignProject | null>(null)
  const validation = ref<DesignValidationReport>(emptyValidation())
  const dirty = ref(false)
  const sourceJson = ref('')
  const selectedComponentCardId = ref('')
  const lastProposalSnapshot = ref<DesignProjectSnapshot | null>(null)
  const lastProposalWasDirty = ref(false)

  const selectedOccurrence = computed(() => {
    const selectedId = project.value?.canvasState.selectedOccurrenceIds[0]
    return project.value?.tableOccurrences.find((occurrence) => occurrence.id === selectedId) ?? null
  })
  const selectedRelationship = computed(() => {
    const selectedId = project.value?.canvasState.selectedRelationshipId
    return project.value?.relationships.find((relationship) => relationship.id === selectedId) ?? null
  })
  const selectedComponentCard = computed(() =>
    project.value?.componentCards.find((card) => card.id === selectedComponentCardId.value) ?? null,
  )

  function newProject(name = 'Untitled Design') {
    featureAccess.require('relationshipDesigner')
    project.value = createEmptyDesignProject(name)
    validation.value = validateDesignProject(project.value)
    sourceJson.value = ''
    dirty.value = false
    return project.value
  }

  function loadAiDesign(input: string | unknown): DesignParseResult {
    featureAccess.require('relationshipDesigner')
    const result = parseAiDesign(input)
    validation.value = result.validation
    if (result.project) {
      project.value = result.project
      project.value.componentCards = generateComponentCards(project.value)
      validation.value = validateDesignProject(project.value)
      sourceJson.value = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
      dirty.value = false
    }
    return result
  }

  function previewAiDesign(input: string | unknown): DesignParseResult {
    featureAccess.require('relationshipDesigner')
    return parseAiDesign(input)
  }

  function applyAiProposal(input: string | unknown): DesignParseResult {
    featureAccess.require('relationshipDesigner')
    const result = parseAiDesign(input)
    if (!result.project || !result.validation.valid) return result
    lastProposalSnapshot.value = createSnapshot()
    lastProposalWasDirty.value = dirty.value
    project.value = result.project
    project.value.componentCards = generateComponentCards(project.value)
    validation.value = validateDesignProject(project.value)
    sourceJson.value = typeof input === 'string' ? input : JSON.stringify(input, null, 2)
    dirty.value = true
    return { project: project.value, validation: validation.value }
  }

  function undoLastAiProposal() {
    const snapshot = lastProposalSnapshot.value
    if (!snapshot) return false
    const wasDirty = lastProposalWasDirty.value
    const result = restoreSnapshot(snapshot)
    if (!result.project) return false
    dirty.value = wasDirty
    lastProposalSnapshot.value = null
    return true
  }

  function revalidate() {
    validation.value = project.value ? validateDesignProject(project.value) : emptyValidation()
    return validation.value
  }

  function regenerateComponentCards() {
    featureAccess.require('componentCards')
    if (!project.value) return []
    project.value.componentCards = generateComponentCards(project.value)
    if (!project.value.componentCards.some((card) => card.id === selectedComponentCardId.value)) selectedComponentCardId.value = ''
    touch()
    return project.value.componentCards
  }

  function addComponentCardsFromAiResponse(response: string) {
    featureAccess.require('componentCards')
    if (!project.value) project.value = createEmptyDesignProject('AI Components')
    const generated = generateComponentCardsFromAiResponse(response, project.value.projectId)
    const byId = new Map(project.value.componentCards.map((card) => [card.id, card]))
    for (const card of generated) byId.set(card.id, card)
    project.value.componentCards = [...byId.values()].map((card, index) => ({ ...card, sequence: index + 1 }))
    touch()
    return generated
  }

  function selectComponentCard(id: string | null) {
    selectedComponentCardId.value = id && project.value?.componentCards.some((card) => card.id === id) ? id : ''
  }

  function validateCard(id: string) {
    featureAccess.require('xmlValidation')
    const index = project.value?.componentCards.findIndex((card) => card.id === id) ?? -1
    if (!project.value || index < 0) return null
    const card = project.value.componentCards[index]
    if (!card) return null
    project.value.componentCards[index] = applyCardValidation(card, validateComponentCard(card))
    touch()
    return project.value.componentCards[index]
  }

  function applyComponentCardValidation(id: string, validation: ComponentCardValidationResult) {
    featureAccess.require('xmlValidation')
    const index = project.value?.componentCards.findIndex((card) => card.id === id) ?? -1
    if (!project.value || index < 0) return null
    const card = project.value.componentCards[index]
    if (!card) return null
    project.value.componentCards[index] = applyCardValidation(card, validation)
    touch()
    return project.value.componentCards[index]
  }

  function updateComponentCard(id: string, changes: Pick<Partial<ComponentCard>, 'title' | 'description' | 'generatedXml'>) {
    featureAccess.require('componentCards')
    const index = project.value?.componentCards.findIndex((card) => card.id === id) ?? -1
    if (!project.value || index < 0) return null
    const card = project.value.componentCards[index]
    if (!card) return null
    const now = new Date().toISOString()
    const updated: ComponentCard = {
      ...card,
      title: changes.title?.trim() || card.title,
      description: changes.description?.trim() ?? card.description,
      generatedXml: changes.generatedXml ?? card.generatedXml,
      status: 'aiGenerated',
      updatedAt: now,
      history: [...card.history, { id: `history_${Date.now().toString(36)}`, action: 'modified', timestamp: now }],
    }
    project.value.componentCards[index] = applyCardValidation(updated)
    touch()
    return project.value.componentCards[index]
  }

  function replaceComponentCardXml(id: string, generatedXml: string, detail = 'AI再生成') {
    featureAccess.require('componentCards')
    const index = project.value?.componentCards.findIndex((card) => card.id === id) ?? -1
    if (!project.value || index < 0 || !generatedXml.trim()) return null
    const card = project.value.componentCards[index]
    if (!card) return null
    const now = new Date().toISOString()
    const regenerated: ComponentCard = {
      ...card,
      generatedXml: generatedXml.trim(),
      validatedXml: undefined,
      status: 'aiGenerated',
      retryCount: card.retryCount + 1,
      updatedAt: now,
      history: [...card.history, { id: `history_${Date.now().toString(36)}`, action: 'regenerated', timestamp: now, detail }],
    }
    project.value.componentCards[index] = applyCardValidation(regenerated)
    touch()
    return project.value.componentCards[index]
  }

  function setComponentCardStatus(id: string, status: ComponentCardStatus, detail?: string) {
    featureAccess.require('componentCards')
    const index = project.value?.componentCards.findIndex((card) => card.id === id) ?? -1
    if (!project.value || index < 0) return null
    const card = project.value.componentCards[index]
    if (!card) return null
    project.value.componentCards[index] = transitionComponentCard(card, status, detail)
    touch()
    return project.value.componentCards[index]
  }

  function moveOccurrence(id: string, x: number, y: number) {
    featureAccess.require('tableOccurrenceCanvas')
    const occurrence = project.value?.tableOccurrences.find((candidate) => candidate.id === id)
    if (!occurrence || !Number.isFinite(x) || !Number.isFinite(y)) return false
    occurrence.x = x
    occurrence.y = y
    touch()
    return true
  }

  function moveOccurrences(positions: Array<{ id: string; x: number; y: number }>) {
    featureAccess.require('tableOccurrenceCanvas')
    if (!project.value || !positions.length) return false
    const occurrences = new Map(project.value.tableOccurrences.map((occurrence) => [occurrence.id, occurrence]))
    let moved = false
    for (const position of positions) {
      const occurrence = occurrences.get(position.id)
      if (!occurrence || !Number.isFinite(position.x) || !Number.isFinite(position.y)) continue
      occurrence.x = position.x
      occurrence.y = position.y
      moved = true
    }
    if (moved) touch()
    return moved
  }

  function resizeOccurrence(id: string, changes: { x?: number; y?: number; width?: number; height?: number }) {
    featureAccess.require('tableOccurrenceCanvas')
    const occurrence = project.value?.tableOccurrences.find((candidate) => candidate.id === id)
    if (!occurrence) return false
    if (changes.x !== undefined && Number.isFinite(changes.x)) occurrence.x = changes.x
    if (changes.y !== undefined && Number.isFinite(changes.y)) occurrence.y = changes.y
    if (changes.width !== undefined && Number.isFinite(changes.width)) occurrence.width = Math.max(180, changes.width)
    if (changes.height !== undefined && Number.isFinite(changes.height)) occurrence.height = Math.max(120, changes.height)
    touch()
    return true
  }

  function renameOccurrence(id: string, name: string) {
    featureAccess.require('tableOccurrenceCanvas')
    const occurrence = project.value?.tableOccurrences.find((candidate) => candidate.id === id)
    const nextName = name.trim()
    if (!occurrence || !nextName || project.value?.tableOccurrences.some((candidate) => candidate.id !== id && candidate.name === nextName)) return false
    occurrence.name = nextName
    touch()
    revalidate()
    return true
  }

  function createOccurrence(occurrence: TableOccurrence) {
    featureAccess.require('tableOccurrenceCanvas')
    if (!project.value || project.value.tableOccurrences.some((candidate) => candidate.id === occurrence.id)) return false
    if (!project.value.tables.some((table) => table.id === occurrence.baseTableId)) return false
    project.value.tableOccurrences.push(structuredClone(occurrence))
    project.value.canvasState.selectedOccurrenceIds = [occurrence.id]
    project.value.canvasState.selectedRelationshipId = null
    touch()
    revalidate()
    return true
  }

  function deleteOccurrence(id: string) {
    featureAccess.require('tableOccurrenceCanvas')
    if (!project.value || project.value.relationships.some((relationship) => relationship.leftOccurrenceId === id || relationship.rightOccurrenceId === id)) return false
    const index = project.value.tableOccurrences.findIndex((occurrence) => occurrence.id === id)
    if (index < 0) return false
    project.value.tableOccurrences.splice(index, 1)
    project.value.canvasState.selectedOccurrenceIds = project.value.canvasState.selectedOccurrenceIds.filter((selectedId) => selectedId !== id)
    touch()
    revalidate()
    return true
  }

  function toggleOccurrenceCollapsed(id: string) {
    featureAccess.require('tableOccurrenceCanvas')
    const occurrence = project.value?.tableOccurrences.find((candidate) => candidate.id === id)
    if (!occurrence) return false
    occurrence.collapsed = !occurrence.collapsed
    touch()
    return true
  }

  function selectOccurrence(id: string | null, additive = false) {
    const canvas = project.value?.canvasState
    if (!canvas) return
    if (!id) canvas.selectedOccurrenceIds = []
    else if (additive) {
      canvas.selectedOccurrenceIds = canvas.selectedOccurrenceIds.includes(id)
        ? canvas.selectedOccurrenceIds.filter((candidate) => candidate !== id)
        : [...canvas.selectedOccurrenceIds, id]
    } else canvas.selectedOccurrenceIds = [id]
    canvas.selectedRelationshipId = null
  }

  function selectOccurrences(ids: string[]) {
    const canvas = project.value?.canvasState
    if (!canvas) return
    const validIds = new Set(project.value?.tableOccurrences.map((occurrence) => occurrence.id) ?? [])
    canvas.selectedOccurrenceIds = [...new Set(ids)].filter((id) => validIds.has(id))
    canvas.selectedRelationshipId = null
  }

  function selectRelationship(id: string | null) {
    const canvas = project.value?.canvasState
    if (!canvas) return
    canvas.selectedRelationshipId = id
    canvas.selectedOccurrenceIds = []
  }

  function updateRelationship(id: string, changes: Partial<DesignRelationship>) {
    featureAccess.require('relationshipInspector')
    const index = project.value?.relationships.findIndex((candidate) => candidate.id === id) ?? -1
    if (!project.value || index < 0) return false
    project.value.relationships[index] = { ...project.value.relationships[index], ...changes, id }
    touch()
    revalidate()
    return true
  }

  function createRelationship(relationship: DesignRelationship) {
    featureAccess.require('relationshipInspector')
    if (!project.value || project.value.relationships.some((candidate) => candidate.id === relationship.id)) return false
    project.value.relationships.push(structuredClone(relationship))
    project.value.canvasState.selectedRelationshipId = relationship.id
    project.value.canvasState.selectedOccurrenceIds = []
    touch()
    revalidate()
    return true
  }

  function deleteRelationship(id: string) {
    featureAccess.require('relationshipInspector')
    if (!project.value) return false
    const index = project.value.relationships.findIndex((candidate) => candidate.id === id)
    if (index < 0) return false
    project.value.relationships.splice(index, 1)
    if (project.value.canvasState.selectedRelationshipId === id) {
      project.value.canvasState.selectedRelationshipId = null
    }
    touch()
    revalidate()
    return true
  }

  function setViewport(zoom: number, panX: number, panY: number) {
    const canvas = project.value?.canvasState
    if (!canvas || !Number.isFinite(zoom) || zoom <= 0 || !Number.isFinite(panX) || !Number.isFinite(panY)) return
    canvas.zoom = zoom
    canvas.pan = { x: panX, y: panY }
    touch()
  }

  function createSnapshot(): DesignProjectSnapshot | null {
    featureAccess.require('projectSnapshot')
    if (!project.value) return null
    return {
      snapshotVersion: SNAPSHOT_VERSION,
      savedAt: new Date().toISOString(),
      project: structuredClone(project.value),
    }
  }

  function restoreSnapshot(snapshot: DesignProjectSnapshot): DesignParseResult {
    featureAccess.require('projectSnapshot')
    const result = parseAiDesign({ project: snapshot.project, modelVersion: snapshot.project.modelVersion })
    validation.value = result.validation
    if (result.project) {
      project.value = result.project
      project.value.componentCards = generateComponentCards(project.value)
      validation.value = validateDesignProject(project.value)
      sourceJson.value = ''
      dirty.value = false
    }
    return result
  }

  function markSaved() { dirty.value = false }

  function touch() {
    if (project.value) project.value.updatedAt = new Date().toISOString()
    dirty.value = true
  }

  return {
    project,
    validation,
    dirty,
    sourceJson,
    lastProposalSnapshot,
    selectedOccurrence,
    selectedRelationship,
    selectedComponentCardId,
    selectedComponentCard,
    newProject,
    loadAiDesign,
    previewAiDesign,
    applyAiProposal,
    undoLastAiProposal,
    revalidate,
    regenerateComponentCards,
    addComponentCardsFromAiResponse,
    selectComponentCard,
    validateCard,
    applyComponentCardValidation,
    updateComponentCard,
    replaceComponentCardXml,
    setComponentCardStatus,
    moveOccurrence,
    moveOccurrences,
    resizeOccurrence,
    renameOccurrence,
    createOccurrence,
    deleteOccurrence,
    toggleOccurrenceCollapsed,
    selectOccurrence,
    selectOccurrences,
    selectRelationship,
    updateRelationship,
    createRelationship,
    deleteRelationship,
    setViewport,
    createSnapshot,
    restoreSnapshot,
    markSaved,
  }
})
