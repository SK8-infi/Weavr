use serde::Serialize;
use tauri::{AppHandle, State};

use crate::error::{AppError, AppResult};
use crate::git::clone;
use crate::github::repos::{self, RepoSummary};
use crate::project;
use crate::state::AppState;
use crate::paths;

fn current_token(state: &State<'_, AppState>) -> AppResult<String> {
    state
        .session_token
        .lock()
        .unwrap()
        .clone()
        .ok_or(AppError::NotAuthenticated)
}

#[tauri::command]
pub async fn repo_list(state: State<'_, AppState>) -> AppResult<Vec<RepoSummary>> {
    let token = current_token(&state)?;
    repos::list_user_repos(&state.http, &token).await
}

#[derive(Debug, Clone, Serialize)]
pub struct ProjectInfo {
    pub local_path: String,
    pub is_valid: bool,
    pub missing: Vec<String>,
}

#[tauri::command]
pub async fn repo_clone(
    app: AppHandle,
    state: State<'_, AppState>,
    repo: RepoSummary,
) -> AppResult<ProjectInfo> {
    let token = current_token(&state)?;
    let dest = paths::project_path(&app, &repo.full_name)?;

    if dest.exists() {
        std::fs::remove_dir_all(&dest)?;
    }

    let clone_url = repo.clone_url.clone();
    let dest_for_clone = dest.clone();
    tauri::async_runtime::spawn_blocking(move || clone::clone_repo(&clone_url, &token, &dest_for_clone))
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;

    let validation = project::validate(&dest);

    Ok(ProjectInfo {
        local_path: dest.to_string_lossy().to_string(),
        is_valid: validation.is_valid,
        missing: validation.missing,
    })
}
