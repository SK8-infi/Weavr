mod auth;
mod commands;
mod error;
mod github;
mod state;

use commands::auth_commands::{auth_check_session, auth_sign_out, auth_start};
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            auth_start,
            auth_check_session,
            auth_sign_out
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
