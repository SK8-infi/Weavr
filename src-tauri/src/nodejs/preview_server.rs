use std::collections::HashMap;
use std::net::TcpListener;
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

use crate::error::{AppError, AppResult};

use super::runtime;

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
enum LauncherMessage {
    Ready { url: String },
    Error { message: String },
}

pub struct RunningPreview {
    pub url: String,
    child: Child,
}

/// One preview dev server per project path. Keyed so switching between
/// projects tears the old one down instead of leaking node processes.
#[derive(Default)]
pub struct PreviewRegistry {
    running: Mutex<HashMap<PathBuf, RunningPreview>>,
}

impl PreviewRegistry {
    pub fn url_for(&self, project_dir: &Path) -> Option<String> {
        self.running
            .lock()
            .unwrap()
            .get(project_dir)
            .map(|p| p.url.clone())
    }

    fn insert(&self, project_dir: PathBuf, preview: RunningPreview) {
        self.running.lock().unwrap().insert(project_dir, preview);
    }

    pub fn take(&self, project_dir: &Path) -> Option<RunningPreview> {
        self.running.lock().unwrap().remove(project_dir)
    }

    pub fn take_all(&self) -> Vec<RunningPreview> {
        self.running.lock().unwrap().drain().map(|(_, v)| v).collect()
    }
}

/// Reserves a free localhost port by binding and immediately releasing it, so
/// we can hand Vite an explicit port with strictPort instead of parsing
/// whatever it picks out of its console banner.
fn reserve_port() -> AppResult<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

fn launcher_script(app: &AppHandle) -> AppResult<PathBuf> {
    let path = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Other(e.to_string()))?
        .join("weavr-preview-server.mjs");
    if !path.is_file() {
        return Err(AppError::Other(format!(
            "preview launcher missing at {}",
            path.display()
        )));
    }
    Ok(path)
}

/// Starts (or reuses) a Vite dev server for a project and returns its URL,
/// resolving only once the launcher reports the server is actually listening.
pub async fn start(app: &AppHandle, project_dir: &Path) -> AppResult<String> {
    let registry = app.state::<PreviewRegistry>();
    if let Some(url) = registry.url_for(project_dir) {
        return Ok(url);
    }

    let node_bin = runtime::node_binary(app)?;
    let script = launcher_script(app)?;
    let port = reserve_port()?;

    let mut child = Command::new(&node_bin)
        .arg(&script)
        .arg(project_dir)
        .arg(port.to_string())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()?;

    let stdout = child.stdout.take().expect("stdout was piped");
    let mut lines = BufReader::new(stdout).lines();

    // Wait for the launcher's readiness line before handing a URL back, so
    // the webview never navigates to a port that isn't serving yet.
    let url = loop {
        match lines.next_line().await? {
            Some(line) => {
                let Ok(message) = serde_json::from_str::<LauncherMessage>(&line) else {
                    continue;
                };
                match message {
                    LauncherMessage::Ready { url } => break url,
                    LauncherMessage::Error { message } => {
                        let _ = child.kill().await;
                        return Err(AppError::Other(format!("preview server failed: {message}")));
                    }
                }
            }
            None => {
                let _ = child.kill().await;
                return Err(AppError::Other(
                    "preview server exited before reporting readiness".into(),
                ));
            }
        }
    };

    // Keep draining stdout/stderr for the life of the server. Without this the
    // OS pipe buffer eventually fills and Vite blocks on its next write.
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut err_lines = BufReader::new(stderr).lines();
            while let Ok(Some(_)) = err_lines.next_line().await {}
        });
    }

    registry.insert(
        project_dir.to_path_buf(),
        RunningPreview {
            url: url.clone(),
            child,
        },
    );

    Ok(url)
}

pub async fn stop(app: &AppHandle, project_dir: &Path) -> AppResult<()> {
    if let Some(mut preview) = app.state::<PreviewRegistry>().take(project_dir) {
        let _ = preview.child.kill().await;
    }
    Ok(())
}

/// Called on app exit so quitting Weavr never leaves orphaned node processes.
pub fn stop_all_blocking(app: &AppHandle) {
    for mut preview in app.state::<PreviewRegistry>().take_all() {
        let _ = preview.child.start_kill();
    }
}
