use serde::Serialize;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("network request failed: {0}")]
    Network(#[from] reqwest::Error),
    #[error("GitHub API error: {0}")]
    GitHub(String),
    #[error("credential store error: {0}")]
    Keychain(#[from] keyring::Error),
    #[error("not signed in")]
    NotAuthenticated,
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
