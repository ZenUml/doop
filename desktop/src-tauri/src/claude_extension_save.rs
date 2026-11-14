//! Save only the extension shipped with this app, after explicit user selection.
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Url, WebviewWindow};

fn bundle_path(resources: &Path) -> PathBuf {
    resources.join("local-server/app/dist/claude-extension/doop.mcpb")
}

#[tauri::command]
pub async fn claude_save_bundled_extension(
    app: AppHandle,
    window: WebviewWindow,
) -> Result<bool, String> {
    let expected = Url::parse(crate::server::active(&app))
        .map_err(|_| "The local application origin is unavailable.")?;
    let actual = window
        .url()
        .map_err(|_| "The local application origin is unavailable.")?;
    if !crate::legacy_library_bridge::allowed_origin(window.label(), &actual, &expected) {
        return Err("Open the local application before saving the extension.".into());
    }
    let source = bundle_path(
        &crate::local_server::resources().ok_or("The bundled extension is unavailable.")?,
    );
    if !source.is_file() {
        return Err("The bundled extension is unavailable. Please update the app.".into());
    }
    let Some(destination) = rfd::AsyncFileDialog::new()
        .set_title("Save Claude extension")
        .set_file_name("doop.mcpb")
        .add_filter("Claude extension", &["mcpb"])
        .save_file()
        .await
    else {
        return Ok(false);
    };
    tauri::async_runtime::spawn_blocking(move || std::fs::copy(source, destination.path()))
        .await
        .map_err(|_| "Could not save the extension.")?
        .map_err(|_| "Could not save the extension.")?;
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn source_is_the_fixed_bundled_extension() {
        assert_eq!(
            bundle_path(Path::new("/app/Resources")),
            PathBuf::from("/app/Resources/local-server/app/dist/claude-extension/doop.mcpb")
        );
    }
    #[test]
    fn save_requires_the_exact_main_loopback_origin() {
        let expected = Url::parse("http://127.0.0.1:4400").unwrap();
        assert!(crate::legacy_library_bridge::allowed_origin(
            "main", &expected, &expected
        ));
        for actual in [
            "http://127.0.0.1:4401",
            "http://localhost:4400",
            "https://example.com",
        ] {
            assert!(!crate::legacy_library_bridge::allowed_origin(
                "main",
                &Url::parse(actual).unwrap(),
                &expected
            ));
        }
        assert!(!crate::legacy_library_bridge::allowed_origin(
            "child", &expected, &expected
        ));
    }
}
