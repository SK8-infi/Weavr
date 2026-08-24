use std::path::Path;

use git2::build::RepoBuilder;
use git2::{Cred, FetchOptions, RemoteCallbacks};

use crate::error::AppResult;

/// Shallow-clones a repo authenticated with a GitHub OAuth token, using
/// GitHub's documented HTTPS-token convention (`x-access-token` as the
/// username, the token itself as the password). Runs synchronously — callers
/// should invoke this from a blocking task, not directly on an async runtime
/// worker thread.
pub fn clone_repo(clone_url: &str, token: &str, dest: &Path) -> AppResult<()> {
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        Cred::userpass_plaintext("x-access-token", &token)
    });

    let mut fetch_options = FetchOptions::new();
    fetch_options.depth(1);
    fetch_options.remote_callbacks(callbacks);

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);
    builder.clone(clone_url, dest)?;

    Ok(())
}
