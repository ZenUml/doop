use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Url, WebviewWindow};
pub(crate) fn allowed_origin(label: &str, actual: &Url, expected: &Url) -> bool {
    label == "main"
        && actual.origin() == expected.origin()
        && expected.scheme() == "http"
        && expected.host_str() == Some("127.0.0.1")
}

pub fn marker(origin: &str) -> String {
    let origin = serde_json::to_string(origin).expect("valid origin string");
    format!("if(window===window.top&&window.location.origin==={origin}){{window.__DOOP_LEGACY_LIBRARY__=true;}}")
}

static CHOOSING: AtomicBool = AtomicBool::new(false);

#[tauri::command]
pub async fn legacy_library_choose(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<serde_json::Value, String> {
    let expected = Url::parse(crate::server::active(&app))
        .map_err(|_| "The local application origin is unavailable.")?;
    let actual = window
        .url()
        .map_err(|_| "The local application origin is unavailable.")?;
    if !allowed_origin(window.label(), &actual, &expected) {
        return Err("Open the local application before choosing a legacy library.".into());
    }
    if CHOOSING.swap(true, Ordering::SeqCst) {
        return Err("A legacy folder selection is already in progress.".into());
    }
    struct Choosing;
    impl Drop for Choosing {
        fn drop(&mut self) {
            CHOOSING.store(false, Ordering::SeqCst);
        }
    }
    let _choosing = Choosing;
    let Some(folder) = rfd::AsyncFileDialog::new()
        .set_title("Choose the old ZenUML library folder")
        .pick_folder()
        .await
    else {
        return Ok(serde_json::json!({"cancelled": true}));
    };
    let data = crate::local_server::data_dir(&app)
        .ok_or("The private application data folder is unavailable.")?;
    let manifest = tauri::async_runtime::spawn_blocking(move || {
        crate::legacy_library::snapshot(&data, folder.path(), "user_selected")
    })
    .await
    .map_err(|_| "Could not preserve the old library.")??;
    Ok(
        serde_json::json!({"status": manifest.status, "snapshotCount": manifest.snapshots.len(), "message": manifest.message}),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn chooser_requires_the_main_local_window_exact_origin() {
        let expected = Url::parse("http://127.0.0.1:4400").unwrap();
        assert!(allowed_origin("main", &expected, &expected));
        for url in [
            "http://127.0.0.1:4401",
            "https://127.0.0.1:4400",
            "http://localhost:4400",
            "https://diagramly.ai",
            "about:blank",
        ] {
            assert!(!allowed_origin(
                "main",
                &Url::parse(url).unwrap(),
                &expected
            ));
        }
        assert!(!allowed_origin("child", &expected, &expected));
        assert!(
            marker(expected.as_str()).contains("window===window.top&&window.location.origin===")
        );
    }
}
