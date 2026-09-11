import { describe, expect, it } from 'vitest'
import { analyzeDesignGraph, findDependencyCycles } from '../../src/domain/design/graphAnalyzer'
import { createEmptyDesignProject } from '../../src/domain/design/designParser'

describe('relationship graph analyzer', () => {
  it('finds isolated nodes, disconnected groups, cycles, and duplicates', () => {
    const project = createEmptyDesignProject('Graph')
    project.tableOccurrences = ['a', 'b', 'c', 'd'].map((id, index) => ({
      id, name: id, baseTableId: 'table', x: index * 100, y: 0, width: 200, collapsed: false,
    }))
    const relation = (id: string, left: string, right: string) => ({
      id, leftOccurrenceId: left, leftFieldId: 'field', operator: 'equal' as const,
      rightOccurrenceId: right, rightFieldId: 'field', allowCreateLeft: false,
      allowCreateRight: false, deleteRelatedLeft: false, deleteRelatedRight: false,
      sortRelatedLeft: false, sortRelatedRight: false,
    })
    project.relationships = [relation('ab', 'a', 'b'), relation('bc', 'b', 'c'), relation('ca', 'c', 'a'), relation('ab-copy', 'a', 'b')]
    const analysis = analyzeDesignGraph(project)
    expect(analysis.isolatedOccurrenceIds).toEqual(['d'])
    expect(analysis.components).toHaveLength(2)
    expect(analysis.cycles.length).toBeGreaterThan(0)
    expect(analysis.duplicateRelationshipIds).toEqual(['ab-copy'])
  })

  it('reports component dependency cycles explicitly', () => {
    expect(findDependencyCycles([
      { id: 'a', dependencies: ['b'] },
      { id: 'b', dependencies: ['c'] },
      { id: 'c', dependencies: ['a'] },
    ])).toEqual([['a', 'b', 'c', 'a']])
  })
})
