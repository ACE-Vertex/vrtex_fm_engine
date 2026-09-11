import { describe, expect, it } from 'vitest'
import { relationshipDesignSample } from '../../src/data/relationshipDesignSample'
import { parseAiDesign } from '../../src/domain/design/designParser'

describe('AI Design schema and parser', () => {
  it('accepts the bundled relationship design contract', () => {
    const result = parseAiDesign(relationshipDesignSample)
    expect(result.project?.name).toBe('診療管理システム')
    expect(result.validation.valid).toBe(true)
  })

  it('rejects malformed AI output before tolerant conversion', () => {
    const result = parseAiDesign({ project: { name: 'Broken' }, tables: [{ id: 't', name: 'Table' }] })
    expect(result.project).toBeNull()
    expect(result.validation.errors.some((issue) => issue.code === 'AI_SCHEMA_REQUIRED')).toBe(true)
  })

  it('rejects prose instead of JSON', () => {
    const result = parseAiDesign('Here is your design')
    expect(result.project).toBeNull()
    expect(result.validation.errors[0]?.code).toBe('AI_DESIGN_JSON_PARSE')
  })
})
