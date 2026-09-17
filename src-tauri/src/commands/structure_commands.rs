use serde::Serialize;
use tauri::{AppHandle, State};

use crate::content::index::ContentIndex;
use crate::content::pages;
use crate::content::parser;
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

// ---------------------------------------------------------------------------
// Sections on a page
//
// The same three operations as above, addressed the way the preview can
// actually refer to things: by page id and position, rather than by a path
// into a file it knows nothing about. Everything below resolves that to a
// `pageRegistry[n].sections` path and hands it to the operations already
// proven on lists.
// ---------------------------------------------------------------------------

/// The pages a site declares, each with the sections it shows, in order.
#[tauri::command]
pub async fn page_list(state: State<'_, AppState>) -> AppResult<Vec<pages::Page>> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    Ok(pages::pages(&session.index))
}

/// Every kind of section that can be added to a page.
#[tauri::command]
pub async fn section_catalogue(state: State<'_, AppState>) -> AppResult<Vec<pages::SectionKind>> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    Ok(pages::catalogue(&session.index))
}

/// Where a page's sections live, resolved now rather than held on to.
///
/// A page's position moves whenever one is added above it, so this is looked
/// up per operation from the id the preview knows.
fn sections_path(state: &State<'_, AppState>, page_id: &str) -> AppResult<String> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    Ok(pages::find(&session.index, page_id)?.sections_path())
}

#[tauri::command]
pub async fn section_add(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    index: usize,
    section_id: String,
) -> AppResult<()> {
    // Checked against the manifest, because a sectionId the resolver does not
    // know renders as nothing at all. The page would come back one section
    // shorter with no error anywhere — the user would simply think the button
    // did not work.
    {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
        if !pages::catalogue(&session.index)
            .iter()
            .any(|kind| kind.id == section_id)
        {
            return Err(AppError::Other(format!(
                "'{section_id}' is not a section this site can render"
            )));
        }
    }

    let path = sections_path(&state, &page_id)?;
    let literal = pages::section_literal(&section_id);
    mark_edited(&state, pages::REGISTRY_FILE)?;
    mutate(&app, &state, move |root| {
        structure::insert_item(
            root,
            pages::REGISTRY_FILE,
            pages::PAGES_EXPORT,
            &path,
            index,
            &literal,
        )
    })
    .await
}

#[tauri::command]
pub async fn section_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    index: usize,
) -> AppResult<()> {
    let path = sections_path(&state, &page_id)?;
    mark_edited(&state, pages::REGISTRY_FILE)?;
    mutate(&app, &state, move |root| {
        structure::remove_item(root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, index)
    })
    .await
}

#[tauri::command]
pub async fn section_duplicate(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    index: usize,
) -> AppResult<()> {
    let path = sections_path(&state, &page_id)?;
    mark_edited(&state, pages::REGISTRY_FILE)?;
    mutate(&app, &state, move |root| {
        structure::duplicate_item(root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, index)
    })
    .await
}

#[tauri::command]
pub async fn section_move(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
    from: usize,
    to: usize,
) -> AppResult<()> {
    let path = sections_path(&state, &page_id)?;
    mark_edited(&state, pages::REGISTRY_FILE)?;
    mutate(&app, &state, move |root| {
        structure::move_item(root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, &path, from, to)
    })
    .await
}

