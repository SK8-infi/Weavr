use std::path::PathBuf;

use serde::Serialize;
use tauri::State;

use crate::content::index::{ContentIndex, ResolvedValue};
use crate::content::parser::LeafRecord;
use crate::content::writer;
use crate::error::{AppError, AppResult};
use crate::state::{AppState, ProjectSession};

/// One editable field, as shown in the content forms.
#[derive(Debug, Clone, Serialize)]
pub struct EditableField {
    pub id: String,
    pub file: String,
    pub export_name: String,
    pub json_path: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentGroup {
    pub file: String,
    pub fields: Vec<EditableField>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ContentSummary {
    pub groups: Vec<ContentGroup>,
    /// Fields editable by clicking straight on the preview.
    pub clickable_count: usize,
    /// Fields whose text appears in several places, so they can only be
    /// changed from the forms where the user picks which one they mean.
    pub forms_only_count: usize,
}

impl From<&LeafRecord> for EditableField {
    fn from(leaf: &LeafRecord) -> Self {
        Self {
            id: leaf.id(),
            file: leaf.file.clone(),
            export_name: leaf.export_name.clone(),
            json_path: leaf.json_path.clone(),
            value: leaf.value.clone(),
        }
    }
}

/// Parses the project's data files and caches the index for this session.
#[tauri::command]
pub async fn content_load(
    state: State<'_, AppState>,
    project_path: String,
) -> AppResult<ContentSummary> {
    let root = PathBuf::from(&project_path);
    let index = ContentIndex::build(&root)?;
    let summary = ContentSummary {
        groups: group_fields(&index),
        clickable_count: index.unambiguous_values().len(),
        forms_only_count: index.ambiguous_count(),
    };

    let mut project = state.project.lock().unwrap();
    let edited = project
        .as_ref()
        .filter(|session| session.root == root)
        .map(|session| session.edited_files.clone())
        .unwrap_or_default();

    let mut session = ProjectSession::new(root, index);
    session.edited_files = edited;
    *project = Some(session);

    Ok(summary)
}

fn group_fields(index: &ContentIndex) -> Vec<ContentGroup> {
    let mut groups: Vec<ContentGroup> = Vec::new();

    for leaf in index.leaves() {
        // Structural values are wiring, not copy — editing a section id or a
        // route through a text box would break the site, so they never appear
        // in the forms.
        if leaf.is_structural {
            continue;
        }
        match groups.last_mut() {
            Some(group) if group.file == leaf.file => group.fields.push(leaf.into()),
            _ => groups.push(ContentGroup {
                file: leaf.file.clone(),
                fields: vec![leaf.into()],
            }),
        }
    }

    groups
}

/// Strings the preview can offer for click-to-edit, sent once per page load so
/// matching happens in the page without a round-trip per text node.
#[tauri::command]
pub async fn content_editable_values(
    state: State<'_, AppState>,
) -> AppResult<Vec<ResolvedValue>> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    Ok(session.index.unambiguous_values())
}

#[tauri::command]
pub async fn content_update(
    state: State<'_, AppState>,
    field_id: String,
    new_value: String,
) -> AppResult<()> {
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or(AppError::NoProjectOpen)?;

    let leaf = session
        .index
        .find_by_id(&field_id)
        .ok_or_else(|| AppError::Other(format!("unknown field {field_id}")))?
        .clone();

    writer::write_string_field(
        &session.root,
        &leaf.file,
        &leaf.export_name,
        &leaf.json_path,
        &new_value,
    )?;

    session.edited_files.insert(leaf.file.clone());

    // Rebuild so byte offsets and values reflect what's now on disk — the edit
    // shifted every span after it in that file.
    session.index = ContentIndex::build(&session.root)?;

    Ok(())
}
