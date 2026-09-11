import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type AppThemeId =
  | 'vertex'
  | 'midnight'
  | 'emerald'
  | 'amber'
  | 'crimson'
  | 'graphite'
  | 'pastel-sky'
  | 'pastel-mint'
  | 'pastel-lavender'
  | 'pastel-peach'
  | 'pastel-rose'
  | 'pastel-lemon'

export type AppTheme = {
  id: AppThemeId
  nameJa: string
  nameEn: string
  descriptionJa: string
  descriptionEn: string
  colors: readonly [string, string, string, string]
}

export const appThemes: readonly AppTheme[] = [
  { id: 'vertex', nameJa: 'Vertex ブルー', nameEn: 'Vertex Blue', descriptionJa: '現在の標準配色', descriptionEn: 'Current default palette', colors: ['#070b10', '#111923', '#168cff', '#3ab8ff'] },
  { id: 'midnight', nameJa: 'ミッドナイト', nameEn: 'Midnight', descriptionJa: '深い藍とバイオレット', descriptionEn: 'Deep indigo and violet', colors: ['#080810', '#18182a', '#7467f0', '#9a8cff'] },
  { id: 'emerald', nameJa: 'エメラルド', nameEn: 'Emerald', descriptionJa: '落ち着いた緑の作業空間', descriptionEn: 'Calm green workspace', colors: ['#06100e', '#10241f', '#16a879', '#42d6a1'] },
  { id: 'amber', nameJa: 'アンバー', nameEn: 'Amber', descriptionJa: '温かみのある琥珀色', descriptionEn: 'Warm amber palette', colors: ['#100b06', '#261a10', '#d88a2d', '#ffb454'] },
  { id: 'crimson', nameJa: 'クリムゾン', nameEn: 'Crimson', descriptionJa: '赤紫を基調にした配色', descriptionEn: 'Red and magenta accents', colors: ['#10070b', '#28151d', '#d84b72', '#ff7398'] },
  { id: 'graphite', nameJa: 'グラファイト', nameEn: 'Graphite', descriptionJa: '彩度を抑えた集中配色', descriptionEn: 'Low-saturation focus palette', colors: ['#0b0d0f', '#1c2024', '#7d8995', '#b8c4cf'] },
  { id: 'pastel-sky', nameJa: 'パステル・スカイ', nameEn: 'Pastel Sky', descriptionJa: '明るく澄んだ空色', descriptionEn: 'Bright and clear sky blue', colors: ['#eef6ff', '#ffffff', '#4b9ed8', '#b8ddf4'] },
  { id: 'pastel-mint', nameJa: 'パステル・ミント', nameEn: 'Pastel Mint', descriptionJa: '爽やかな淡いミント', descriptionEn: 'Fresh soft mint palette', colors: ['#edf9f4', '#ffffff', '#3fa88a', '#b9e7d7'] },
  { id: 'pastel-lavender', nameJa: 'パステル・ラベンダー', nameEn: 'Pastel Lavender', descriptionJa: '柔らかな薄紫の配色', descriptionEn: 'Soft lavender workspace', colors: ['#f5f1ff', '#ffffff', '#8974c9', '#d7cdf4'] },
  { id: 'pastel-peach', nameJa: 'パステル・ピーチ', nameEn: 'Pastel Peach', descriptionJa: '温かく明るいピーチ', descriptionEn: 'Warm bright peach palette', colors: ['#fff5ed', '#ffffff', '#d78a62', '#f4cfb9'] },
  { id: 'pastel-rose', nameJa: 'パステル・ローズ', nameEn: 'Pastel Rose', descriptionJa: '上品で淡いローズ', descriptionEn: 'Elegant soft rose palette', colors: ['#fff2f6', '#ffffff', '#c87999', '#f0c8d8'] },
  { id: 'pastel-lemon', nameJa: 'パステル・レモン', nameEn: 'Pastel Lemon', descriptionJa: '軽やかで明るいレモン', descriptionEn: 'Light and cheerful lemon palette', colors: ['#fffbea', '#ffffff', '#c99c3c', '#f3dfa0'] },
] as const

function isAppThemeId(value: unknown): value is AppThemeId {
  return appThemes.some((theme) => theme.id === value)
}

