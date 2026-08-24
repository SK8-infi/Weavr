use std::sync::Mutex;

pub struct AppState {
    pub http: reqwest::Client,
    pub session_token: Mutex<Option<String>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .user_agent("weavr-app")
                .build()
                .expect("failed to build HTTP client"),
            session_token: Mutex::new(None),
        }
    }
}
