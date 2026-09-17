use std::path::Path;

use git2::build::RepoBuilder;
use git2::{Cred, FetchOptions, RemoteCallbacks};

use crate::error::AppResult;

/// Clones a repo authenticated with a GitHub OAuth token, using GitHub's
/// documented HTTPS-token convention (`x-access-token` as the username, the
/// token itself as the password). Runs synchronously — callers should invoke
/// this from a blocking task, not directly on an async runtime worker thread.
///
/// The full history is fetched, deliberately. A depth-1 clone is tempting for
/// a site nobody needs the history of, and it worked right up until the first
/// time someone else published: every question the sync code asks — how far
/// ahead or behind this copy is, which files an incoming commit touched —
/// walks from a commit to its parents, and in a shallow clone those parents
/// are simply absent. The failure is not a graceful one. git reports the
/// object database as broken and the panel fills with
/// `object not found - no match for id`.
///
/// These are conference websites: a few megabytes of history against a feature
/// that has to work every time two people edit the same site.
pub fn clone_repo(clone_url: &str, token: &str, dest: &Path) -> AppResult<()> {
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username_from_url, _allowed_types| {
        Cred::userpass_plaintext("x-access-token", &token)
    });

    let mut fetch_options = FetchOptions::new();
    fetch_options.remote_callbacks(callbacks);

    let mut builder = RepoBuilder::new();
    builder.fetch_options(fetch_options);
    builder.clone(clone_url, dest)?;

    Ok(())
}
