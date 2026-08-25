use serde::Serialize;
use tauri::{AppHandle, State};

use crate::content::index::ContentIndex;
use crate::content::structure;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

/// A list the user can add to, remove from, or reorder.
#[derive(Debug, Clone, Serialize)]
pub struct EditableList {
    /// Stable handle: "file::export::path".
    pub id: String,
    pub file: String,
    pub export_name: String,
    pub array_path: String,
    /// A short preview of each entry, for labelling rows in the panel.
    pub items: Vec<String>,
}

fn split_id(id: &str) -> AppResult<(&str, &str, &str)> {
    let mut parts = id.split("::");
    match (parts.next(), parts.next(), parts.next()) {
        (Some(file), Some(export), Some(path)) => Ok((file, export, path)),
        _ => Err(AppError::Other(format!("malformed list id {id}"))),
    }
}

/// Every list in the project, derived from the field paths already indexed.
///
/// A path like `documents[0].title` implies a list at `documents`; collecting
/// those gives the lists without a second pass over the files.
#[tauri::command]
pub async fn structure_lists(state: State<'_, AppState>) -> AppResult<Vec<EditableList>> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;

    let mut lists: Vec<EditableList> = Vec::new();

    for leaf in session.index.leaves() {
        let Some((array_path, index)) = list_parent(&leaf.json_path) else {
            continue;
        };

        let id = format!("{}::{}::{}", leaf.file, leaf.export_name, array_path);
        let entry = match lists.iter_mut().find(|l| l.id == id) {
            Some(existing) => existing,
            None => {
                lists.push(EditableList {
                    id: id.clone(),
                    file: leaf.file.clone(),
                    export_name: leaf.export_name.clone(),
                    array_path: array_path.to_string(),
                    items: Vec::new(),
                });
                lists.last_mut().expect("just pushed")
            }
        };

        // First string inside each entry stands in as its label.
        while entry.items.len() <= index {
            entry.items.push(String::new());
        }
        if entry.items[index].is_empty() && !leaf.is_structural {
            entry.items[index] = leaf.value.chars().take(60).collect();
        }
    }

    // Single-entry lists aren't worth offering; there's nothing to reorder and
    // the field itself is already editable.
    lists.retain(|l| l.items.len() > 1);
    lists.sort_by(|a, b| a.id.cmp(&b.id));
    Ok(lists)
}

/// "documents[0].title" -> ("documents", 0); "[2].label" -> ("", 2)
fn list_parent(json_path: &str) -> Option<(&str, usize)> {
    let open = json_path.find('[')?;
    let close = json_path[open..].find(']')? + open;
    let index = json_path[open + 1..close].parse().ok()?;
    Some((&json_path[..open], index))
}

async fn mutate<F>(app: &AppHandle, state: &State<'_, AppState>, apply: F) -> AppResult<()>
where
    F: FnOnce(&std::path::Path) -> AppResult<()>,
{
    {
        let mut project = state.project.lock().unwrap();
        let session = project.as_mut().ok_or(AppError::NoProjectOpen)?;
        apply(&session.root.clone())?;
        session.index = ContentIndex::build(&session.root)?;
    }
    // The page's text changed, so the preview's map of it must too.
    crate::commands::preview_commands::push_editable_values(app)
}

#[tauri::command]
pub async fn structure_duplicate(
    app: AppHandle,
    state: State<'_, AppState>,
    list_id: String,
    index: usize,
) -> AppResult<()> {
    let (file, export, path) = split_id(&list_id)?;
    let (file, export, path) = (file.to_string(), export.to_string(), path.to_string());
    mark_edited(&state, &file)?;
    mutate(&app, &state, move |root| {
        structure::duplicate_item(root, &file, &export, &path, index)
    })
    .await
}

#[tauri::command]
pub async fn structure_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    list_id: String,
    index: usize,
) -> AppResult<()> {
    let (file, export, path) = split_id(&list_id)?;
    let (file, export, path) = (file.to_string(), export.to_string(), path.to_string());
    mark_edited(&state, &file)?;
    mutate(&app, &state, move |root| {
        structure::remove_item(root, &file, &export, &path, index)
    })
    .await
}

#[tauri::command]
pub async fn structure_move(
    app: AppHandle,
    state: State<'_, AppState>,
    list_id: String,
    from: usize,
    to: usize,
) -> AppResult<()> {
    let (file, export, path) = split_id(&list_id)?;
    let (file, export, path) = (file.to_string(), export.to_string(), path.to_string());
    mark_edited(&state, &file)?;
    mutate(&app, &state, move |root| {
        structure::move_item(root, &file, &export, &path, from, to)
    })
    .await
}

fn mark_edited(state: &State<'_, AppState>, file: &str) -> AppResult<()> {
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or(AppError::NoProjectOpen)?;
    session.edited_files.insert(file.to_string());
    Ok(())
}
