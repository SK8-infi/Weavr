use tauri::{AppHandle, State};

use crate::content::index::ContentIndex;
use crate::error::{AppError, AppResult};
use crate::git::sync::{self, PullOutcome, SyncStatus};
use crate::state::AppState;

fn token(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .session_token
        .lock()
        .unwrap()
        .clone()
        .ok_or(AppError::NotAuthenticated)
}

fn project_root(state: &State<'_, AppState>) -> AppResult<std::path::PathBuf> {
    let project = state.project.lock().unwrap();
    project
        .as_ref()
        .map(|session| session.root.clone())
        .ok_or(AppError::NoProjectOpen)
}

/// How this copy stands against the shared repository.
///
/// Polled by the panel so someone editing can see that a colleague has
/// published, rather than finding out only when their own publish stops.
#[tauri::command]
pub async fn sync_status(state: State<'_, AppState>) -> AppResult<SyncStatus> {
    let root = project_root(&state)?;
    // Contacting GitHub is best-effort here: offline should show stale counts,
    // not an error banner over the editor.
    let token = token(&state).ok();

    tauri::async_runtime::spawn_blocking(move || sync::status(&root, token.as_deref()))
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
}

/// Pulls in what everyone else has published.
#[tauri::command]
pub async fn sync_pull(app: AppHandle, state: State<'_, AppState>) -> AppResult<PullOutcome> {
    let root = project_root(&state)?;
    let token = token(&state)?;

    let outcome = {
        let root = root.clone();
        tauri::async_runtime::spawn_blocking(move || sync::pull(&root, &token))
            .await
            .map_err(|e| AppError::Other(e.to_string()))??
    };

    // Incoming commits change the very strings the editor matches against, so
    // the index and the preview's copy of it both have to be rebuilt.
    if matches!(outcome, PullOutcome::Updated { .. }) {
        {
            let mut project = state.project.lock().unwrap();
            if let Some(session) = project.as_mut() {
                session.index = ContentIndex::build(&session.root)?;
            }
        }
        crate::commands::preview_commands::push_editable_values(&app)?;
    }

    Ok(outcome)
}
