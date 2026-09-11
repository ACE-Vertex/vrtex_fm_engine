import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { isTauriRuntime, nativeGateway } from '../services/nativeGateway'
import type { CollectionNode } from '../types/library'

export function createDefaultCollection(): CollectionNode {
  return { id: 'default', name: 'Default', count: 0, children: [] }
}

export const useLibraryStore = defineStore('library', () => {
  const storedCollections = localStorage.getItem('vertex.collections')
  let initialCollections: CollectionNode[] = [createDefaultCollection()]
  if (storedCollections !== null) {
    try {
      const parsed = JSON.parse(storedCollections)
      initialCollections = Array.isArray(parsed) && parsed.length > 0
        ? parsed
        : [createDefaultCollection()]
    } catch {
      initialCollections = [createDefaultCollection()]
    }
  }
  const collections = ref(initialCollections)
  const selectedCollectionId = ref<string | null>(null)
  const initialized = ref(false)

  async function initialize() {
    if (initialized.value) return
    if (isTauriRuntime()) {
      const stored = [...collections.value]
      const databaseCollections = await nativeGateway.listCollections()
      if (databaseCollections.length > 0) {
        collections.value = databaseCollections.map((collection) => ({
          id: collection.id,
          name: collection.name,
          count: collection.count,
          children: [],
        }))
      } else {
        const migrationSource = stored.length > 0 ? stored : [createDefaultCollection()]
        for (const collection of migrationSource) {
          await nativeGateway.saveCollection({
            id: collection.id,
            name: collection.name,
            parentId: null,
            count: collection.count,
          })
        }
        collections.value = migrationSource
      }
    }
    if (collections.value.length === 0) collections.value = [createDefaultCollection()]
    initialized.value = true
  }

  async function saveCollection(collection: CollectionNode) {
    if (isTauriRuntime()) {
      await nativeGateway.saveCollection({
        id: collection.id,
        name: collection.name,
        parentId: null,
        count: collection.count,
      })
    }
    const index = collections.value.findIndex((candidate) => candidate.id === collection.id)
    if (index >= 0) collections.value[index] = collection
    else collections.value.push(collection)
    return collection
  }

  async function deleteCollection(id: string, fallbackId?: string) {
    if (isTauriRuntime()) await nativeGateway.deleteCollection(id, fallbackId)
    collections.value = collections.value.filter((collection) => collection.id !== id)
  }

  async function clearCollections() {
    const defaultCollection = createDefaultCollection()
    collections.value = [defaultCollection]
    selectedCollectionId.value = defaultCollection.id
    if (isTauriRuntime()) {
      await nativeGateway.saveCollection({ id: defaultCollection.id, name: defaultCollection.name, parentId: null, count: 0 })
    }
  }

  watch(collections, (value) => localStorage.setItem('vertex.collections', JSON.stringify(value)), { deep: true })

  return { collections, selectedCollectionId, initialized, initialize, saveCollection, deleteCollection, clearCollections }
})
