use std::path::PathBuf;

use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::error::{AppError, AppResult};
use crate::nodejs::preview_server;
use crate::state::AppState;

pub const PREVIEW_WINDOW_LABEL: &str = "preview";

/// Injected into the previewed site so it becomes click-to-editable. The site
/// itself ships none of this — that's what lets Weavr work on an unmodified
/// repo.
const EDIT_BRIDGE_JS: &str = include_str!("../../resources/weavr-edit-bridge.js");

/// Starts the project's dev server and shows it in a dedicated webview window.
///
/// A separate window (rather than an iframe inside the dashboard) is what lets
/// Weavr inject the edit bridge: the dev server runs on its own localhost
/// port, so an iframe would be cross-origin and injection would be blocked.
#[tauri::command]
pub async fn preview_start(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    project_path: String,
) -> AppResult<String> {
    let url = preview_server::start(&app, &PathBuf::from(project_path)).await?;

    let parsed = url
        .parse()
        .map_err(|e| AppError::Other(format!("preview URL {url} was not valid: {e}")))?;

    let window = match app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        Some(existing) => {
            existing
                .navigate(parsed)
                .map_err(|e| AppError::Other(e.to_string()))?;
            existing
        }
        None => WebviewWindowBuilder::new(&app, PREVIEW_WINDOW_LABEL, WebviewUrl::External(parsed))
            .title("Preview — your website")
            .inner_size(1280.0, 900.0)
            // Runs on every page load, including a full reload after Vite
            // restarts, so the bridge survives navigation.
            .initialization_script(EDIT_BRIDGE_JS)
            .build()
            .map_err(|e| AppError::Other(e.to_string()))?,
    };

    let _ = window.set_focus();
    push_editable_values(&window, &state)?;

    Ok(url)
}

/// Hands the preview page the value -> field-id list it matches text against.
pub fn push_editable_values(
    window: &WebviewWindow,
    state: &tauri::State<'_, AppState>,
) -> AppResult<()> {
    let project = state.project.lock().unwrap();
    let Some(session) = project.as_ref() else {
        return Ok(());
    };

    let payload = serde_json::to_string(&session.index.unambiguous_values())
        .map_err(|e| AppError::Other(format!("could not serialize editable values: {e}")))?;

    // The page may still be loading when this runs, so the bridge polls for
    // itself rather than assuming it is already installed.
    let script = format!(
        r#"(function(){{
             var payload = {payload};
             var tries = 0;
             (function apply(){{
               if (window.__weavrEditBridge) {{
                 window.__weavrEditBridge.setValues(payload);
                 window.__weavrEditBridge.setEnabled(true);
                 return;
               }}
               if (tries++ < 100) setTimeout(apply, 50);
             }})();
           }})();"#
    );

    window
        .eval(&script)
        .map_err(|e| AppError::Other(format!("could not install edit bridge: {e}")))
}

#[tauri::command]
pub async fn preview_stop(app: AppHandle, project_path: String) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) {
        let _ = window.close();
    }
    preview_server::stop(&app, &PathBuf::from(project_path)).await
}
