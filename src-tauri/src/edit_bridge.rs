//! Applies edits made by clicking directly on the preview.
//!
//! The injected bridge emits an event rather than invoking a command, which
//! keeps the previewed site's permitted surface down to "can emit events" —
//! it never gets access to git, the filesystem, or the GitHub token.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::content::index::ContentIndex;
use crate::layout;
use crate::content::writer;
use crate::state::AppState;

pub const TEXT_EDITED_EVENT: &str = "weavr://text-edited";
/// The preview page announcing that its bridge is installed and wants values.
pub const BRIDGE_READY_EVENT: &str = "weavr://bridge-ready";
/// Sent to the panel when a write was refused.
pub const EDIT_FAILED_EVENT: &str = "weavr://edit-failed";
/// Emitted for the dashboard so it can refresh its content forms after an
/// in-place edit.
pub const CONTENT_CHANGED_EVENT: &str = "weavr://content-changed";

/// One or more fields to set to the same new text.
///
/// Always a list, even for an ordinary single edit, because text that several
/// fields share can be changed in one place or in all of them at once, and
/// both go through the same path.
#[derive(Debug, Deserialize)]
struct TextEditedPayload {
    #[serde(rename = "fieldIds")]
    field_ids: Vec<String>,
    #[serde(rename = "newValue")]
    new_value: String,
}

pub fn register(app: &AppHandle) {
    // The preview asks for its values whenever its bridge loads — on first
    // open and again after every dev-server reload, which wipes them.
    let ready_handle = app.clone();
    app.listen(BRIDGE_READY_EVENT, move |_event| {
        let _ = crate::commands::preview_commands::push_editable_values(&ready_handle);
    });

    let handle = app.clone();

    app.listen(TEXT_EDITED_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<TextEditedPayload>(event.payload()) else {
            return;
        };
        let handle = handle.clone();

        // Parsing and writing are blocking filesystem work; keep them off the
        // event thread so the preview stays responsive.
        tauri::async_runtime::spawn_blocking(move || {
            let result = apply_edit(&handle, &payload.field_ids, &payload.new_value);
            report_result(&handle, &payload, result);
        });
    });
}

fn apply_edit(app: &AppHandle, field_ids: &[String], new_value: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or("no project is open")?;

    for field_id in field_ids {
        // Looked up one at a time, and the index rebuilt after each write:
        // changing a value shifts every byte offset after it in that file, so
        // a second write using offsets from before the first would land in the
        // wrong place.
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
        session.index = ContentIndex::build(&session.root).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn report_result(app: &AppHandle, payload: &TextEditedPayload, result: Result<(), String>) {
    let Some(preview) = app.get_webview(layout::PREVIEW_LABEL) else {
        return;
    };

    let fields = serde_json::to_string(&payload.field_ids).unwrap_or_else(|_| "[]".into());

    match result {
        Ok(()) => {
            let value = serde_json::to_string(&payload.new_value).unwrap_or_else(|_| "\"\"".into());
            let _ = preview.eval(&format!(
                "window.__weavrEditBridge && window.__weavrEditBridge.confirmSaved({fields}, {value});"
            ));
            // The edited string is the key the preview matches on, so refresh
            // its map — otherwise that element stops being editable after one
            // change.
            let _ = crate::commands::preview_commands::push_editable_values(app);
            let _ = app.emit_to(layout::PANEL_LABEL, CONTENT_CHANGED_EVENT, &payload.field_ids);
        }
        Err(message) => {
            // Roll the on-screen text back so what the user sees always
            // matches what's actually saved.
            let _ = preview.eval(&format!(
                "window.__weavrEditBridge && window.__weavrEditBridge.rejectSave({fields});"
            ));
            let _ = app.emit_to(layout::PANEL_LABEL, EDIT_FAILED_EVENT, message);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// `listen` is global, so a handler that emits the event it listens for
    /// receives its own message and recurses until the stack overflows —
    /// which crashed the whole app when clicking ambiguous text. Keep the two
    /// sets disjoint.
    #[test]
    fn no_handler_emits_an_event_it_listens_for() {
        let listened = [BRIDGE_READY_EVENT, TEXT_EDITED_EVENT];
        let emitted = [CONTENT_CHANGED_EVENT, EDIT_FAILED_EVENT];

        for name in emitted {
            assert!(
                !listened.contains(&name),
                "{name} is both listened for and emitted, which would loop"
            );
        }
    }
}
