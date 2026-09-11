import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useLibraryStore } from './library'
import { isTauriRuntime, nativeGateway } from '../services/nativeGateway'
import type { ClipboardItem } from '../types/clipboard'

export type CollectionCategoryId =
  | 'all'
  | 'scripts'
  | 'steps'
  | 'tables'
  | 'fields'
  | 'layoutObjects'
  | 'valueLists'
  | 'customFunctions'
  | 'themes'
  | 'other'

export interface CollectionCategory {
  id: CollectionCategoryId
  icon: string
  labelJa: string
  labelEn: string
  formats: string[]
}

export const collectionCategories: CollectionCategory[] = [
  { id: 'all', icon: 'inventory_2', labelJa: 'すべて', labelEn: 'All Items', formats: [] },
  { id: 'scripts', icon: 'description', labelJa: 'スクリプト', labelEn: 'Scripts', formats: ['XMSC'] },
  { id: 'steps', icon: 'format_list_numbered', labelJa: 'ステップ', labelEn: 'Steps', formats: ['XMSS'] },
  { id: 'tables', icon: 'table_chart', labelJa: 'テーブル', labelEn: 'Tables', formats: ['XMTB'] },
  { id: 'fields', icon: 'view_week', labelJa: 'フィールド', labelEn: 'Fields', formats: ['XMFD'] },
  { id: 'layoutObjects', icon: 'dashboard_customize', labelJa: 'レイアウトオブジェクト', labelEn: 'Layout Objects', formats: ['XML2'] },
  { id: 'valueLists', icon: 'list_alt', labelJa: '値一覧', labelEn: 'Value Lists', formats: ['XMVL'] },
  { id: 'customFunctions', icon: 'functions', labelJa: 'カスタム関数', labelEn: 'Custom Functions', formats: ['XMFN'] },
  { id: 'themes', icon: 'palette', labelJa: 'テーマ', labelEn: 'Themes', formats: ['XMTH'] },
  { id: 'other', icon: 'folder_special', labelJa: 'その他', labelEn: 'Other', formats: [] },
]

export function collectionCategoryForItem(item: ClipboardItem): CollectionCategoryId {
  const format = item.format.toUpperCase()
  const matched = collectionCategories.find(
    (category) => category.id !== 'all' && category.id !== 'other' && category.formats.includes(format),
  )
  if (matched) return matched.id
  if (/VALUE\s*LIST|値一覧/i.test(item.objectType)) return 'valueLists'
  return 'other'
}

export const useCollectionWorkspaceStore = defineStore('collectionWorkspace', () => {
  const library = useLibraryStore()
  const storedProject = localStorage.getItem('vertex.selectedCollectionProject')
  const storedCategory = localStorage.getItem('vertex.selectedCollectionCategory') as CollectionCategoryId | null
  const storedAssignments = localStorage.getItem('vertex.collectionAssignments')
  const initialProjectId = storedProject && library.collections.some((collection) => collection.id === storedProject)
    ? storedProject
    : library.collections[0]?.id ?? null

  const selectedProjectId = ref<string | null>(initialProjectId)
  const selectedCategoryId = ref<CollectionCategoryId>(
    collectionCategories.some((category) => category.id === storedCategory)
      ? storedCategory as CollectionCategoryId
      : 'all',
  )
  const itemProjectIds = ref<Record<string, string>>({})
  const initialized = ref(false)
  try {
    const parsed = storedAssignments ? JSON.parse(storedAssignments) : {}
    itemProjectIds.value = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    itemProjectIds.value = {}
  }
  const fallbackProjectId = library.collections[0]?.id ?? ''
  if (fallbackProjectId) {
    for (const [itemId, projectId] of Object.entries(itemProjectIds.value)) {
      if (!library.collections.some((collection) => collection.id === projectId)) {
        itemProjectIds.value[itemId] = fallbackProjectId
      }
    }
  }

  const selectedProject = computed(() =>
    library.collections.find((collection) => collection.id === selectedProjectId.value)
      ?? library.collections[0]
      ?? null,
  )

  function selectProject(id: string) {
    if (library.collections.some((collection) => collection.id === id)) selectedProjectId.value = id
  }

  function selectCategory(id: CollectionCategoryId) {
    if (collectionCategories.some((category) => category.id === id)) selectedCategoryId.value = id
  }

  async function initialize() {
    if (initialized.value) return
    if (isTauriRuntime()) {
      const legacyAssignments = { ...itemProjectIds.value }
      const assignments = await nativeGateway.listCollectionAssignments()
      itemProjectIds.value = Object.fromEntries(
        assignments.map((assignment) => [assignment.clipboardItemId, assignment.collectionId]),
      )
      if (assignments.length === 0) {
        for (const [itemId, projectId] of Object.entries(legacyAssignments)) {
          if (!library.collections.some((collection) => collection.id === projectId)) continue
          try {
            await nativeGateway.assignCollectionItem(projectId, itemId)
            itemProjectIds.value[itemId] = projectId
          } catch {
            // Ignore stale legacy assignments whose Clipboard item no longer exists.
          }
        }
      }
    }
    const activeProject = selectedProjectId.value
    if (!activeProject || !library.collections.some((collection) => collection.id === activeProject)) {
      selectedProjectId.value = library.collections[0]?.id ?? null
    }
    initialized.value = true
  }

  function projectIdForItem(itemId: string) {
    return itemProjectIds.value[itemId] ?? library.collections[0]?.id ?? ''
  }

  async function assignItemToProject(itemId: string, projectId = selectedProject.value?.id ?? '') {
    if (!itemId || !projectId) return
    const previous = itemProjectIds.value[itemId]
    itemProjectIds.value[itemId] = projectId
    try {
      if (isTauriRuntime()) await nativeGateway.assignCollectionItem(projectId, itemId)
    } catch (error) {
      if (previous) itemProjectIds.value[itemId] = previous
      else delete itemProjectIds.value[itemId]
      throw error
    }
  }

  function clear() {
    selectedProjectId.value = library.collections[0]?.id ?? null
    selectedCategoryId.value = 'all'
    itemProjectIds.value = {}
  }

  watch(selectedProjectId, (value) => {
    if (value) localStorage.setItem('vertex.selectedCollectionProject', value)
    else localStorage.removeItem('vertex.selectedCollectionProject')
  })
  watch(selectedCategoryId, (value) => localStorage.setItem('vertex.selectedCollectionCategory', value))
  watch(itemProjectIds, (value) => localStorage.setItem('vertex.collectionAssignments', JSON.stringify(value)), { deep: true })

  return {
    selectedProjectId,
    selectedCategoryId,
    itemProjectIds,
    initialized,
    selectedProject,
    selectProject,
    selectCategory,
    initialize,
    projectIdForItem,
    assignItemToProject,
    clear,
  }
})
