import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { sampleHistory } from '../data/sample'
import { isTauriRuntime, nativeGateway, type NativeClipboardItem, type SaveClipboardItemInput } from '../services/nativeGateway'
import type { ClipboardItem } from '../types/clipboard'

export const useClipboardStore = defineStore('clipboard', () => {
  const historyOrderKey = 'vertex.historyOrder'

  const loadItems = (key: string) => {
    const stored = localStorage.getItem(key)
    if (stored === null) return sampleHistory.map((item) => ({ ...item, tags: [...item.tags] }))
    try {
      return JSON.parse(stored) as ClipboardItem[]
    } catch {
      return sampleHistory.map((item) => ({ ...item, tags: [...item.tags] }))
    }
  }

  const loadHistoryOrder = () => {
    try {
      return JSON.parse(localStorage.getItem(historyOrderKey) ?? '[]') as string[]
    } catch {
      return []
    }
  }

  const applyHistoryOrder = (source: ClipboardItem[]) => {
    const positions = new Map(loadHistoryOrder().map((id, index) => [id, index]))
    return source
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        const leftPosition = positions.get(left.item.id)
        const rightPosition = positions.get(right.item.id)
        if (leftPosition === undefined && rightPosition === undefined) return left.index - right.index
        if (leftPosition === undefined) return -1
        if (rightPosition === undefined) return 1
        return leftPosition - rightPosition
      })
      .map(({ item }) => item)
  }

  const items = ref<ClipboardItem[]>(isTauriRuntime() ? [] : applyHistoryOrder(loadItems('vertex.clipboardItems')))
  const libraryItems = ref<ClipboardItem[]>(isTauriRuntime() ? [] : loadItems('vertex.libraryItems'))
  const selectedId = ref(items.value[0]?.id ?? '')
  const filter = ref('')
  const autoSave = ref(true)
  const initialized = ref(false)
  const loading = ref(false)
  const lastError = ref('')
  let notesTimer: number | undefined

  const selectedItem = computed(() => items.value.find((item) => item.id === selectedId.value) ?? null)
  const favorites = computed(() => items.value.filter((item) => item.favorite))
  const filteredItems = computed(() => {
    const historyItems = items.value.filter((item) => item.inHistory)
    const query = filter.value.trim().toLocaleLowerCase()
    if (!query) return historyItems
    return historyItems.filter((item) =>
      [item.name, item.format, item.objectType, ...item.tags].some((value) =>
        value.toLocaleLowerCase().includes(query),
      ),
    )
  })

  function select(id: string) {
    selectedId.value = id
  }

  function fromNative(item: NativeClipboardItem): ClipboardItem {
    return { ...item, tags: [] }
  }

  async function initialize() {
    if (initialized.value || loading.value) return
    loading.value = true
    lastError.value = ''
    try {
      if (isTauriRuntime()) {
        const [history, library, itemTags] = await Promise.all([
          nativeGateway.listHistory(),
          nativeGateway.listLibrary(),
          nativeGateway.listTags(),
        ])
        const tagsByItem = new Map(itemTags.map((entry) => [entry.clipboardItemId, entry.tags]))
        items.value = applyHistoryOrder(history.map((item) => ({ ...fromNative(item), tags: tagsByItem.get(item.id) ?? [] })))
        libraryItems.value = library.map((item) => ({ ...fromNative(item), tags: tagsByItem.get(item.id) ?? [] }))
      }
      selectedId.value = selectedId.value || items.value[0]?.id || ''
      initialized.value = true
    } catch (error) {
      lastError.value = String(error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function upsert(
    input: SaveClipboardItemInput,
    options: { select?: boolean } = {},
  ) {
    const shouldSelect = options.select ?? true
    if (!isTauriRuntime()) {
      const now = new Date().toISOString()
      const fallback: ClipboardItem = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        favorite: input.favorite ?? false,
        inHistory: input.inHistory ?? true,
        notes: input.notes ?? '',
        tags: [],
      }
      const index = items.value.findIndex((item) => item.id === fallback.id)
      if (index >= 0) items.value[index] = fallback
      else items.value.unshift(fallback)
      if (input.inLibrary) {
        const libraryIndex = libraryItems.value.findIndex((item) => item.id === fallback.id)
        if (libraryIndex >= 0) libraryItems.value[libraryIndex] = { ...fallback, tags: [...fallback.tags] }
        else libraryItems.value.unshift({ ...fallback, tags: [...fallback.tags] })
      }
      if (shouldSelect) selectedId.value = fallback.id
      return fallback
    }
    const existingTags = input.id
      ? items.value.find((item) => item.id === input.id)?.tags
        ?? libraryItems.value.find((item) => item.id === input.id)?.tags
        ?? []
      : []
    const saved = { ...fromNative(await nativeGateway.saveItem(input)), tags: [...existingTags] }
    const index = items.value.findIndex((item) => item.id === saved.id)
    if (index >= 0) items.value[index] = saved
    else items.value.unshift(saved)
    const libraryIndex = libraryItems.value.findIndex((item) => item.id === saved.id)
    if (saved.inLibrary) {
      if (libraryIndex >= 0) libraryItems.value[libraryIndex] = { ...saved, tags: [...saved.tags] }
      else libraryItems.value.unshift({ ...saved, tags: [...saved.tags] })
    } else if (libraryIndex >= 0) {
      libraryItems.value.splice(libraryIndex, 1)
    }
    if (shouldSelect) selectedId.value = saved.id
    return saved
  }

  async function toggleFavorite(id = selectedId.value) {
    const item = items.value.find((candidate) => candidate.id === id)
      ?? libraryItems.value.find((candidate) => candidate.id === id)
    if (!item) return
    const wasInItems = items.value.some((candidate) => candidate.id === id)
    const favorite = !item.favorite
    for (const candidate of [...items.value, ...libraryItems.value]) {
      if (candidate.id === id) candidate.favorite = favorite
    }
    if (favorite && !wasInItems) {
      items.value.unshift({ ...item, favorite: true, tags: [...item.tags] })
    }
    if (isTauriRuntime()) {
      try {
        await nativeGateway.updateFavorite(id, favorite)
      } catch (error) {
        for (const candidate of [...items.value, ...libraryItems.value]) {
          if (candidate.id === id) candidate.favorite = !favorite
        }
        if (!wasInItems) items.value = items.value.filter((candidate) => candidate.id !== id)
        lastError.value = String(error)
        throw error
      }
    }
    if (!favorite) {
      items.value = items.value.filter((candidate) => candidate.id !== id || candidate.inHistory)
      if (!items.value.some((candidate) => candidate.id === selectedId.value)) selectedId.value = ''
    }
  }

  function updateNotes(notes: string) {
    if (selectedItem.value) selectedItem.value.notes = notes
    if (!isTauriRuntime() || !selectedItem.value) return
    window.clearTimeout(notesTimer)
    const id = selectedItem.value.id
    notesTimer = window.setTimeout(() => {
      void nativeGateway.updateNotes(id, notes).catch((error) => { lastError.value = String(error) })
    }, 450)
  }

  async function updateTags(id: string, tags: string[]) {
    const normalized = [...new Map(tags.map((tag) => [tag.trim().toLocaleLowerCase(), tag.trim()])).values()]
      .filter(Boolean)
    const savedTags = isTauriRuntime() ? await nativeGateway.setTags(id, normalized) : normalized
    for (const item of [...items.value, ...libraryItems.value]) {
      if (item.id === id) item.tags = [...savedTags]
    }
    return savedTags
  }

  async function clearLibrary() {
    if (isTauriRuntime()) await nativeGateway.clearLibrary()
    libraryItems.value = []
    for (const item of items.value) item.inLibrary = false
    items.value = items.value.filter((item) => item.inHistory || item.favorite)
  }

  async function clearClipboard() {
    if (isTauriRuntime()) await nativeGateway.clearClipboard()
    items.value = items.value
      .filter((item) => item.favorite)
      .map((item) => ({ ...item, inHistory: false }))
    for (const item of libraryItems.value) item.inHistory = false
    if (!items.value.some((item) => item.id === selectedId.value)) selectedId.value = ''
    filter.value = ''
    localStorage.removeItem(historyOrderKey)
  }

  async function removeFromHistory(id: string) {
    const item = items.value.find((candidate) => candidate.id === id)
    if (!item || !item.inHistory) return
    const shouldPreserve = item.favorite || item.inLibrary

    if (isTauriRuntime()) {
      if (shouldPreserve) {
        await nativeGateway.saveItem({
          id: item.id,
          name: item.name,
          format: item.format,
          windowsFormat: item.windowsFormat,
          objectType: item.objectType,
          xml: item.xml,
          notes: item.notes,
          favorite: item.favorite,
          inLibrary: item.inLibrary,
          inHistory: false,
        })
      } else {
        await nativeGateway.deleteItem(id)
      }
    }

    const libraryItem = libraryItems.value.find((candidate) => candidate.id === id)
    if (libraryItem) libraryItem.inHistory = false
    if (item.favorite) item.inHistory = false
    else items.value = items.value.filter((candidate) => candidate.id !== id)
    if (!items.value.some((candidate) => candidate.id === selectedId.value && candidate.inHistory)) {
      selectedId.value = items.value.find((candidate) => candidate.inHistory)?.id ?? ''
    }
  }

  async function clearAll() {
    if (isTauriRuntime()) await nativeGateway.clearAll()
    libraryItems.value = []
    items.value = []
    selectedId.value = ''
    filter.value = ''
    localStorage.removeItem(historyOrderKey)
  }

  watch(items, (value) => {
    if (!isTauriRuntime()) localStorage.setItem('vertex.clipboardItems', JSON.stringify(value))
    localStorage.setItem(historyOrderKey, JSON.stringify(value.filter((item) => item.inHistory).map((item) => item.id)))
  }, { deep: true })
  watch(libraryItems, (value) => {
    if (!isTauriRuntime()) localStorage.setItem('vertex.libraryItems', JSON.stringify(value))
  }, { deep: true })

  return {
    items,
    libraryItems,
    selectedId,
    filter,
    autoSave,
    initialized,
    loading,
    lastError,
    selectedItem,
    favorites,
    filteredItems,
    select,
    initialize,
    upsert,
    toggleFavorite,
    updateNotes,
    updateTags,
    removeFromHistory,
    clearLibrary,
    clearClipboard,
    clearAll,
  }
})
