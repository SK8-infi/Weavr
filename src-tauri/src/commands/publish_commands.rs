use serde::Serialize;
use tauri::State;

use crate::error::{AppError, AppResult};
use crate::git::push::{self, PublishOutcome};
use crate::github::client;
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct PendingChanges {
    pub files: Vec<String>,
}

/// What the user has changed but not yet published.
#[tauri::command]
pub async fn publish_pending(state: State<'_, AppState>) -> AppResult<PendingChanges> {
    let project = state.project.lock().unwrap();
    let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
    Ok(PendingChanges {
        files: session.edited_files.iter().cloned().collect(),
    })
}

#[tauri::command]
pub async fn publish_now(state: State<'_, AppState>) -> AppResult<PublishOutcome> {
    let token = state
        .session_token
        .lock()
        .unwrap()
        .clone()
        .ok_or(AppError::NotAuthenticated)?;

    let (root, files) = {
        let project = state.project.lock().unwrap();
        let session = project.as_ref().ok_or(AppError::NoProjectOpen)?;
        (session.root.clone(), session.edited_files.clone())
    };

    if files.is_empty() {
        return Ok(PublishOutcome::NothingToDo);
    }

    // Commit as the signed-in user so history shows who actually made the
    // change, not a generic "Weavr" author.
    let user = client::get_authenticated_user(&state.http, &token).await?;
    let author_name = user.name.clone().unwrap_or_else(|| user.login.clone());
    let author_email = format!("{}@users.noreply.github.com", user.login);
    let message = push::commit_message(&files);

    let outcome = tauri::async_runtime::spawn_blocking(move || {
        push::publish(
            &root,
            &token,
            &files,
            &message,
            &author_name,
            &author_email,
        )
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))??;

    // Only clear the pending list once the push actually landed — if it was
    // stopped or failed, those files still need publishing.
    if matches!(outcome, PublishOutcome::Published { .. }) {
        let mut project = state.project.lock().unwrap();
        if let Some(session) = project.as_mut() {
            session.edited_files.clear();
        }
    }

    Ok(outcome)
}
