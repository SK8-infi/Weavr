//! Applies edits made by clicking directly on the preview.
//!
//! The injected bridge emits an event rather than invoking a command, which
//! keeps the previewed site's permitted surface down to "can emit events" —
//! it never gets access to git, the filesystem, or the GitHub token.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Listener, Manager};

use crate::content::index::ContentIndex;
use crate::content::pages;
use crate::content::structure;
use crate::content::styles;
use crate::layout;
use crate::content::writer;
use crate::state::AppState;

pub const TEXT_EDITED_EVENT: &str = "weavr://text-edited";
/// A section was moved, copied or taken off a page from the preview.
pub const SECTION_OP_EVENT: &str = "weavr://section-op";
/// A section was chosen from the catalogue to go in at a given point.
pub const SECTION_ADD_EVENT: &str = "weavr://section-add";
/// A section's background, spacing or alignment changed.
pub const SECTION_APPEARANCE_EVENT: &str = "weavr://section-appearance";
/// A size or alignment changed on the preview.
pub const STYLE_EDITED_EVENT: &str = "weavr://style-edited";
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

/// A field's new size and alignment. Either may be absent, meaning "not set";
/// both absent clears the field's style entirely.
#[derive(Debug, Deserialize)]
struct StyleEditedPayload {
    #[serde(rename = "fieldId")]
    field_id: String,
    #[serde(default)]
    size: Option<String>,
    #[serde(default)]
    align: Option<String>,
}

/// A section identified the way the preview can name it: which page it is on
/// and where in that page's list it sits.
#[derive(Debug, Deserialize)]
struct SectionOpPayload {
    #[serde(rename = "pageId")]
    page_id: String,
    index: usize,
    op: String,
}

/// A section's presentation. Any field absent means "not set"; all absent
/// clears the section's appearance entirely.
#[derive(Debug, Deserialize)]
struct SectionAppearancePayload {
    #[serde(rename = "pageId")]
    page_id: String,
    index: usize,
    #[serde(default)]
    background: Option<String>,
    #[serde(default)]
    spacing: Option<String>,
    #[serde(default)]
    align: Option<String>,
}

#[derive(Debug, Deserialize)]
struct SectionAddPayload {
    #[serde(rename = "pageId")]
    page_id: String,
    index: usize,
    #[serde(rename = "sectionId")]
    section_id: String,
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

    let section_handle = app.clone();
    app.listen(SECTION_OP_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<SectionOpPayload>(event.payload()) else {
            return;
        };
        let handle = section_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(message) = apply_section_op(&handle, &payload) {
                let _ = handle.emit_to(layout::PANEL_LABEL, EDIT_FAILED_EVENT, message);
            }
        });
    });

    let add_handle = app.clone();
    app.listen(SECTION_ADD_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<SectionAddPayload>(event.payload()) else {
            return;
        };
        let handle = add_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(message) = apply_section_add(&handle, &payload) {
                let _ = handle.emit_to(layout::PANEL_LABEL, EDIT_FAILED_EVENT, message);
            }
        });
    });

    let appearance_handle = app.clone();
    app.listen(SECTION_APPEARANCE_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<SectionAppearancePayload>(event.payload()) else {
            return;
        };
        let handle = appearance_handle.clone();
        tauri::async_runtime::spawn_blocking(move || {
            if let Err(message) = apply_section_appearance(&handle, &payload) {
                let _ = handle.emit_to(layout::PANEL_LABEL, EDIT_FAILED_EVENT, message);
            }
        });
    });

    let style_handle = app.clone();
    app.listen(STYLE_EDITED_EVENT, move |event| {
        let Ok(payload) = serde_json::from_str::<StyleEditedPayload>(event.payload()) else {
            return;
        };
        let handle = style_handle.clone();

        tauri::async_runtime::spawn_blocking(move || {
            let result = apply_style(&handle, &payload);
            report_style_result(&handle, &payload, result);
        });
    });
}

/// Sets how a section is presented.
///
/// Written into the section's own entry rather than a file alongside, so that
/// reordering — which moves the entry's text as a unit — carries the setting
/// with the section instead of leaving it pointing at whatever took its place.
fn apply_section_appearance(
    app: &AppHandle,
    payload: &SectionAppearancePayload,
) -> Result<(), String> {
    let appearance = pages::Appearance {
        background: payload.background.clone(),
        spacing: payload.spacing.clone(),
        align: payload.align.clone(),
    };
    appearance.validate().map_err(|e| e.to_string())?;

    let state = app.state::<AppState>();
    let (root, path) = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or("no project is open")?;
        let page = pages::find(&session.index, &payload.page_id).map_err(|e| e.to_string())?;
        let section = page
            .sections
            .get(payload.index)
            .ok_or("that section is no longer on this page")?;
        (session.root.clone(), section.props_path(&page))
    };

    let literal = appearance.literal();
    structure::set_field(
        &root,
        pages::REGISTRY_FILE,
        pages::PAGES_EXPORT,
        &path,
        pages::APPEARANCE_KEY,
        // Nothing set means no key at all, so a section left alone keeps the
        // registry exactly as its author wrote it.
        if appearance.is_empty() { None } else { Some(&literal) },
    )
    .map_err(|e| e.to_string())?;

    finish_structural_edit(app)
}

