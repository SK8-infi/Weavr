//! Committing and pushing a session's edits.
//!
//! Deliberately narrow: Weavr stages only the files it wrote itself, never
//! `git add .`. That keeps stray build output, lockfile churn, or anything
//! else in the working tree out of the professor's commit history.

use std::collections::BTreeSet;
use std::path::Path;

use git2::{Cred, PushOptions, RemoteCallbacks, Repository, Signature};
use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PublishOutcome {
    /// Pushed successfully.
    Published { commit: String, files: usize },
    /// Nothing to publish.
    NothingToDo,
    /// Someone else changed the same files. Stopping is the only safe move:
    /// merging two edits of one data field would silently discard one of them.
    RemoteDiverged { message: String },
}

pub fn credentials_callback(token: &str) -> RemoteCallbacks<'_> {
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username, _allowed| {
        Cred::userpass_plaintext("x-access-token", &token)
    });
    callbacks
}

/// Catches this copy up with the remote before committing on top of it.
///
/// Being behind is the normal state when several people share a site, and
/// almost always means somebody edited a different part of it. Those commits
/// are taken on board so this publish lands on top of them.
///
/// It stops only when the incoming work touches a file being edited here.
/// Two people rewriting the same field cannot be reconciled by a tool — a
/// textual merge would keep one and silently lose the other — so the person
/// editing is told, while their own changes are still safely in the file.
///
/// Returns `Some(outcome)` when publishing must not continue.
fn integrate_remote(
    repo: &Repository,
    branch: &str,
    files: &BTreeSet<String>,
) -> AppResult<Option<PublishOutcome>> {
    let local = repo.head()?.peel_to_commit()?.id();

    let Ok(remote_ref) = repo.find_reference(&format!("refs/remotes/origin/{branch}")) else {
        return Ok(None); // Branch doesn't exist upstream yet; the push creates it.
    };
    let remote_oid = remote_ref.peel_to_commit()?.id();
    if local == remote_oid {
        return Ok(None);
    }

    let (ahead, behind) = repo.graph_ahead_behind(local, remote_oid)?;
    if behind == 0 {
        return Ok(None); // Only ahead — nothing to take on board.
    }

    let incoming = super::sync::changed_files(repo, local, remote_oid)?;
    let clashes: Vec<String> = incoming.intersection(files).cloned().collect();
    if !clashes.is_empty() {
        return Ok(Some(PublishOutcome::RemoteDiverged {
            message: format!(
                "Someone else has already changed {} on GitHub. Your changes are \
                 still here and nothing was overwritten — get the latest, then \
                 re-apply yours.",
                super::sync::describe_files(&clashes)
            ),
        }));
    }

    if ahead > 0 {
        return Ok(Some(PublishOutcome::RemoteDiverged {
            message: "This copy has changes that never reached GitHub, and the \
                      site has moved on since. Get the latest to sort it out."
                .into(),
        }));
    }

    // Safe to fast-forward: nothing incoming touches what's being edited, so
    // the working copy keeps its unpublished edits.
    let remote_commit = repo.find_commit(remote_oid)?;
    let mut checkout = git2::build::CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(remote_commit.as_object(), Some(&mut checkout))?;
    repo.reference(
        &format!("refs/heads/{branch}"),
        remote_oid,
        true,
        "weavr: catch up before publishing",
    )?;
    repo.set_head(&format!("refs/heads/{branch}"))?;

    Ok(None)
}

