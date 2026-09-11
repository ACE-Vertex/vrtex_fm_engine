import { invoke } from '@tauri-apps/api/core'
import { isTauriRuntime } from './nativeGateway'
import type { KnowledgePack, SaveKnowledgePackInput } from '../types/knowledge'
import { featureAccess } from './featureAccess'

const STORAGE_KEY = 'vertex.knowledgePacks'
const OFFICIAL_PACK_IDS = new Set([
  'filemaker-xml-core', 'fmxmlsnippet-core', 'table-definition', 'field-definition',
  'script-rules', 'script-step-rules', 'calculation-rules', 'naming-rules',
  'vertex-validation-rules', 'relationship-design-rules',
])

const loadFallback = (): KnowledgePack[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as KnowledgePack[]
  } catch {
    return []
  }
}

const saveFallback = (packs: KnowledgePack[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs))
}

export const knowledgeGateway = {
  async list(enabledOnly = false, limit = 500): Promise<KnowledgePack[]> {
    featureAccess.require('fileMakerKnowledgeBase')
    if (isTauriRuntime()) {
      return invoke<KnowledgePack[]>('list_knowledge_packs', { enabledOnly, limit })
    }
    return loadFallback()
      .filter((pack) => !enabledOnly || pack.enabled)
      .sort((left, right) => right.priority - left.priority || left.name.localeCompare(right.name))
      .slice(0, limit)
  },

  async load(id: string): Promise<KnowledgePack | null> {
    featureAccess.require('fileMakerKnowledgeBase')
    if (isTauriRuntime()) return invoke<KnowledgePack | null>('load_knowledge_pack', { id })
    return loadFallback().find((pack) => pack.id === id) ?? null
  },

  async save(pack: SaveKnowledgePackInput): Promise<KnowledgePack> {
    featureAccess.require('knowledgePackBuilder')
    if (pack.id && OFFICIAL_PACK_IDS.has(pack.id)) {
      throw new Error('Official Knowledge Packは複製して編集してください')
    }
    if (isTauriRuntime()) return invoke<KnowledgePack>('save_knowledge_pack', { pack })
    const packs = loadFallback()
    const saved: KnowledgePack = {
      ...pack,
      id: pack.id ?? crypto.randomUUID(),
      updatedAt: new Date().toISOString(),
    }
    const index = packs.findIndex((candidate) => candidate.id === saved.id)
    if (index >= 0) packs[index] = saved
    else packs.push(saved)
    saveFallback(packs)
    return saved
  },

  async delete(id: string): Promise<boolean> {
    featureAccess.require('knowledgePackBuilder')
    if (OFFICIAL_PACK_IDS.has(id)) throw new Error('Official Knowledge Packは削除できません')
    if (isTauriRuntime()) return invoke<boolean>('delete_knowledge_pack', { id })
    const packs = loadFallback()
    const next = packs.filter((pack) => pack.id !== id)
    saveFallback(next)
    return next.length !== packs.length
  },
}
