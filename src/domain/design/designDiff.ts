import type { DesignProject } from '../../types/design'

export interface DesignEntityDiff {
  added: string[]
  changed: string[]
  deleted: string[]
}

export interface DesignProjectDiff {
  tables: DesignEntityDiff
  occurrences: DesignEntityDiff
  relationships: DesignEntityDiff
  valueLists: DesignEntityDiff
  scripts: DesignEntityDiff
  layouts: DesignEntityDiff
  hasDestructiveChanges: boolean
}

export function diffDesignProjects(current: DesignProject, proposed: DesignProject): DesignProjectDiff {
  const result = {
    tables: diffEntities(current.tables, proposed.tables),
    occurrences: diffEntities(current.tableOccurrences, proposed.tableOccurrences),
    relationships: diffEntities(current.relationships, proposed.relationships),
    valueLists: diffEntities(current.valueLists, proposed.valueLists),
    scripts: diffEntities(current.scripts, proposed.scripts),
    layouts: diffEntities(current.layouts, proposed.layouts),
  }
  return {
    ...result,
    hasDestructiveChanges: Object.values(result).some((change) => change.deleted.length > 0),
  }
}

function diffEntities<T extends { id: string }>(current: T[], proposed: T[]): DesignEntityDiff {
  const before = new Map(current.map((entity) => [entity.id, entity]))
  const after = new Map(proposed.map((entity) => [entity.id, entity]))
  return {
    added: proposed.filter((entity) => !before.has(entity.id)).map((entity) => entity.id),
    changed: proposed
      .filter((entity) => before.has(entity.id) && stableJson(before.get(entity.id)) !== stableJson(entity))
      .map((entity) => entity.id),
    deleted: current.filter((entity) => !after.has(entity.id)).map((entity) => entity.id),
  }
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
