import { invoke } from '@tauri-apps/api/core'
import { featureAccess, type LicenseState } from './featureAccess'
import { isTauriRuntime } from './nativeGateway'

function previewState(): LicenseState {
  return featureAccess.snapshot() as LicenseState
}

export const licenseGateway = {
  async get(): Promise<LicenseState> {
    return isTauriRuntime()
      ? invoke<LicenseState>('get_license_state')
      : previewState()
  },

  async refresh(): Promise<LicenseState> {
    return isTauriRuntime()
      ? invoke<LicenseState>('refresh_license_state')
      : previewState()
  },
}
