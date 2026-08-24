use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const API_BASE: &str = "https://api.github.com";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubUser {
    pub login: String,
    pub name: Option<String>,
    pub avatar_url: String,
}

async fn authenticated_get(
    http: &reqwest::Client,
    token: &str,
    path: &str,
) -> AppResult<reqwest::Response> {
    let response = http
        .get(format!("{API_BASE}{path}"))
        .header("Authorization", format!("Bearer {token}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await?;

    if !response.status().is_success() {
        return Err(AppError::GitHub(format!(
            "GitHub API request to {path} failed with status {}",
            response.status()
        )));
    }

    Ok(response)
}

pub async fn get_authenticated_user(http: &reqwest::Client, token: &str) -> AppResult<GitHubUser> {
    let response = authenticated_get(http, token, "/user").await?;
    Ok(response.json::<GitHubUser>().await?)
}
