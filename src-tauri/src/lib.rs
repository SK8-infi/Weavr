mod auth;
mod commands;
mod error;
mod git;
mod github;
mod nodejs;
mod paths;
mod project;
mod state;

use commands::auth_commands::{auth_check_session, auth_sign_out, auth_start};
use commands::repo_commands::{repo_clone, repo_list};
use commands::setup_commands::project_install;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            auth_start,
            auth_check_session,
            auth_sign_out,
            repo_list,
            repo_clone,
            project_install
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