/// Stages the given files, commits them, and pushes to origin.
pub fn publish(
    project_root: &Path,
    token: &str,
    files: &BTreeSet<String>,
    message: &str,
    author_name: &str,
    author_email: &str,
) -> AppResult<PublishOutcome> {
    if files.is_empty() {
        return Ok(PublishOutcome::NothingToDo);
    }

    let repo = Repository::open(project_root)?;
    let branch = current_branch(&repo)?;

    // Fetch first so the divergence check sees the real remote state rather
    // than a stale local copy of it.
    let mut remote = repo.find_remote("origin")?;
    let mut fetch_options = git2::FetchOptions::new();
    fetch_options.remote_callbacks(credentials_callback(token));
    remote.fetch(&[branch.as_str()], Some(&mut fetch_options), None)?;

    // Someone else may have published since this copy was last synced. Their
    // work usually touches different files, so take it on board and carry on
    // rather than stopping for something that doesn't actually conflict.
    if let Some(blocked) = integrate_remote(&repo, &branch, files)? {
        return Ok(blocked);
    }

    let mut index = repo.index()?;
    let mut staged = 0usize;
    for file in files {
        let path = Path::new(file);
        if project_root.join(path).is_file() {
            index.add_path(path)?;
            staged += 1;
        }
    }
    if staged == 0 {
        return Ok(PublishOutcome::NothingToDo);
    }
    index.write()?;

    let tree = repo.find_tree(index.write_tree()?)?;
    let parent = repo.head()?.peel_to_commit()?;

    // Nothing actually changed relative to HEAD (the user typed a value back
    // to what it already was), so don't create an empty commit.
    if tree.id() == parent.tree()?.id() {
        return Ok(PublishOutcome::NothingToDo);
    }

    let signature = Signature::now(author_name, author_email)?;
    let commit_oid = repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        message,
        &tree,
        &[&parent],
    )?;

    let mut push_options = PushOptions::new();
    push_options.remote_callbacks(credentials_callback(token));
    remote
        .push(
            &[format!("refs/heads/{branch}:refs/heads/{branch}")],
            Some(&mut push_options),
        )
        .map_err(|e| AppError::Other(format!("could not publish to GitHub: {e}")))?;

    Ok(PublishOutcome::Published {
        commit: commit_oid.to_string(),
        files: staged,
    })
}

fn current_branch(repo: &Repository) -> AppResult<String> {
    let head = repo.head()?;
    head.shorthand()
        .map(|s| s.to_string())
        .ok_or_else(|| AppError::Other("could not determine the current branch".into()))
}

