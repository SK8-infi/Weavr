//! Docks the editor panel and the live preview side by side in one window.
//!
//! These are two real webviews, not an iframe: the preview is served from its
//! own localhost port, so an iframe would be cross-origin and Weavr could not
//! inject the click-to-edit bridge into it. Separate webviews each get their
//! own initialization script and their own capability grant.

use tauri::{
    AppHandle, LogicalPosition, LogicalSize, Manager, Webview, WebviewUrl, Window, WindowEvent,
};

use crate::error::{AppError, AppResult};

pub const WINDOW_LABEL: &str = "weavr";
pub const PANEL_LABEL: &str = "main";
pub const PREVIEW_LABEL: &str = "preview";

/// Width of the editing panel. The preview takes whatever is left, so the site
/// is always previewed at a realistic width.
const PANEL_WIDTH: f64 = 420.0;

pub fn window(app: &AppHandle) -> AppResult<Window> {
    app.get_window(WINDOW_LABEL)
        .ok_or_else(|| AppError::Other("main window is missing".into()))
}

fn logical_size(window: &Window) -> AppResult<(f64, f64)> {
    let scale = window.scale_factor().unwrap_or(1.0);
    let size = window
        .inner_size()
        .map_err(|e| AppError::Other(e.to_string()))?
        .to_logical::<f64>(scale);
    Ok((size.width, size.height))
}

/// Lays out whichever webviews currently exist.
pub fn apply(app: &AppHandle) -> AppResult<()> {
    let window = window(app)?;
    let (width, height) = logical_size(&window)?;

    let panel = app.get_webview(PANEL_LABEL);
    let preview = app.get_webview(PREVIEW_LABEL);

    match (panel, preview) {
        // Editing: panel on the left, preview filling the rest.
        (Some(panel), Some(preview)) => {
            let panel_width = PANEL_WIDTH.min(width);
            set_bounds(&panel, 0.0, 0.0, panel_width, height)?;
            set_bounds(
                &preview,
                panel_width,
                0.0,
                (width - panel_width).max(0.0),
                height,
            )?;
        }
        // Signing in / picking a repo: nothing to preview yet.
        (Some(panel), None) => set_bounds(&panel, 0.0, 0.0, width, height)?,
        _ => {}
    }

    Ok(())
}

fn set_bounds(webview: &Webview, x: f64, y: f64, width: f64, height: f64) -> AppResult<()> {
    webview
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| AppError::Other(e.to_string()))?;
    webview
        .set_size(LogicalSize::new(width.max(1.0), height.max(1.0)))
        .map_err(|e| AppError::Other(e.to_string()))?;
    Ok(())
}

/// Adds the preview webview beside the panel, or navigates it if it already
/// exists. Returns whether it was newly created, so the caller knows if an
/// initialization script has already run.
pub fn show_preview(app: &AppHandle, url: &str, init_script: &str) -> AppResult<bool> {
    let parsed: tauri::Url = url
        .parse()
        .map_err(|e| AppError::Other(format!("preview URL {url} was not valid: {e}")))?;

    if let Some(existing) = app.get_webview(PREVIEW_LABEL) {
        existing
            .navigate(parsed)
            .map_err(|e| AppError::Other(e.to_string()))?;
        apply(app)?;
        return Ok(false);
    }

    let window = window(app)?;
    let (width, height) = logical_size(&window)?;
    let panel_width = PANEL_WIDTH.min(width);

    let builder = tauri::webview::WebviewBuilder::new(
        PREVIEW_LABEL,
        WebviewUrl::External(parsed),
    )
    // Runs on every document in this webview, so the bridge survives
    // navigation between pages of the site.
    .initialization_script(init_script)
    // Push the value list from Rust after every page load rather than relying
    // only on the page announcing itself. Without this, the first page works
    // (preview_start pushes explicitly) but anything navigated to afterwards
    // silently comes up uneditable if the announcement doesn't get through.
    .on_page_load(|webview, payload| {
        if matches!(payload.event(), tauri::webview::PageLoadEvent::Finished) {
            let _ = crate::commands::preview_commands::push_editable_values(
                webview.app_handle(),
            );
        }
    });

    window
        .add_child(
            builder,
            LogicalPosition::new(panel_width, 0.0),
            LogicalSize::new((width - panel_width).max(1.0), height.max(1.0)),
        )
        .map_err(|e| AppError::Other(format!("could not open the preview: {e}")))?;

    apply(app)?;
    Ok(true)
}

pub fn hide_preview(app: &AppHandle) -> AppResult<()> {
    if let Some(preview) = app.get_webview(PREVIEW_LABEL) {
        let _ = preview.close();
    }
    apply(app)
}

/// Creates the window and the editing panel webview, and keeps the split
/// correct as the user resizes.
pub fn build(app: &AppHandle) -> AppResult<()> {
    let window = tauri::window::WindowBuilder::new(app, WINDOW_LABEL)
        .title("Weavr")
        .inner_size(1280.0, 800.0)
        .min_inner_size(960.0, 640.0)
        .build()
        .map_err(|e| AppError::Other(format!("could not create the window: {e}")))?;

    let (width, height) = logical_size(&window)?;

    window
        .add_child(
            tauri::webview::WebviewBuilder::new(
                PANEL_LABEL,
                WebviewUrl::App("index.html".into()),
            ),
            LogicalPosition::new(0.0, 0.0),
            LogicalSize::new(width, height),
        )
        .map_err(|e| AppError::Other(format!("could not create the editor panel: {e}")))?;

    let handle = app.clone();
    window.on_window_event(move |event| {
        if matches!(event, WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. }) {
            let _ = apply(&handle);
        }
    });

    Ok(())
}
