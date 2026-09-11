import { onBeforeUnmount, watch } from 'vue'
import { useQuasar } from 'quasar'
import { clipboardGateway } from '../services/clipboardGateway'
import { isTauriRuntime, nativeGateway } from '../services/nativeGateway'
import { useClipboardStore } from '../stores/clipboard'
import { useLocaleStore } from '../stores/locale'
import { useSettingsStore } from '../stores/settings'
import { useCollectionWorkspaceStore } from '../stores/collectionWorkspace'
import { clipboardItemName } from '../utils/clipboardItemNaming'

const POLLING_INTERVAL_MS = 1_500

function isClipboardUnavailable(error: unknown) {
  return /not available|no registered Mac-XM|OpenClipboard/i.test(String(error))
}

export function useClipboardMonitor() {
  const $q = useQuasar()
  const clipboard = useClipboardStore()
  const locale = useLocaleStore()
  const settings = useSettingsStore()
  const collectionWorkspace = useCollectionWorkspaceStore()
  let timer: number | undefined
  let polling = false
  let lastFingerprint = ''
  let lastError = ''

  function stop() {
    window.clearTimeout(timer)
    timer = undefined
  }

  function schedule() {
    stop()
    if (settings.polling && isTauriRuntime()) {
      timer = window.setTimeout(poll, POLLING_INTERVAL_MS)
    }
  }

  async function poll() {
    if (polling || !settings.polling || !isTauriRuntime()) {
      schedule()
      return
    }

    polling = true
    try {
      const payload = await clipboardGateway.get()
      const fingerprint = `${payload.windowsFormat}\u0000${payload.xml}`
      if (fingerprint === lastFingerprint) return

      const detected = await nativeGateway.detectFormat(payload.xml)
      const format = detected.format === 'UNKNOWN' ? payload.format : detected.format
      const saved = await clipboard.upsert({
        name: clipboardItemName(
          payload.xml,
          detected.objectType,
          [...clipboard.items, ...clipboard.libraryItems],
        ),
        format,
        windowsFormat: payload.windowsFormat,
        objectType: detected.objectType,
        xml: payload.xml,
        notes: '',
        favorite: false,
        inLibrary: false,
      }, { select: false })
      await collectionWorkspace.assignItemToProject(saved.id)

      lastFingerprint = fingerprint
      lastError = ''
      $q.notify({
        position: 'bottom',
        timeout: 2600,
        progress: true,
        icon: 'content_paste_go',
        iconColor: 'light-blue-4',
        textColor: 'white',
        message: locale.t('clipboardGetComplete'),
        caption: `${saved.name} · ${saved.format} · ${payload.rawSize.toLocaleString()} bytes`,
        classes: 'vertex-transfer-notification transfer-success',
      })
    } catch (error) {
      if (!isClipboardUnavailable(error)) {
        const message = String(error)
        if (message !== lastError) {
          lastError = message
          $q.notify({
            position: 'bottom',
            timeout: 4800,
            progress: true,
            icon: 'error_outline',
            iconColor: 'red-4',
            textColor: 'white',
            message: locale.t('clipboardGetFailed'),
            caption: message,
            classes: 'vertex-transfer-notification transfer-error',
          })
        }
      }
    } finally {
      polling = false
      schedule()
    }
  }

  const stopWatching = watch(
    () => settings.polling,
    (enabled) => {
      stop()
      lastError = ''
      if (enabled) schedule()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    stop()
    stopWatching()
  })
}
