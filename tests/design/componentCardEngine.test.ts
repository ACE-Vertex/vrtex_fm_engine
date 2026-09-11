import { describe, expect, it } from 'vitest'
import {
  ComponentCardDependencyCycleError,
  optimizeComponentCardSequence,
  transitionComponentCard,
} from '../../src/services/componentCardEngine'
import type { ComponentCard } from '../../src/types/design'

function card(id: string, dependencies: string[] = []): ComponentCard {
  return {
    id, projectId: 'p', sequence: 1, title: id, description: '', kind: 'other', status: 'ready',
    executionMode: 'manual', sourceType: 'test', sourceContent: '', sourceIds: [id], dependencies,
    tags: [], validationResult: { valid: true, errors: [], warnings: [] }, elements: ['step'],
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    isRequired: true, isSkipped: false, retryCount: 0, history: [],
  }
}

describe('component card execution safety', () => {
  it('orders dependencies before their consumers', () => {
    const ordered = optimizeComponentCardSequence([card('consumer', ['source']), card('source')])
    expect(ordered.map((item) => item.id)).toEqual(['source', 'consumer'])
  })

  it('throws instead of silently ordering a cycle', () => {
    expect(() => optimizeComponentCardSequence([card('a', ['b']), card('b', ['a'])]))
      .toThrow(ComponentCardDependencyCycleError)
  })

  it('blocks invalid status jumps', () => {
    expect(() => transitionComponentCard(card('a'), 'verified')).toThrow(/Invalid component card status transition/)
  })
})
