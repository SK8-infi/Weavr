use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

#[cfg(target_os = "windows")]
const PLATFORM_TRIPLE: &str = "win32-x64";

#[cfg(target_os = "windows")]
fn node_exe_name() -> &'static str {
    "node.exe"
}
#[cfg(not(target_os = "windows"))]
fn node_exe_name() -> &'static str {
    "node"
}

fn node_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(resource_dir.join("node").join(PLATFORM_TRIPLE))
}

pub fn node_binary(app: &AppHandle) -> AppResult<PathBuf> {
    let bin = node_dir(app)?.join(node_exe_name());
    if !bin.is_file() {
        return Err(AppError::Other(format!(
            "bundled Node runtime not found at {} — run `npm run fetch:node` before `tauri dev`/`tauri build`",
            bin.display()
        )));
    }
    Ok(bin)
}

pub fn npm_cli_script(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(node_dir(app)?
        .join("node_modules")
        .join("npm")
        .join("bin")
        .join("npm-cli.js"))
}

/// Puts the bundled Node on `PATH` for a child process.
///
/// npm runs each package's install scripts as separate processes, and those
/// commonly invoke `node` by name — esbuild, which Vite depends on, is one.
/// On a machine with no Node installed there is nothing on `PATH` to find, so
/// the bundled copy's directory is prepended. Prepended rather than appended
/// so a different Node already on the machine can't be picked up instead and
/// quietly change which version builds the site.
pub fn with_node_on_path(app: &AppHandle, command: &mut tokio::process::Command) -> AppResult<()> {
    let bin_dir = node_binary(app)?
        .parent()
        .ok_or_else(|| AppError::Other("bundled Node has no parent directory".into()))?
        .to_path_buf();

    let existing = std::env::var_os("PATH").unwrap_or_default();
    let mut entries = vec![bin_dir];
    entries.extend(std::env::split_paths(&existing));

    let joined = std::env::join_paths(entries)
        .map_err(|e| AppError::Other(format!("could not build PATH for Node: {e}")))?;
    command.env("PATH", joined);

    Ok(())
}
