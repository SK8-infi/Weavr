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
    interval: Option<u64>,
}

pub async fn request_device_code(client: &reqwest::Client) -> AppResult<DeviceCode> {
    let response = client
        .post("https://github.com/login/device/code")
        .header("Accept", "application/json")
        .form(&[("client_id", GITHUB_CLIENT_ID), ("scope", GITHUB_SCOPE)])
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(AppError::GitHub(format!(
            "device code request failed with status {}",
            response.status()
        )));
    }

    Ok(response.json::<DeviceCode>().await?)
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
        Some(other) => Err(AppError::GitHub(format!("device flow error: {other}"))),
        None => Err(AppError::GitHub(
            "device flow response had neither a token nor an error".into(),
        )),
    }
}
