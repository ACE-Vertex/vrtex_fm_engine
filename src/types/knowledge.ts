export interface KnowledgePack {
  id: string
  name: string
  version: string
  description: string
  category: string
  applicableTaskTypes: string[]
  rules: string[]
  examples: string[]
  antiPatterns: string[]
  validationHints: string[]
  priority: number
  enabled: boolean
  updatedAt: string
}

export interface SaveKnowledgePackInput {
  id?: string
  name: string
  version: string
  description: string
  category: string
  applicableTaskTypes: string[]
  rules: string[]
  examples: string[]
  antiPatterns: string[]
  validationHints: string[]
  priority: number
  enabled: boolean
}
