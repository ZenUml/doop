//! App Store builds are updated exclusively by Apple. No feed, downloader,
//! restart command, or updater plugin is linked in this build profile.
pub fn start(_: &tauri::AppHandle) {}
pub fn page_loading(_: &tauri::AppHandle) {}
pub fn install_on_quit(_: &tauri::AppHandle) {}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub fn update_card_ready() -> Option<serde_json::Value> {
    None
}

#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn update_restart() -> Result<(), String> {
    Err("Updates are delivered by the application distributor.".into())
}
