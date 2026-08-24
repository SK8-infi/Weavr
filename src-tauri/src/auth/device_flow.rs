use serde::Deserialize;

use crate::error::{AppError, AppResult};

use super::{GITHUB_CLIENT_ID, GITHUB_SCOPE};

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub struct DeviceCode {
    pub device_code: String,
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
    pub interval: u64,
}

#[derive(Debug)]
pub enum PollOutcome {
    AccessToken(String),
    AuthorizationPending,
    SlowDown { new_interval: u64 },
    ExpiredToken,
    AccessDenied,
}

#[derive(Debug, Deserialize)]
struct TokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
    interval: Option<u64>,
}

/// GitHub reports device-flow problems in the response body, not the status
/// line — a bare "status 400" hides the actual reason (app misconfigured,
/// device flow switched off, unknown client id), so always surface the body.
#[derive(Debug, Deserialize)]
struct ErrorResponse {
    error: Option<String>,
    error_description: Option<String>,
}

fn describe_error(body: &str, status: reqwest::StatusCode) -> String {
    match serde_json::from_str::<ErrorResponse>(body) {
        Ok(parsed) => match (parsed.error_description, parsed.error) {
            (Some(description), Some(code)) => format!("{description} ({code})"),
            (Some(description), None) => description,
            (None, Some(code)) => code,
            (None, None) => format!("GitHub returned {status}"),
        },
        Err(_) => format!("GitHub returned {status}: {body}"),
    }
}

pub async fn request_device_code(client: &reqwest::Client) -> AppResult<DeviceCode> {
    let response = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", GITHUB_SCOPE)])
        .send()
        .await?;

    let status = response.status();
    let body = response.text().await?;

    if !status.is_success() {
        return Err(AppError::GitHub(describe_error(&body, status)));
    }

    // A 200 can still carry an error (e.g. device flow disabled), so check the
    // body before trying to read a device code out of it.
    if let Ok(parsed) = serde_json::from_str::<ErrorResponse>(&body) {
        if parsed.error.is_some() {
            return Err(AppError::GitHub(describe_error(&body, status)));
        }
    }

    serde_json::from_str::<DeviceCode>(&body)
        .map_err(|e| AppError::GitHub(format!("unexpected response from GitHub: {e}")))
}

pub async fn poll_once(client: &reqwest::Client, device_code: &str) -> AppResult<PollOutcome> {
    let response = client
        .post("https://github.com/login/oauth/access_token")
        .header("Accept", "application/json")
        .form(&[
            ("client_id", GITHUB_CLIENT_ID),
            ("device_code", device_code),
            ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
        ])
        .send()
        .await?;

    let body: TokenResponse = response.json().await?;

    if let Some(token) = body.access_token {
        return Ok(PollOutcome::AccessToken(token));
    }

    match body.error.as_deref() {
        Some("authorization_pending") => Ok(PollOutcome::AuthorizationPending),
        Some("slow_down") => Ok(PollOutcome::SlowDown {
            new_interval: body.interval.unwrap_or(5),
        }),
        Some("expired_token") => Ok(PollOutcome::ExpiredToken),
        Some("access_denied") => Ok(PollOutcome::AccessDenied),
        Some(other) => Err(AppError::GitHub(
            body.error_description
                .unwrap_or_else(|| format!("device flow error: {other}")),
        )),
        None => Err(AppError::GitHub(
            "device flow response had neither a token nor an error".into(),
        )),
    }
}
