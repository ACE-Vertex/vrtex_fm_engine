use tauri::State;

use crate::{license::LicenseState, AppState};

#[tauri::command]
pub fn get_license_state(state: State<'_, AppState>) -> LicenseState {
    state.license.snapshot()
}

#[tauri::command]
pub fn refresh_license_state(state: State<'_, AppState>) -> LicenseState {
    state.license.refresh()
}
