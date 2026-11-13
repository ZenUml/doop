//! StoreKit lives in-process in the main WKWebView. Unlike a page-supplied
//! `window` flag or Tauri command, WKScriptMessage.frameInfo proves whether
//! the call came from the main frame and exposes the actual security origin.
use tauri::WebviewWindow;

pub fn desktop_marker(version: &str) -> String {
    format!("if(window===window.top){{window.__DOOP_DESKTOP__='{version}';window.__DOOP_DESKTOP_PLATFORM__='macos';window.__DOOP_CODEX_SETUP__=false;window.__DOOP_VIEW_MENU__=true;window.__DOOP_APP_MENU__=true;window.__DOOP_LOCAL_FONTS__=true;window.__DIAGRAMLY_APP_STORE__=true;}}")
}

#[cfg(test)]
mod tests {
    #[test]
    fn app_store_profile_reuses_the_paid_apps_identity_and_upgrades_its_version() {
        let config: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.app-store.conf.json")).unwrap();
        assert_eq!(config["identifier"], "com.zenuml.app");
        assert_eq!(config["version"], "1.1.0");
        assert_eq!(config["bundle"]["macOS"]["bundleVersion"], "41");
    }
    #[test]
    fn app_store_does_not_advertise_external_codex_configuration_access() {
        let capability: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/app-store.json")).unwrap();
        assert!(!capability["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .any(|permission| permission == "allow-codex-add-mcp"));
        assert!(super::desktop_marker("1.0.0").contains("__DOOP_CODEX_SETUP__=false"));
    }
}

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