/// Builds a commit message in the convention the conference template itself
/// documents: `content(<domain>): ...` for copy changes.
pub fn commit_message(files: &BTreeSet<String>) -> String {
    let domains: BTreeSet<String> = files
        .iter()
        .filter_map(|file| {
            let stem = Path::new(file).file_stem()?.to_str()?;
            Some(stem.trim_end_matches("Data").to_lowercase())
        })
        .collect();

    let scope = match domains.len() {
        0 => "site".to_string(),
        1..=2 => domains.iter().cloned().collect::<Vec<_>>().join(", "),
        _ => "site".to_string(),
    };

    let summary = if files.len() == 1 {
        "update site content".to_string()
    } else {
        format!("update site content across {} files", files.len())
    };

    format!("content({scope}): {summary}\n\nEdited with Weavr.")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn files(paths: &[&str]) -> BTreeSet<String> {
        paths.iter().map(|p| p.to_string()).collect()
    }

    /// A bare "remote" plus a working clone with one committed data file.
    fn scratch_repo() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let remote_path = dir.path().join("remote.git");
        let work_path = dir.path().join("work");

        Repository::init_bare(&remote_path).expect("init bare");

        let repo = Repository::init(&work_path).expect("init work");
        repo.remote("origin", remote_path.to_str().unwrap())
            .expect("add remote");

        std::fs::create_dir_all(work_path.join("src/data")).expect("mkdir");
        std::fs::write(
            work_path.join("src/data/contactData.js"),
            "export const contactData = { title: \"Original\" };\n",
        )
        .expect("write");

        let signature = Signature::now("Test", "test@example.com").expect("signature");
        let mut index = repo.index().expect("index");
        index
            .add_path(Path::new("src/data/contactData.js"))
            .expect("add");
        index.write().expect("write index");
        let tree = repo.find_tree(index.write_tree().expect("tree")).expect("find tree");
        repo.commit(Some("HEAD"), &signature, &signature, "initial", &tree, &[])
            .expect("commit");

        let branch = repo.head().unwrap().shorthand().unwrap().to_string();
        repo.find_remote("origin")
            .unwrap()
            .push(
                &[format!("refs/heads/{branch}:refs/heads/{branch}")],
                None,
            )
            .expect("seed push");

        (dir, work_path, remote_path)
    }

    #[test]
    fn publishes_only_the_files_weavr_edited() {
        let (_guard, work, remote) = scratch_repo();

        // One file Weavr edited, plus untracked junk it must ignore.
        std::fs::write(
            work.join("src/data/contactData.js"),
            "export const contactData = { title: \"Changed\" };\n",
        )
        .unwrap();
        std::fs::write(work.join("stray-notes.txt"), "should never be committed").unwrap();

        let outcome = publish(
            &work,
            "unused-for-local-remote",
            &files(&["src/data/contactData.js"]),
            "content(contact): update",
            "Test",
            "test@example.com",
        )
        .expect("publish should succeed");

        let commit = match outcome {
            PublishOutcome::Published { commit, files } => {
                assert_eq!(files, 1);
                commit
            }
            other => panic!("expected a publish, got {other:?}"),
        };

        // The commit must exist on the remote and contain only our file.
        let remote_repo = Repository::open_bare(&remote).unwrap();
        let pushed = remote_repo
            .find_commit(commit.parse().unwrap())
            .expect("commit should have reached the remote");
        let tree = pushed.tree().unwrap();
        assert!(tree.get_path(Path::new("src/data/contactData.js")).is_ok());
        assert!(
            tree.get_path(Path::new("stray-notes.txt")).is_err(),
            "untracked files must never ride along into a publish"
        );
    }

    #[test]
    fn reports_nothing_to_do_when_content_is_unchanged() {
        let (_guard, work, _remote) = scratch_repo();

        // File listed as edited, but its contents match what's committed.
        let outcome = publish(
            &work,
            "token",
            &files(&["src/data/contactData.js"]),
            "content(contact): update",
            "Test",
            "test@example.com",
        )
        .expect("publish should succeed");

        assert!(
            matches!(outcome, PublishOutcome::NothingToDo),
            "an unchanged file must not create an empty commit, got {outcome:?}"
        );
    }

    #[test]
    fn absorbs_an_upstream_commit_that_touches_nothing_local() {
        let (_guard, work, remote) = scratch_repo();

        // Someone else pushed, but not to anything being edited here. Sharing
        // a site means being behind constantly, so this has to go through
        // rather than stop — the conflicting case is covered separately, in
        // git::sync's two-clone tests.
        {
            let remote_repo = Repository::open_bare(&remote).unwrap();
            let head = remote_repo.head().unwrap().peel_to_commit().unwrap();
            let signature = Signature::now("Someone", "other@example.com").unwrap();
            remote_repo
                .commit(
                    Some("HEAD"),
                    &signature,
                    &signature,
                    "edited on github",
                    &head.tree().unwrap(),
                    &[&head],
                )
                .unwrap();
        }

        std::fs::write(
            work.join("src/data/contactData.js"),
            "export const contactData = { title: \"Local change\" };\n",
        )
        .unwrap();

        let outcome = publish(
            &work,
            "token",
            &files(&["src/data/contactData.js"]),
            "content(contact): update",
            "Test",
            "test@example.com",
        )
        .expect("publish should return an outcome rather than erroring");

        assert!(
            matches!(outcome, PublishOutcome::Published { .. }),
            "an unrelated upstream commit must not block publishing, got {outcome:?}"
        );
    }

    #[test]
    fn names_the_domain_for_a_single_file() {
        let message = commit_message(&files(&["src/data/committeeData.js"]));
        assert!(message.starts_with("content(committee): update site content"));
    }

    #[test]
    fn lists_two_domains_but_generalises_beyond_that() {
        let two = commit_message(&files(&[
            "src/data/committeeData.js",
            "src/data/tracksData.js",
        ]));
        assert!(two.starts_with("content(committee, tracks):"), "{two}");

        let many = commit_message(&files(&[
            "src/data/committeeData.js",
            "src/data/tracksData.js",
            "src/data/contactData.js",
        ]));
        assert!(many.starts_with("content(site):"), "{many}");
        assert!(many.contains("across 3 files"));
    }
}
