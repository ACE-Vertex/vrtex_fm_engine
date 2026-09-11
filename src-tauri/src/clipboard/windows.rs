use std::ptr;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::System::DataExchange::{
    CloseClipboard, EmptyClipboard, EnumClipboardFormats, GetClipboardData,
    GetClipboardFormatNameW, OpenClipboard, RegisterClipboardFormatW, SetClipboardData,
};
use windows_sys::Win32::System::Memory::{
    GlobalAlloc, GlobalLock, GlobalSize, GlobalUnlock, GMEM_MOVEABLE,
};

use super::{
    decode_filemaker_payload, encode_filemaker_payload, internal_format, windows_format,
    ClipboardError, ClipboardPayload, ClipboardProvider,
};

const OPEN_RETRIES: usize = 8;
const OPEN_RETRY_DELAY_MS: u64 = 20;
const FORMAT_NAME_CAPACITY: usize = 256;

const KNOWN_FILEMAKER_FORMATS: &[&str] = &[
    "Mac-XMSC", "Mac-XMSS", "Mac-XMTB", "Mac-XMFD", "Mac-XML2", "Mac-XMFN", "Mac-XMTH",
];

pub struct WindowsClipboard;

impl WindowsClipboard {
    pub fn new() -> Self {
        Self
    }
}

impl ClipboardProvider for WindowsClipboard {
    fn get_filemaker_clipboard(&self) -> Result<ClipboardPayload, ClipboardError> {
        let _guard = ClipboardGuard::open()?;
        let formats = enumerate_registered_formats()?;
        let (format_id, format_name) = select_filemaker_format(&formats).ok_or_else(|| {
            ClipboardError::NotAvailable(
                "no registered Mac-XM* / Mac-XML2 format is present".to_owned(),
            )
        })?;

        let raw = read_global_clipboard_data(format_id)?;
        let xml = decode_filemaker_payload(&raw)?;
        Ok(ClipboardPayload {
            format: internal_format(&format_name),
            windows_format: format_name,
            xml,
            raw_size: raw.len(),
        })
    }

    fn set_filemaker_clipboard(&self, format: &str, xml: &str) -> Result<(), ClipboardError> {
        let payload = encode_filemaker_payload(xml)?;
        let format_name = windows_format(format);
        let wide_name = wide_null(&format_name);
        let format_id = unsafe { RegisterClipboardFormatW(wide_name.as_ptr()) };
        if format_id == 0 {
            return Err(last_windows_error("RegisterClipboardFormatW"));
        }

        let _guard = ClipboardGuard::open()?;
        if unsafe { EmptyClipboard() } == 0 {
            return Err(last_windows_error("EmptyClipboard"));
        }
        publish_global_clipboard_data(format_id, &payload)
    }
}

struct ClipboardGuard;

impl ClipboardGuard {
    fn open() -> Result<Self, ClipboardError> {
        let mut last_error = None;
        for attempt in 0..OPEN_RETRIES {
            if unsafe { OpenClipboard(ptr::null_mut()) } != 0 {
                return Ok(Self);
            }
            last_error = Some(std::io::Error::last_os_error());
            if attempt + 1 < OPEN_RETRIES {
                thread::sleep(Duration::from_millis(OPEN_RETRY_DELAY_MS));
            }
        }
        Err(ClipboardError::WindowsApi(format!(
            "OpenClipboard: {}",
            last_error.expect("at least one clipboard open attempt")
        )))
    }
}

impl Drop for ClipboardGuard {
    fn drop(&mut self) {
        let _ = unsafe { CloseClipboard() };
    }
}

fn enumerate_registered_formats() -> Result<Vec<(u32, String)>, ClipboardError> {
    let mut formats = Vec::new();
    let mut current = 0_u32;
    loop {
        current = unsafe { EnumClipboardFormats(current) };
        if current == 0 {
            break;
        }
        if current < 0xC000 {
            continue;
        }
        let mut name = vec![0_u16; FORMAT_NAME_CAPACITY];
        let length =
            unsafe { GetClipboardFormatNameW(current, name.as_mut_ptr(), name.len() as i32) };
        if length > 0 {
            formats.push((current, String::from_utf16_lossy(&name[..length as usize])));
        }
    }
    Ok(formats)
}

fn select_filemaker_format(formats: &[(u32, String)]) -> Option<(u32, String)> {
    for known in KNOWN_FILEMAKER_FORMATS {
        if let Some((id, name)) = formats.iter().find(|(_, name)| name == known) {
            return Some((*id, name.clone()));
        }
    }
    formats
        .iter()
        .find(|(_, name)| name.starts_with("Mac-XM") || name == "Mac-XML2")
        .cloned()
}

fn read_global_clipboard_data(format_id: u32) -> Result<Vec<u8>, ClipboardError> {
    let handle = unsafe { GetClipboardData(format_id) };
    if handle.is_null() {
        return Err(last_windows_error("GetClipboardData"));
    }
    let size = unsafe { GlobalSize(handle) };
    if size < 4 {
        return Err(ClipboardError::InvalidData(format!(
            "clipboard block contains only {size} bytes"
        )));
    }
    let pointer = unsafe { GlobalLock(handle) };
    if pointer.is_null() {
        return Err(last_windows_error("GlobalLock"));
    }
    let data = unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), size).to_vec() };
    let _ = unsafe { GlobalUnlock(handle) };
    Ok(data)
}

