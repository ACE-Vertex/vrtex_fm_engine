import { ref } from 'vue'
import { defineStore } from 'pinia'

export type WorkspaceMode = 'clipboard' | 'codex' | 'knowledge' | 'relationship' | 'library' | 'collections' | 'tools' | 'settings' | 'docs'

export const useNavigationStore = defineStore('navigation', () => {
  const active = ref<WorkspaceMode>('clipboard')

  function setActive(mode: WorkspaceMode) {
    active.value = mode
  }

  return { active, setActive }
})
