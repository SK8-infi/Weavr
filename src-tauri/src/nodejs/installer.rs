use std::hash::{Hash, Hasher};
use std::path::Path;
use std::process::Stdio;

use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc;

use crate::error::{AppError, AppResult};
use crate::paths;

use super::runtime;

const INSTALL_MARKER: &str = ".weavr-install.json";

/// Runs `npm install` against a cloned project using the bundled Node
/// runtime, streaming stdout/stderr lines to `on_line` as they arrive.
/// Skips the install entirely if package-lock.json hasn't changed since the
/// last successful install (checked via a marker file in node_modules) —
/// picking a different repo a second time shouldn't re-pay the install cost.
pub async fn install_dependencies<F>(
    app: &AppHandle,
    project_dir: &Path,
    mut on_line: F,
) -> AppResult<()>
where
    F: FnMut(String),
{
    let lock_hash = std::fs::read_to_string(project_dir.join("package-lock.json"))
        .ok()
        .map(|contents| hash_of(&contents));

    let marker_path = project_dir.join("node_modules").join(INSTALL_MARKER);
    if let (Some(hash), Ok(existing)) = (&lock_hash, std::fs::read_to_string(&marker_path)) {
        if existing.trim() == hash.to_string() {
            on_line("Dependencies already up to date.".into());
            return Ok(());
        }
    }

    let node_bin = runtime::node_binary(app)?;
    let npm_script = runtime::npm_cli_script(app)?;
    let cache_dir = paths::npm_cache_dir(app)?;

    let mut command = Command::new(&node_bin);
    runtime::with_node_on_path(app, &mut command)?;
    let mut child = command
        .arg(&npm_script)
        .arg("install")
        .arg("--no-audit")
        .arg("--no-fund")
        .arg("--cache")
        .arg(&cache_dir)
        .current_dir(project_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let stderr = child.stderr.take().expect("stderr was piped");

    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let tx_stdout = tx.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx_stdout.send(line);
        }
    });
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = tx.send(line);
        }
    });

    while let Some(line) = rx.recv().await {
        on_line(line);
    }

    let status = child.wait().await?;
    if !status.success() {
        return Err(AppError::Other(format!(
            "npm install exited with status {status}"
        )));
    }

    if let Some(hash) = lock_hash {
        let _ = std::fs::write(&marker_path, hash.to_string());
    }

    Ok(())
}

fn hash_of(input: &str) -> u64 {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    input.hash(&mut hasher);
    hasher.finish()
}