function cursorDataUrl(svg: string) {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function applyCursorPalette(value: AppThemeId) {
  const selectedTheme = appThemes.find((theme) => theme.id === value) ?? appThemes[0]
  const accent = selectedTheme.colors[2]
  const accentBright = selectedTheme.colors[3]
  const outline = value.startsWith('pastel-') ? '#25333e' : '#06111a'
  const arrowSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M4.2 2.4v23.1l6.1-5.6 4.8 9.4 4.1-2.1-4.7-9.1 8.3-.7L4.2 2.4Z" fill="#f8fbff" stroke="${outline}" stroke-width="2" stroke-linejoin="round"/><path d="M5.9 5.9v15.6l4.8-4.4 7.3-.6L5.9 5.9Z" fill="${accent}" fill-opacity=".52"/><path d="M5.2 3.8 21 16.7" fill="none" stroke="${accentBright}" stroke-width=".75" stroke-linecap="round" opacity=".8"/></svg>`
  const handSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M10.2 14.1V6.8a2.35 2.35 0 0 1 4.7 0v5.1-2.2a2.2 2.2 0 0 1 4.4 0v2.2-1.2a2.15 2.15 0 0 1 4.3 0v1.8a2.1 2.1 0 0 1 4.2.15v6.1c0 6.35-3.6 10.05-9.55 10.05-4.05 0-6.35-1.55-8.25-4.15l-5.45-7.45a2.4 2.4 0 0 1 3.75-3l1.9 1.9Z" fill="#f8fbff" stroke="${outline}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.9 12v4.1m4.4-4.2v4.2m4.3-3.6v3.9" fill="none" stroke="${accent}" stroke-width="1.35" stroke-linecap="round"/><path d="M11.2 18.1c4.7-1.5 9.2-1.45 14.1.2" fill="none" stroke="${accentBright}" stroke-width="1" stroke-linecap="round" opacity=".85"/></svg>`
  document.documentElement.style.setProperty('--cursor-arrow', `url("${cursorDataUrl(arrowSvg)}") 4 3`)
  document.documentElement.style.setProperty('--cursor-hand', `url("${cursorDataUrl(handSvg)}") 10 5`)
}

type SavedCodexSettings = {
  integration?: 'openai' | 'codex'
  model?: string
  authMethod?: 'chatgpt' | 'api-key'
  credentialStore?: 'environment' | 'keyring' | 'auto'
  ragEnabled?: boolean
  requireDiffReview?: boolean
}

const CODEX_SETTINGS_KEY = 'vertex.codexSettings'
const GENERAL_SETTINGS_KEY = 'vertex.generalSettings'

type SavedGeneralSettings = {
  fontSize?: number
  minimap?: boolean
  fileMakerVersion?: string
  polling?: boolean
  theme?: AppThemeId
  customCursor?: boolean
}

function loadGeneralSettings(): SavedGeneralSettings {
  try {
    return JSON.parse(localStorage.getItem(GENERAL_SETTINGS_KEY) ?? '{}') as SavedGeneralSettings
  } catch {
    return {}
  }
}

function loadCodexSettings(): SavedCodexSettings {
  try {
    return JSON.parse(localStorage.getItem(CODEX_SETTINGS_KEY) ?? '{}') as SavedCodexSettings
  } catch {
    return {}
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const savedCodex = loadCodexSettings()
  const savedGeneral = loadGeneralSettings()
  const fontSize = ref(savedGeneral.fontSize ?? 13)
  const minimap = ref(savedGeneral.minimap ?? true)
  const fileMakerVersion = ref(savedGeneral.fileMakerVersion ?? '26.0')
  const polling = ref(savedGeneral.polling ?? false)
  const theme = ref<AppThemeId>(isAppThemeId(savedGeneral.theme) ? savedGeneral.theme : 'vertex')
  const customCursor = ref(savedGeneral.customCursor ?? true)
  const codexIntegration = ref<'openai' | 'codex'>(savedCodex.integration ?? 'openai')
  const codexModel = ref(savedCodex.model ?? 'gpt-5.6-terra')
  const codexAuthMethod = ref<'chatgpt' | 'api-key'>(savedCodex.authMethod ?? 'api-key')
  const codexCredentialStore = ref<'environment' | 'keyring' | 'auto'>(savedCodex.credentialStore ?? 'environment')
  const codexRagEnabled = ref(savedCodex.ragEnabled ?? true)
  const codexRequireDiffReview = ref(savedCodex.requireDiffReview ?? true)

  watch(
    [codexIntegration, codexModel, codexAuthMethod, codexCredentialStore, codexRagEnabled, codexRequireDiffReview],
    ([integration, model, authMethod, credentialStore, ragEnabled, requireDiffReview]) => {
      localStorage.setItem(CODEX_SETTINGS_KEY, JSON.stringify({ integration, model, authMethod, credentialStore, ragEnabled, requireDiffReview }))
    },
  )

  function applyTheme(value: AppThemeId) {
    document.documentElement.dataset.theme = value
    document.documentElement.style.colorScheme = value.startsWith('pastel-') ? 'light' : 'dark'
    document.documentElement.dataset.customCursor = customCursor.value ? 'true' : 'false'
    if (customCursor.value) applyCursorPalette(value)
    else {
      document.documentElement.style.removeProperty('--cursor-arrow')
      document.documentElement.style.removeProperty('--cursor-hand')
    }
  }

  applyTheme(theme.value)

  watch(
    [fontSize, minimap, fileMakerVersion, polling, theme, customCursor],
    ([savedFontSize, savedMinimap, savedFileMakerVersion, savedPolling, savedTheme, savedCustomCursor]) => {
      applyTheme(savedTheme as AppThemeId)
      localStorage.setItem(GENERAL_SETTINGS_KEY, JSON.stringify({
        fontSize: savedFontSize,
        minimap: savedMinimap,
        fileMakerVersion: savedFileMakerVersion,
        polling: savedPolling,
        theme: savedTheme,
        customCursor: savedCustomCursor,
      }))
    },
  )

  return {
    fontSize,
    minimap,
    fileMakerVersion,
    polling,
    theme,
    customCursor,
    codexIntegration,
    codexModel,
    codexAuthMethod,
    codexCredentialStore,
    codexRagEnabled,
    codexRequireDiffReview,
  }
})
