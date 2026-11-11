//! StoreKit lives in-process in the main WKWebView. Unlike a page-supplied
//! `window` flag or Tauri command, WKScriptMessage.frameInfo proves whether
//! the call came from the main frame and exposes the actual security origin.
use tauri::WebviewWindow;

pub fn attach(window: &WebviewWindow, origin: &str) -> tauri::Result<()> {
    #[cfg(all(target_os = "macos", feature = "app-store", not(chromium)))]
    {
        use std::ffi::{c_char, c_void, CString};
        unsafe extern "C" {
            fn diagramly_storekit_attach(webview: *mut c_void, origin: *const c_char);
        }
        let origin = CString::new(origin).expect("validated local origin");
        window.with_webview(move |platform| unsafe {
            diagramly_storekit_attach(platform.inner(), origin.as_ptr());
        })?;
    }
    #[cfg(not(all(target_os = "macos", feature = "app-store", not(chromium))))]
    let _ = (window, origin);
    Ok(())
}
