mod auth;
mod commands;
mod content;
mod edit_bridge;
mod error;
mod git;
mod github;
mod nodejs;
mod paths;
mod project;
mod state;

use commands::auth_commands::{auth_check_session, auth_sign_out, auth_start};
use commands::content_commands::{content_editable_values, content_load, content_update};
use commands::preview_commands::{preview_start, preview_stop};
use commands::repo_commands::{repo_clone, repo_list};
use commands::setup_commands::project_install;
use nodejs::preview_server::{stop_all_blocking, PreviewRegistry};
use state::AppState;
use tauri::{Manager, RunEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new())
        .manage(PreviewRegistry::default())
        .setup(|app| {
            edit_bridge::register(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            auth_start,
            auth_check_session,
            auth_sign_out,
            repo_list,
            repo_clone,
            project_install,
            preview_start,
            preview_stop,
            content_load,
            content_editable_values,
            content_update
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // Make sure quitting Weavr takes every preview dev server with it,
            // rather than leaving stray node processes behind.
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                stop_all_blocking(app.app_handle());
            }
        });
}