fn publish_global_clipboard_data(format_id: u32, payload: &[u8]) -> Result<(), ClipboardError> {
    let memory = unsafe { GlobalAlloc(GMEM_MOVEABLE, payload.len()) };
    if memory.is_null() {
        return Err(last_windows_error("GlobalAlloc"));
    }
    let pointer = unsafe { GlobalLock(memory) };
    if pointer.is_null() {
        unsafe { GlobalFree(memory) };
        return Err(last_windows_error("GlobalLock"));
    }
    unsafe {
        ptr::copy_nonoverlapping(payload.as_ptr(), pointer.cast::<u8>(), payload.len());
    }
    let _ = unsafe { GlobalUnlock(memory) };

    let result = unsafe { SetClipboardData(format_id, memory) };
    if result.is_null() {
        unsafe { GlobalFree(memory) };
        Err(last_windows_error("SetClipboardData"))
    } else {
        Ok(())
    }
}

fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

fn last_windows_error(operation: &str) -> ClipboardError {
    ClipboardError::WindowsApi(format!("{operation}: {}", std::io::Error::last_os_error()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selects_known_formats_by_stable_priority() {
        let formats = vec![(2, "Mac-XMSS".to_owned()), (1, "Mac-XMSC".to_owned())];
        assert_eq!(
            select_filemaker_format(&formats),
            Some((1, "Mac-XMSC".to_owned()))
        );
    }

    #[test]
    fn preserves_unknown_filemaker_formats() {
        let formats = vec![(9, "Mac-XMZZ".to_owned())];
        assert_eq!(
            select_filemaker_format(&formats),
            Some((9, "Mac-XMZZ".to_owned()))
        );
    }

    #[test]
    #[ignore = "requires FileMaker XML data in the live Windows Clipboard"]
    fn reads_live_filemaker_clipboard() {
        let payload = WindowsClipboard::new()
            .get_filemaker_clipboard()
            .expect("FileMaker Clipboard data should be available");
        println!(
            "format={} windows_format={} raw_size={}",
            payload.format, payload.windows_format, payload.raw_size
        );
        println!("{}", payload.xml);
        assert!(!payload.xml.trim().is_empty());
        assert!(payload.xml.contains('<'));
    }

    #[test]
    #[ignore = "reads the registered FileMaker formats in the live Windows Clipboard"]
    fn diagnoses_live_filemaker_formats() {
        let _guard = ClipboardGuard::open().expect("Clipboard should be readable");
        let formats = enumerate_registered_formats().expect("formats should be enumerable");
        for (format_id, format_name) in formats
            .iter()
            .filter(|(_, name)| name.starts_with("Mac-XM") || name == "Mac-XML2")
        {
            match read_global_clipboard_data(*format_id) {
                Ok(raw) => match decode_filemaker_payload(&raw) {
                    Ok(xml) => println!(
                        "format={format_name} raw_size={} xml_size={} prefix={:?}",
                        raw.len(),
                        xml.len(),
                        xml.chars().take(120).collect::<String>()
                    ),
                    Err(error) => println!(
                        "format={format_name} raw_size={} decode_error={error}",
                        raw.len()
                    ),
                },
                Err(error) => println!("format={format_name} read_error={error}"),
            }
        }
    }

    #[test]
    #[ignore = "overwrites the live Windows Clipboard"]
    fn round_trips_live_windows_clipboard() {
        let xml = concat!(
            "<fmxmlsnippet type=\"FMObjectList\">",
            "<Script includeInMenu=\"True\" SiriShortcutVisible=\"False\" ",
            "runFullAccess=\"False\" id=\"1\" name=\"Vertex Clipboard Round Trip\">",
            "<Step enable=\"True\" id=\"86\" name=\"エラー処理\">",
            "<Set state=\"True\"></Set>",
            "<DisableStepCollapsed state=\"False\"></DisableStepCollapsed>",
            "</Step>",
            "</Script></fmxmlsnippet>"
        );
        let clipboard = WindowsClipboard::new();
        clipboard
            .set_filemaker_clipboard("XMSC", xml)
            .expect("FileMaker Clipboard data should be writable");
        let payload = clipboard
            .get_filemaker_clipboard()
            .expect("written FileMaker Clipboard data should be readable");
        assert_eq!(payload.format, "XMSC");
        assert_eq!(payload.windows_format, "Mac-XMSC");
        assert_eq!(payload.raw_size, xml.len() + 4);
        assert_eq!(payload.xml, xml);
    }

    #[test]
    #[ignore = "overwrites the live Windows Clipboard with an XMSS catalog probe"]
    fn writes_step_catalog_probe() {
        let steps = [1_u32, 2, 3, 103]
            .into_iter()
            .map(|id| {
                format!(
                    "<Step enable=\"True\" id=\"{id}\" name=\"VertexProbe_{id}\">\
                     <DisableStepCollapsed state=\"False\"></DisableStepCollapsed>\
                     </Step>"
                )
            })
            .collect::<String>();
        let xml = format!("<fmxmlsnippet type=\"FMObjectList\">{steps}</fmxmlsnippet>");
        let clipboard = WindowsClipboard::new();
        clipboard
            .set_filemaker_clipboard("XMSS", &xml)
            .expect("catalog probe should be writable");
    }
}
