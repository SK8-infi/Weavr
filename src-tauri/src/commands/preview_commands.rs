use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::layout;
use crate::nodejs::preview_server;
use crate::state::AppState;

/// Injected into the previewed site so it becomes click-to-editable. The site
/// itself ships none of this — that's what lets Weavr work on an unmodified
/// repo.
const EDIT_BRIDGE_JS: &str = include_str!("../../resources/weavr-edit-bridge.js");

/// Starts the project's dev server and docks it beside the editing panel.
#[tauri::command]
pub async fn preview_start(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    project_path: String,
) -> AppResult<String> {
    let path = PathBuf::from(&project_path);
    let url = preview_server::start(&app, &path).await?;

    // Make sure the content index exists before the preview asks for it.
    // Without this the preview can come up first and be handed nothing, and
    // the site silently isn't clickable.
    ensure_index_loaded(&state, &path)?;

    layout::show_preview(&app, &url, EDIT_BRIDGE_JS)?;
    push_editable_values(&app)?;

    Ok(url)
}

fn ensure_index_loaded(state: &tauri::State<'_, AppState>, root: &PathBuf) -> AppResult<()> {
    let mut project = state.project.lock().unwrap();
    let already_loaded = project
        .as_ref()
        .is_some_and(|session| &session.root == root);
    if already_loaded {
        return Ok(());
    }
    let index = crate::content::index::ContentIndex::build(root)?;
    *project = Some(crate::state::ProjectSession::new(root.clone(), index));
    Ok(())
}

/// Hands the preview the value -> field-id list it matches rendered text
/// against.
///
/// Called whenever the index changes as well as on first load: an edit changes
/// the very strings this map is keyed on, so a stale map would leave elements
/// quietly non-editable after the first change.
pub fn push_editable_values(app: &AppHandle) -> AppResult<()> {
    let Some(preview) = app.get_webview(layout::PREVIEW_LABEL) else {
        return Ok(());
    };

    let state = app.state::<AppState>();
    let project = state.project.lock().unwrap();
    let Some(session) = project.as_ref() else {
        return Ok(());
    };

    let payload = serde_json::to_string(&session.index.all_values())
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

    preview
        .eval(&script)
        .map_err(|e| AppError::Other(format!("could not install edit bridge: {e}")))
}

#[tauri::command]
pub async fn preview_stop(app: AppHandle, project_path: String) -> AppResult<()> {
    layout::hide_preview(&app)?;
    preview_server::stop(&app, &PathBuf::from(project_path)).await
}
