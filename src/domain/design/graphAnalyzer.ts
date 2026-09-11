import type { DesignProject, DesignRelationship } from '../../types/design'

export interface DesignGraphAnalysis {
  isolatedOccurrenceIds: string[]
  components: string[][]
  cycles: string[][]
  duplicateRelationshipIds: string[]
}

export function analyzeDesignGraph(project: DesignProject): DesignGraphAnalysis {
  const occurrenceIds = new Set(project.tableOccurrences.map((occurrence) => occurrence.id))
  const adjacency = new Map([...occurrenceIds].map((id) => [id, new Set<string>()]))
  const duplicateRelationshipIds: string[] = []
  const relationshipKeys = new Map<string, string>()

  for (const relationship of project.relationships) {
    if (occurrenceIds.has(relationship.leftOccurrenceId) && occurrenceIds.has(relationship.rightOccurrenceId)) {
      adjacency.get(relationship.leftOccurrenceId)?.add(relationship.rightOccurrenceId)
      adjacency.get(relationship.rightOccurrenceId)?.add(relationship.leftOccurrenceId)
    }
    const key = relationshipKey(relationship)
    if (relationshipKeys.has(key)) duplicateRelationshipIds.push(relationship.id)
    else relationshipKeys.set(key, relationship.id)
  }

  const isolatedOccurrenceIds = [...adjacency]
    .filter(([, neighbors]) => neighbors.size === 0)
    .map(([id]) => id)
  const components: string[][] = []
  const visited = new Set<string>()
  for (const id of occurrenceIds) {
    if (visited.has(id)) continue
    const component: string[] = []
    const queue = [id]
    visited.add(id)
    while (queue.length) {
      const current = queue.shift()!
      component.push(current)
      for (const neighbor of adjacency.get(current) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
    components.push(component)
  }

  return {
    isolatedOccurrenceIds,
    components,
    cycles: findUndirectedCycles(adjacency),
    duplicateRelationshipIds,
  }
}

export function findDependencyCycles(nodes: Array<{ id: string; dependencies: string[] }>): string[][] {
  const knownIds = new Set(nodes.map((node) => node.id))
  const dependencies = new Map(nodes.map((node) => [
    node.id,
    node.dependencies.filter((id) => knownIds.has(id)),
  ]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const stack: string[] = []
  const cycles = new Map<string, string[]>()

  function visit(id: string) {
    if (visited.has(id)) return
    if (visiting.has(id)) {
      const start = stack.indexOf(id)
      const cycle = [...stack.slice(start), id]
      cycles.set(canonicalCycle(cycle), cycle)
      return
    }
    visiting.add(id)
    stack.push(id)
    for (const dependency of dependencies.get(id) ?? []) visit(dependency)
    stack.pop()
    visiting.delete(id)
    visited.add(id)
  }

  for (const node of nodes) visit(node.id)
  return [...cycles.values()]
}

function relationshipKey(relationship: DesignRelationship) {
  const left = `${relationship.leftOccurrenceId}:${relationship.leftFieldId}`
  const right = `${relationship.rightOccurrenceId}:${relationship.rightFieldId}`
  return [left, relationship.operator, right].join('|')
}

function findUndirectedCycles(adjacency: Map<string, Set<string>>) {
  const visited = new Set<string>()
  const stack: string[] = []
  const cycles = new Map<string, string[]>()

  function visit(id: string, parent: string | null) {
    visited.add(id)
    stack.push(id)
    for (const neighbor of adjacency.get(id) ?? []) {
      if (neighbor === parent) continue
      if (!visited.has(neighbor)) visit(neighbor, id)
      else {
        const start = stack.indexOf(neighbor)
        if (start >= 0) {
          const cycle = [...stack.slice(start), neighbor]
          if (cycle.length > 3) cycles.set(canonicalCycle(cycle), cycle)
        }
      }
    }
    stack.pop()
  }

  for (const id of adjacency.keys()) if (!visited.has(id)) visit(id, null)
  return [...cycles.values()]
}

function canonicalCycle(cycle: string[]) {
  const open = cycle.slice(0, -1)
  if (!open.length) return ''
  const rotations = [open, [...open].reverse()].flatMap((items) =>
    items.map((_, index) => [...items.slice(index), ...items.slice(0, index)].join('|')),
  )
  return rotations.sort()[0] ?? ''
}
