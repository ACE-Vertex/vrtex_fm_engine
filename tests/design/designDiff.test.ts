import { describe, expect, it } from 'vitest'
import { diffDesignProjects } from '../../src/domain/design/designDiff'
import { createEmptyDesignProject } from '../../src/domain/design/designParser'

describe('AI design proposal diff', () => {
  it('marks additions, edits, and deletions including destructive proposals', () => {
    const current = createEmptyDesignProject('Before')
    current.tables = [
      { id: 'keep', name: 'Keep', description: '', fields: [] },
      { id: 'delete', name: 'Delete', description: '', fields: [] },
    ]
    const proposed = structuredClone(current)
    proposed.tables = [
      { id: 'keep', name: 'Changed', description: '', fields: [] },
      { id: 'add', name: 'Add', description: '', fields: [] },
    ]
    const diff = diffDesignProjects(current, proposed)
    expect(diff.tables).toEqual({ added: ['add'], changed: ['keep'], deleted: ['delete'] })
    expect(diff.hasDestructiveChanges).toBe(true)
  })
})
