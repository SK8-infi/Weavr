//! Applies edits made by clicking directly on the preview.
//!
//! The injected bridge emits an event rather than invoking a command, which
//! keeps the previewed site's permitted surface down to "can emit events" —
//! it never gets access to git, the filesystem, or the GitHub token.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::commands::preview_commands::PREVIEW_WINDOW_LABEL;
use crate::content::index::ContentIndex;
use crate::content::writer;
use crate::state::AppState;

pub const TEXT_EDITED_EVENT: &str = "weavr://text-edited";
/// Emitted for the dashboard so it can refresh its content forms after an
/// in-place edit.
pub const CONTENT_CHANGED_EVENT: &str = "weavr://content-changed";

#[derive(Debug, Deserialize)]
struct TextEditedPayload {
    #[serde(rename = "fieldId")]
    field_id: String,
    #[serde(rename = "newValue")]
    new_value: String,
}

pub fn register(app: &AppHandle) {
    let handle = app.clone();

    app.listen(TEXT_EDITED_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<TextEditedPayload>(event.payload()) else {
            return;
        };
        let handle = handle.clone();

        // Parsing and writing are blocking filesystem work; keep them off the
        // event thread so the preview stays responsive.
        tauri::async_runtime::spawn_blocking(move || {
            let result = apply_edit(&handle, &payload.field_id, &payload.new_value);
            report_result(&handle, &payload, result);
        });
    });
}

fn apply_edit(app: &AppHandle, field_id: &str, new_value: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or("no project is open")?;

    let leaf = session
        .index
        .find_by_id(field_id)
        .ok_or_else(|| format!("unknown field {field_id}"))?
        .clone();

    writer::write_string_field(
        &session.root,
        &leaf.file,
        &leaf.export_name,
        &leaf.json_path,
        new_value,
    )
    .map_err(|e| e.to_string())?;

    session.edited_files.insert(leaf.file.clone());

    // The edit shifted every byte offset after it in that file, so the index
    // has to be rebuilt before the next write.
    session.index = ContentIndex::build(&session.root).map_err(|e| e.to_string())?;

    Ok(())
}

fn report_result(app: &AppHandle, payload: &TextEditedPayload, result: Result<(), String>) {
    let Some(window) = app.get_webview_window(PREVIEW_WINDOW_LABEL) else {
        return;
    };

    let field = serde_json::to_string(&payload.field_id).unwrap_or_else(|_| "\"\"".into());

    match result {
        Ok(()) => {
            let value = serde_json::to_string(&payload.new_value).unwrap_or_else(|_| "\"\"".into());
            let _ = window.eval(&format!(
                "window.__weavrEditBridge && window.__weavrEditBridge.confirmSaved({field}, {value});"
            ));
            let _ = app.emit_to("main", CONTENT_CHANGED_EVENT, &payload.field_id);
        }
        Err(message) => {
            // Roll the on-screen text back so what the user sees always
            // matches what's actually saved.
            let _ = window.eval(&format!(
                "window.__weavrEditBridge && window.__weavrEditBridge.rejectSave({field});"
            ));
            let _ = app.emit_to("main", "weavr://edit-failed", message);
        }
    }
}
