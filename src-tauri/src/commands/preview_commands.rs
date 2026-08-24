use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::nodejs::preview_server;

const PREVIEW_WINDOW_LABEL: &str = "preview";

/// Starts the project's dev server and shows it in a dedicated webview window.
///
/// A separate window (rather than an iframe inside the dashboard) is what lets
/// Weavr inject its click-to-edit script into the page: the dev server runs on
/// its own localhost port, so an iframe would be cross-origin and script
/// injection would be blocked.
#[tauri::command]
pub async fn preview_start(app: AppHandle, project_path: String) -> AppResult<String> {
    let url = preview_server::start(&app, &PathBuf::from(project_path)).await?;

    let parsed = url
        .parse()
        .map_err(|e| AppError::Other(format!("preview URL {url} was not valid: {e}")))?;

    if let Some(existing) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        existing
            .navigate(parsed)
            .map_err(|e| AppError::Other(e.to_string()))?;
        existing
            .set_focus()
            .map_err(|e| AppError::Other(e.to_string()))?;
    } else {
        WebviewWindowBuilder::new(&app, PREVIEW_WINDOW_LABEL, WebviewUrl::External(parsed))
            .title("Preview — your website")
            .inner_size(1280.0, 900.0)
            .build()
            .map_err(|e| AppError::Other(e.to_string()))?;
    }

    Ok(url)
}

#[tauri::command]
pub async fn preview_stop(app: AppHandle, project_path: String) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        let _ = window.close();
    }
    preview_server::stop(&app, &PathBuf::from(project_path)).await
}
