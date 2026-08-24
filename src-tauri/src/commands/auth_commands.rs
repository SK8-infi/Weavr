use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::auth::{device_flow, keychain};
use crate::error::{AppError, AppResult};
use crate::github::client::{self, GitHubUser};
use crate::state::AppState;

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status")]
enum AuthCompleteEvent {
    #[serde(rename = "success")]
    Success { user: GitHubUser },
    #[serde(rename = "denied")]
    Denied,
    #[serde(rename = "expired")]
    Expired,
    #[serde(rename = "error")]
    Error { message: String },
}

/// Starts a device-flow login: fetches the user_code/verification_uri to show
/// immediately, then polls for completion in the background and emits
/// "auth://complete" on the app handle once the user approves (or the flow
/// ends some other way). The frontend renders the code, waits for the event.
#[tauri::command]
pub async fn auth_start(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<device_flow::DeviceCode> {
    let code = device_flow::request_device_code(&state.http).await?;

    let http = state.http.clone();
    let device_code = code.device_code.clone();
    let mut interval_secs = code.interval;
    let expires_in = code.expires_in;

    tauri::async_runtime::spawn(async move {
        let outcome = poll_until_done(&http, &device_code, &mut interval_secs, expires_in).await;
        let event = match outcome {
            Ok(token) => match finalize_session(&app, &token).await {
                Ok(user) => AuthCompleteEvent::Success { user },
                Err(err) => AuthCompleteEvent::Error {
                    message: err.to_string(),
                },
            },
            Err(PollLoopError::Expired) => AuthCompleteEvent::Expired,
            Err(PollLoopError::Denied) => AuthCompleteEvent::Denied,
            Err(PollLoopError::Other(err)) => AuthCompleteEvent::Error {
                message: err.to_string(),
            },
        };
        let _ = app.emit("auth://complete", event);
    });

    Ok(code)
}

enum PollLoopError {
    Expired,
    Denied,
    Other(AppError),
}

async fn poll_until_done(
    http: &reqwest::Client,
    device_code: &str,
    interval_secs: &mut u64,
    expires_in: u64,
) -> Result<String, PollLoopError> {
    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(expires_in);

    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(*interval_secs)).await;

        if tokio::time::Instant::now() >= deadline {
            return Err(PollLoopError::Expired);
        }

        match device_flow::poll_once(http, device_code).await {
            Ok(device_flow::PollOutcome::AccessToken(token)) => return Ok(token),
            Ok(device_flow::PollOutcome::AuthorizationPending) => continue,
            Ok(device_flow::PollOutcome::SlowDown { new_interval }) => {
                *interval_secs = new_interval;
                continue;
            }
            Ok(device_flow::PollOutcome::ExpiredToken) => return Err(PollLoopError::Expired),
            Ok(device_flow::PollOutcome::AccessDenied) => return Err(PollLoopError::Denied),
            Err(err) => return Err(PollLoopError::Other(err)),
        }
    }
}

async fn finalize_session(app: &AppHandle, token: &str) -> AppResult<GitHubUser> {
    let state = app.state::<AppState>();
    let user = client::get_authenticated_user(&state.http, token).await?;
    keychain::store_token(token)?;
    *state.session_token.lock().unwrap() = Some(token.to_string());
    Ok(user)
}

/// Called once on app startup to silently resume an existing session, if any.
#[tauri::command]
pub async fn auth_check_session(state: State<'_, AppState>) -> AppResult<Option<GitHubUser>> {
    let Some(token) = keychain::load_token()? else {
        return Ok(None);
    };

    match client::get_authenticated_user(&state.http, &token).await {
        Ok(user) => {
            *state.session_token.lock().unwrap() = Some(token);
            Ok(Some(user))
        }
        Err(_) => {
            // Token is no longer valid (revoked/expired) — clear it so we
            // don't keep failing silently on every future launch.
            keychain::delete_token()?;
            Ok(None)
        }
    }
}

#[tauri::command]
pub async fn auth_sign_out(state: State<'_, AppState>) -> AppResult<()> {
    keychain::delete_token()?;
    *state.session_token.lock().unwrap() = None;
    Ok(())
}
