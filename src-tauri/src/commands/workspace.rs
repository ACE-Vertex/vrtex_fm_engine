use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};

const WORKSPACE_EXTENSION: &str = "vfe-workspace";
const MAX_WORKSPACE_BYTES: usize = 128 * 1024 * 1024;

#[tauri::command]
pub fn save_workspace_file(path: String, contents: String) -> Result<(), String> {
    if contents.len() > MAX_WORKSPACE_BYTES {
        return Err("Workspace file exceeds the 128 MB limit".to_string());
    }

    let destination = Path::new(&path);
    if !destination.is_absolute() {
        return Err("Workspace destination must be an absolute path".to_string());
    }
    if destination.extension().and_then(|value| value.to_str()) != Some(WORKSPACE_EXTENSION) {
        return Err(format!("Workspace files must use .{WORKSPACE_EXTENSION}"));
    }
    if !destination.parent().is_some_and(Path::is_dir) {
        return Err("Workspace destination folder does not exist".to_string());
    }

    atomic_write(destination, contents.as_bytes())
        .map_err(|error| format!("Failed to save workspace file: {error}"))
}

#[tauri::command]
pub fn read_workspace_file(path: String) -> Result<String, String> {
    let source = Path::new(&path);
    if !source.is_absolute()
        || source.extension().and_then(|value| value.to_str()) != Some(WORKSPACE_EXTENSION)
    {
        return Err(format!(
            "Workspace source must be an absolute .{WORKSPACE_EXTENSION} path"
        ));
    }
    let metadata = std::fs::metadata(source).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_WORKSPACE_BYTES as u64 {
        return Err("Workspace file exceeds the 128 MB limit".to_owned());
    }
    std::fs::read_to_string(source).map_err(|error| error.to_string())
}

fn atomic_write(destination: &Path, contents: &[u8]) -> std::io::Result<()> {
    let parent = destination
        .parent()
        .ok_or_else(|| std::io::Error::other("Missing parent folder"))?;
    let temporary = temporary_path(parent, destination);
    let result = (|| {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temporary)?;
        file.write_all(contents)?;
        file.sync_all()?;
        atomic_replace(&temporary, destination)
    })();
    if result.is_err() {
        let _ = std::fs::remove_file(&temporary);
    }
    result
}

fn temporary_path(parent: &Path, destination: &Path) -> PathBuf {
    let name = destination
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("workspace");
    parent.join(format!(".{name}.{}.tmp", uuid::Uuid::new_v4()))
}

#[cfg(not(windows))]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    std::fs::rename(source, destination)
}

#[cfg(windows)]
fn atomic_replace(source: &Path, destination: &Path) -> std::io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows_sys::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };
    let source_wide: Vec<u16> = source.as_os_str().encode_wide().chain(Some(0)).collect();
    let destination_wide: Vec<u16> = destination
        .as_os_str()
        .encode_wide()
        .chain(Some(0))
        .collect();
    let success = unsafe {
        MoveFileExW(
            source_wide.as_ptr(),
            destination_wide.as_ptr(),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    };
    if success == 0 {
        Err(std::io::Error::last_os_error())
    } else {
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_creates_and_replaces_workspace() {
        let folder =
            std::env::temp_dir().join(format!("vrtex-workspace-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&folder).unwrap();
        let path = folder.join("test.vfe-workspace");
        atomic_write(&path, b"first").unwrap();
        atomic_write(&path, b"second").unwrap();
        assert_eq!(std::fs::read_to_string(&path).unwrap(), "second");
        std::fs::remove_file(path).unwrap();
        std::fs::remove_dir(folder).unwrap();
    }
}