/// Turns a press in the preview into an edit of the page registry.
///
/// "up" and "down" are worked out here rather than in the preview: the page is
/// the one thing that knows how many sections it has, and a move past either
/// end has to be refused rather than clamped into a no-op that looks like a
/// broken button.
fn apply_section_op(app: &AppHandle, payload: &SectionOpPayload) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (root, path, count) = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or("no project is open")?;
        let page = pages::find(&session.index, &payload.page_id).map_err(|e| e.to_string())?;
        (session.root.clone(), page.sections_path(), page.sections.len())
    };

    if payload.index >= count {
        return Err(format!(
            "this page has {count} sections, so there is nothing at position {}",
            payload.index + 1
        ));
    }

    let at = payload.index;
    match payload.op.as_str() {
        "up" if at == 0 => return Err("this section is already at the top".into()),
        "down" if at + 1 >= count => return Err("this section is already at the bottom".into()),
        "up" => structure::move_item(&root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, at, at - 1),
        "down" => structure::move_item(&root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, at, at + 1),
        "duplicate" => {
            structure::duplicate_item(&root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, at)
        }
        "remove" => {
            structure::remove_item(&root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, at)
        }
        other => return Err(format!("'{other}' is not something that can be done to a section")),
    }
    .map_err(|e| e.to_string())?;

    finish_structural_edit(app)
}

fn apply_section_add(app: &AppHandle, payload: &SectionAddPayload) -> Result<(), String> {
    let state = app.state::<AppState>();
    let (root, path) = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or("no project is open")?;

        // A sectionId the site cannot resolve renders as nothing at all, so
        // the page would come back unchanged with no error to show for it.
        if !pages::catalogue(&session.index)
            .iter()
            .any(|kind| kind.id == payload.section_id)
        {
            return Err(format!(
                "'{}' is not a section this site can render",
                payload.section_id
            ));
        }

        let page = pages::find(&session.index, &payload.page_id).map_err(|e| e.to_string())?;
        (session.root.clone(), page.sections_path())
    };

    structure::insert_item(
        &root,
        pages::REGISTRY_FILE,
        pages::PAGES_EXPORT,
        &path,
        payload.index,
        &pages::section_literal(&payload.section_id),
    )
    .map_err(|e| e.to_string())?;

    finish_structural_edit(app)
}

/// Re-reads the project and tells both halves of the app what changed.
///
/// The index has to be rebuilt before anything else looks at it: every byte
/// offset after the splice has moved, so a later edit using the old offsets
/// would land in the wrong place.
fn finish_structural_edit(app: &AppHandle) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let mut project = state.project.lock().unwrap();
        let session = project.as_mut().ok_or("no project is open")?;
        session.edited_files.insert(pages::REGISTRY_FILE.to_string());
        session.index = ContentIndex::build(&session.root).map_err(|e| e.to_string())?;
    }

    let _ = crate::commands::preview_commands::push_editable_values(app);
    let _ = app.emit_to(
        layout::PANEL_LABEL,
        CONTENT_CHANGED_EVENT,
        Vec::<String>::new(),
    );
    Ok(())
}

fn apply_style(app: &AppHandle, payload: &StyleEditedPayload) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or("no project is open")?;

    // Checked against the index so a style can only be attached to a field
    // that exists. Without this a stale preview could write entries for fields
    // that were since renamed, and nothing would ever clean them up.
    if session.index.find_by_id(&payload.field_id).is_none() {
        return Err(format!("unknown field {}", payload.field_id));
    }

    styles::set(
        &session.root,
        &payload.field_id,
        styles::FieldStyle {
            size: payload.size.clone(),
            align: payload.align.clone(),
        },
    )
    .map_err(|e| e.to_string())?;

    // Publish stages only what Weavr wrote, so the styles file has to be
    // declared here or a restyle would never reach the repository.
    session.edited_files.insert(styles::STYLES_FILE.to_string());
    Ok(())
}

fn report_style_result(app: &AppHandle, payload: &StyleEditedPayload, result: Result<(), String>) {
    match result {
        Ok(()) => {
            let _ = app.emit_to(
                layout::PANEL_LABEL,
                CONTENT_CHANGED_EVENT,
                vec![payload.field_id.clone()],
            );
        }
        Err(message) => {
            // Nothing to roll back on the page — the site re-renders from the
            // styles file, so a refused write simply leaves it as it was.
            let _ = app.emit_to(layout::PANEL_LABEL, EDIT_FAILED_EVENT, message);
        }
    }
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
        let listened = [
            BRIDGE_READY_EVENT,
            TEXT_EDITED_EVENT,
            STYLE_EDITED_EVENT,
            SECTION_OP_EVENT,
            SECTION_ADD_EVENT,
            SECTION_APPEARANCE_EVENT,
        ];
        let emitted = [CONTENT_CHANGED_EVENT, EDIT_FAILED_EVENT];

        for name in emitted {
            assert!(
                !listened.contains(&name),
                "{name} is both listened for and emitted, which would loop"
            );
        }
    }
}
