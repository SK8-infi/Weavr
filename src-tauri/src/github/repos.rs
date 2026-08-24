use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const API_BASE: &str = "https://api.github.com";
const MAX_PAGES: u32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoSummary {
    pub id: u64,
    pub name: String,
    pub full_name: String,
    pub private: bool,
    pub default_branch: String,
    pub updated_at: String,
    pub clone_url: String,
    pub html_url: String,
    pub owner: RepoOwner,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoOwner {
    pub login: String,
    pub avatar_url: String,
}

pub async fn list_user_repos(http: &reqwest::Client, token: &str) -> AppResult<Vec<RepoSummary>> {
    let mut repos = Vec::new();
    let mut url = format!(
        "{API_BASE}/user/repos?affiliation=owner,collaborator&sort=updated&per_page=100"
    );

    for _ in 0..MAX_PAGES {
        let response = http
            .get(&url)
            .header("Authorization", format!("Bearer {token}"))
            .header("Accept", "application/vnd.github+json")
            .header("X-GitHub-Api-Version", "2022-11-28")
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(AppError::GitHub(format!(
                "listing repos failed with status {}",
                response.status()
            )));
        }

        let next_url = next_page_url(response.headers());
        let page: Vec<RepoSummary> = response.json().await?;
        let is_last_page = page.len() < 100;
        repos.extend(page);

        match next_url {
            Some(next) if !is_last_page => url = next,
            _ => break,
        }
    }

    Ok(repos)
}

/// Parses the RFC 5988 `Link` header GitHub sends for pagination, e.g.
/// `<https://api.github.com/user/repos?page=2>; rel="next", <...>; rel="last"`.
fn next_page_url(headers: &reqwest::header::HeaderMap) -> Option<String> {
    let link_header = headers.get(reqwest::header::LINK)?.to_str().ok()?;

    link_header.split(',').find_map(|part| {
        let mut segments = part.split(';');
        let url_segment = segments.next()?.trim();
        let is_next = segments.any(|s| s.trim() == "rel=\"next\"");
        if !is_next {
            return None;
        }
        url_segment
            .trim_start_matches('<')
            .trim_end_matches('>')
            .to_string()
            .into()
    })
}
