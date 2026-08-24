use std::path::PathBuf;

use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::error::AppResult;
use crate::nodejs::installer;

#[derive(Debug, Clone, Serialize)]
struct InstallProgressEvent {
    project_path: String,
    line: String,
}

/// Runs `npm install` for a cloned project, emitting "install://progress"
/// lines as they happen so the frontend can show a first-run "setting up
/// your website" log instead of a silent, possibly multi-minute freeze.
#[tauri::command]
pub async fn project_install(app: AppHandle, project_path: String) -> AppResult<()> {
    let dir = PathBuf::from(&project_path);
    let app_handle = app.clone();
    let path_for_event = project_path.clone();

    installer::install_dependencies(&app, &dir, move |line| {
        let _ = app_handle.emit(
            "install://progress",
            InstallProgressEvent {
                project_path: path_for_event.clone(),
                line,
            },
        );
    })
    .await
}
