use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

pub fn projects_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("projects");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// One local clone directory per repo, keyed by "owner__name" so cloning the
/// same-named repo from two different owners can never collide.
pub fn project_path(app: &AppHandle, full_name: &str) -> AppResult<PathBuf> {
    let safe_name = full_name.replace('/', "__");
    Ok(projects_dir(app)?.join(safe_name))
}