/// Adds a page to the site.
///
/// No file is created and no route is written. A template following the
/// contract generates its routes from the registry, so a page is an entry in
/// an array — which is also why this can be undone by removing that entry.
///
/// Linking it into the menu is part of the same action rather than a second
/// step: a page nobody can navigate to is the same as no page at all, and
/// forgetting is the likely outcome when it is optional.
#[tauri::command]
pub async fn page_create(
    app: AppHandle,
    state: State<'_, AppState>,
    title: String,
    section_ids: Vec<String>,
    add_to_menu: bool,
) -> AppResult<pages::Page> {
    let title = title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::Other("give the page a name".into()));
    }

    let (id, path) = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;

        for section_id in &section_ids {
            if !pages::catalogue(&session.index)
                .iter()
                .any(|kind| kind.id == *section_id)
            {
                return Err(AppError::Other(format!(
                    "'{section_id}' is not a section this site can render"
                )));
            }
        }

        let id = pages::unique_slug(&session.index, &pages::slug(&title));
        let path = format!("/{id}");
        pages::validate_new(&session.index, &id, &path)?;
        (id, path)
    };

    let literal = pages::page_literal(&id, &title, &path, &section_ids);
    let menu_literal = pages::nav_literal(&id, &title, &path);

    mark_edited(&state, pages::REGISTRY_FILE)?;
    let placed_id = id.clone();
    mutate(&app, &state, move |root| {
        // Appended rather than inserted, so an existing page never shifts and
        // the new one is simply the newest.
        let end = parser::locate_array(
            pages::REGISTRY_FILE,
            &std::fs::read_to_string(root.join(pages::REGISTRY_FILE))?,
            pages::PAGES_EXPORT,
            "",
        )?
        .elements
        .len();

        structure::insert_item(
            root,
            pages::REGISTRY_FILE,
            pages::PAGES_EXPORT,
            "",
            end,
            &literal,
        )
    })
    .await?;

    if add_to_menu {
        // Deliberately after the page itself, and deliberately not fatal. The
        // page exists and works at its address either way; a menu that could
        // not be written is worth saying so about, not worth discarding the
        // page for.
        if let Err(error) = add_menu_entry(&app, &state, menu_literal).await {
            eprintln!("[weavr] the page was created but not added to the menu: {error}");
        }
    }

    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    pages::find(&session.index, &placed_id)
}

async fn add_menu_entry(
    app: &AppHandle,
    state: &State<'_, AppState>,
    literal: String,
) -> AppResult<()> {
    mark_edited(state, pages::NAV_FILE)?;
    mutate(app, state, move |root| {
        let source = std::fs::read_to_string(root.join(pages::NAV_FILE))?;
        let end = parser::locate_array(pages::NAV_FILE, &source, pages::NAV_EXPORT, "")?
            .elements
            .len();
        structure::insert_item(root, pages::NAV_FILE, pages::NAV_EXPORT, "", end, &literal)
    })
    .await
}

/// Takes a page off the site, and its menu entry with it.
#[tauri::command]
pub async fn page_remove(
    app: AppHandle,
    state: State<'_, AppState>,
    page_id: String,
) -> AppResult<()> {
    let index = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
        pages::find(&session.index, &page_id)?.index
    };

    mark_edited(&state, pages::REGISTRY_FILE)?;
    mutate(&app, &state, move |root| {
        structure::remove_item(root, pages::REGISTRY_FILE, pages::PAGES_EXPORT, "", index)
    })
    .await?;

    // A menu entry pointing at a page that no longer exists sends visitors to
    // the site's not-found handling, so it goes with it. Not fatal for the
    // same reason as above, in reverse: the page is already gone.
    if let Err(error) = remove_menu_entry(&app, &state, &page_id).await {
        eprintln!("[weavr] the page was removed but its menu entry was not: {error}");
    }
    Ok(())
}

async fn remove_menu_entry(
    app: &AppHandle,
    state: &State<'_, AppState>,
    page_id: &str,
) -> AppResult<()> {
    let at = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
        session
            .index
            .leaves()
            .iter()
            .find(|leaf| {
                leaf.file == pages::NAV_FILE
                    && leaf.export_name == pages::NAV_EXPORT
                    && leaf.json_path.ends_with("].id")
                    && leaf.value == page_id
            })
            // Only a top-level entry — "[3].id" — is removed here. One nested
            // inside a dropdown would need its parent's position too, and
            // guessing at that could take out the wrong menu item.
            .and_then(|leaf| leaf.json_path.strip_prefix('[')?.split(']').next()?.parse().ok())
    };

    let Some(at) = at else { return Ok(()) };
    mark_edited(state, pages::NAV_FILE)?;
    mutate(app, state, move |root| {
        structure::remove_item(root, pages::NAV_FILE, pages::NAV_EXPORT, "", at)
    })
    .await
}

fn mark_edited(state: &State<'_, AppState>, file: &str) -> AppResult<()> {
    let mut project = state.project.lock().unwrap();
    let session = project.as_mut().ok_or(AppError::NoProjectOpen)?;
    session.edited_files.insert(file.to_string());
    Ok(())
}
