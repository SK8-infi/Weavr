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
    /// The remote moved on independently — we stop rather than risk a merge
    /// our surgical editor can't reason about.
    RemoteDiverged { message: String },
}

fn credentials_callback(token: &str) -> RemoteCallbacks<'_> {
    let token = token.to_string();
    let mut callbacks = RemoteCallbacks::new();
    callbacks.credentials(move |_url, _username, _allowed| {
        Cred::userpass_plaintext("x-access-token", &token)
    });
    callbacks
}

/// Compares the local branch against its remote counterpart.
enum RemoteState {
    UpToDate,
    LocalAhead,
    Diverged,
    NoRemoteBranch,
}

fn compare_with_remote(repo: &Repository, branch: &str) -> AppResult<RemoteState> {
    let local = repo.head()?.peel_to_commit()?.id();

    let remote_ref = format!("refs/remotes/origin/{branch}");
    let Ok(remote) = repo.find_reference(&remote_ref) else {
        return Ok(RemoteState::NoRemoteBranch);
    };
    let remote_oid = remote.peel_to_commit()?.id();

    if local == remote_oid {
        return Ok(RemoteState::UpToDate);
    }

    let (ahead, behind) = repo.graph_ahead_behind(local, remote_oid)?;
    Ok(match (ahead, behind) {
        (_, 0) => RemoteState::LocalAhead,
        _ => RemoteState::Diverged,
    })
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

    if let RemoteState::Diverged = compare_with_remote(&repo, &branch)? {
        return Ok(PublishOutcome::RemoteDiverged {
            message: "Your site on GitHub has changes Weavr didn't make. \
                      Publishing was stopped so nothing gets overwritten."
                .into(),
        });
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
    fn stops_instead_of_merging_when_the_remote_moved_on() {
        let (_guard, work, remote) = scratch_repo();

        // Someone edits the site directly on GitHub: add a commit to the
        // remote that the local clone has never seen.
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
            matches!(outcome, PublishOutcome::RemoteDiverged { .. }),
            "diverged remote must stop the publish, got {outcome:?}"
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
