use std::collections::BTreeSet;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::content::index::ContentIndex;

/// The project currently open for editing.
pub struct ProjectSession {
    pub root: PathBuf,
    pub index: ContentIndex,
    /// Files Weavr itself has written this session. Publish stages exactly
    /// these — never `git add .` — so nothing the user didn't change through
    /// Weavr can ride along into a commit.
    pub edited_files: BTreeSet<String>,
}

impl ProjectSession {
    pub fn new(root: PathBuf, index: ContentIndex) -> Self {
        Self {
            root,
            index,
            edited_files: BTreeSet::new(),
        }
    }
}

pub struct AppState {
    pub http: reqwest::Client,
    pub session_token: Mutex<Option<String>>,
    pub project: Mutex<Option<ProjectSession>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent("weavr-app")
                .build()
                .expect("failed to build HTTP client"),
            session_token: Mutex::new(None),
            project: Mutex::new(None),
        }
    }
}
