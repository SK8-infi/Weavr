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
