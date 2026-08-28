//! Keeping a local copy in step with the shared repository.
//!
//! Several people edit the same conference site, each from their own machine,
//! so a local clone drifts behind as soon as someone else publishes. This is
//! the "get everyone else's changes" half; `push` is the other half.
//!
//! Everything here is deliberately conservative: fast-forward when that's
//! provably safe, and otherwise stop with something the user can act on. A
//! wrong automatic merge of a data file would silently rewrite somebody's
//! work, which is far worse than being told to publish first.

use std::collections::BTreeSet;
use std::path::Path;

use git2::{build::CheckoutBuilder, Repository};
use serde::Serialize;

use crate::error::{AppError, AppResult};

use super::push::credentials_callback;

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatus {
    pub branch: String,
    /// Local commits the remote hasn't got.
    pub ahead: usize,
    /// Remote commits not yet pulled — "updates available".
    pub behind: usize,
    /// Files Weavr has written but not published.
    pub uncommitted: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum PullOutcome {
    AlreadyUpToDate,
    Updated {
        commits: usize,
        files: Vec<String>,
    },
    /// Stopped on purpose, with the reason phrased for the person editing.
    Blocked {
        message: String,
    },
}

pub fn current_branch(repo: &Repository) -> AppResult<String> {
    repo.head()?
        .shorthand()
        .map(str::to_string)
        .ok_or_else(|| AppError::Other("could not work out the current branch".into()))
}

/// Downloads the remote's latest state without touching the working copy.
pub fn fetch(repo: &Repository, token: &str, branch: &str) -> AppResult<()> {
    let mut remote = repo.find_remote("origin")?;
    let mut options = git2::FetchOptions::new();
    options.remote_callbacks(credentials_callback(token));
    remote.fetch(&[branch], Some(&mut options), None)?;
    Ok(())
}

fn remote_head(repo: &Repository, branch: &str) -> AppResult<Option<git2::Oid>> {
    match repo.find_reference(&format!("refs/remotes/origin/{branch}")) {
        Ok(reference) => Ok(Some(reference.peel_to_commit()?.id())),
        Err(_) => Ok(None),
    }
}

/// Paths with local modifications, ignoring anything git is set to ignore.
fn dirty_paths(repo: &Repository) -> AppResult<BTreeSet<String>> {
    let mut options = git2::StatusOptions::new();
    options.include_untracked(true).include_ignored(false);

    let mut paths = BTreeSet::new();
    for entry in repo.statuses(Some(&mut options))?.iter() {
        if let Some(path) = entry.path() {
            paths.insert(path.to_string());
        }
    }
    Ok(paths)
}

pub fn status(project_root: &Path, token: Option<&str>) -> AppResult<SyncStatus> {
    let repo = Repository::open(project_root)?;
    let branch = current_branch(&repo)?;

    // Without a fetch, "behind" only reflects the last time we looked.
    if let Some(token) = token {
        let _ = fetch(&repo, token, &branch);
    }

    let local = repo.head()?.peel_to_commit()?.id();
    let (ahead, behind) = match remote_head(&repo, &branch)? {
        Some(remote) => repo.graph_ahead_behind(local, remote)?,
        None => (0, 0),
    };

    Ok(SyncStatus {
        branch,
        ahead,
        behind,
        uncommitted: dirty_paths(&repo)?.len(),
    })
}

/// Brings in whatever others have published.
///
/// Only ever fast-forwards. If local commits exist the publish path handles
/// integrating them, and if the incoming changes touch a file being edited
/// here, the pull stops rather than overwriting unpublished work.
pub fn pull(project_root: &Path, token: &str) -> AppResult<PullOutcome> {
    let repo = Repository::open(project_root)?;
    let branch = current_branch(&repo)?;

    fetch(&repo, token, &branch)?;

    let Some(remote_oid) = remote_head(&repo, &branch)? else {
        return Ok(PullOutcome::Blocked {
            message: format!("This site has no '{branch}' branch on GitHub yet."),
        });
    };

    let local_oid = repo.head()?.peel_to_commit()?.id();
    if local_oid == remote_oid {
        return Ok(PullOutcome::AlreadyUpToDate);
    }

    let (ahead, behind) = repo.graph_ahead_behind(local_oid, remote_oid)?;
    if behind == 0 {
        return Ok(PullOutcome::AlreadyUpToDate);
    }
    if ahead > 0 {
        return Ok(PullOutcome::Blocked {
            message: "You have changes that aren't on GitHub yet. Publish them \
                      first, then get the latest."
                .into(),
        });
    }

    // Which files the incoming commits change.
    let incoming = changed_files(&repo, local_oid, remote_oid)?;

    // Refuse if any of those is also being edited here — a checkout would
    // discard the edit with no way to get it back.
    let dirty = dirty_paths(&repo)?;
    let clashes: Vec<String> = incoming.intersection(&dirty).cloned().collect();
    if !clashes.is_empty() {
        return Ok(PullOutcome::Blocked {
            message: format!(
                "Someone else changed {} you're editing. Publish your changes \
                 first, then get the latest.",
                describe_files(&clashes)
            ),
        });
    }

    // Safe to fast-forward: move the branch and update the working copy.
    let remote_commit = repo.find_commit(remote_oid)?;
    let mut checkout = CheckoutBuilder::new();
    checkout.safe();
    repo.checkout_tree(remote_commit.as_object(), Some(&mut checkout))?;
    repo.reference(
        &format!("refs/heads/{branch}"),
        remote_oid,
        true,
        "weavr: get latest",
    )?;
    repo.set_head(&format!("refs/heads/{branch}"))?;

    Ok(PullOutcome::Updated {
        commits: behind,
        files: incoming.into_iter().collect(),
    })
}

/// Files that differ between two commits.
pub fn changed_files(
    repo: &Repository,
    from: git2::Oid,
    to: git2::Oid,
) -> AppResult<BTreeSet<String>> {
    let from_tree = repo.find_commit(from)?.tree()?;
    let to_tree = repo.find_commit(to)?.tree()?;
    let diff = repo.diff_tree_to_tree(Some(&from_tree), Some(&to_tree), None)?;

    let mut files = BTreeSet::new();
    diff.foreach(
        &mut |delta, _| {
            for path in [delta.new_file().path(), delta.old_file().path()]
                .into_iter()
                .flatten()
            {
                files.insert(path.to_string_lossy().to_string());
            }
            true
        },
        None,
        None,
        None,
    )?;
    Ok(files)
}

/// "committeeData.js", or "3 files" once a list stops being readable.
pub fn describe_files(paths: &[String]) -> String {
    let names: Vec<&str> = paths
        .iter()
        .map(|p| p.rsplit('/').next().unwrap_or(p))
        .collect();

    match names.len() {
        0 => "nothing".to_string(),
        1 => names[0].to_string(),
        2 => format!("{} and {}", names[0], names[1]),
        n => format!("{n} files"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;


    /// A bare "remote" plus two clones — the shape of two people editing one
    /// site from their own machines.
    fn two_clones() -> (tempfile::TempDir, std::path::PathBuf, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let remote = dir.path().join("remote.git");
        Repository::init_bare(&remote).unwrap();

        let seed = dir.path().join("seed");
        let repo = Repository::init(&seed).unwrap();
        repo.remote("origin", remote.to_str().unwrap()).unwrap();
        std::fs::create_dir_all(seed.join("src/data")).unwrap();
        std::fs::write(seed.join("src/data/a.js"), "export const a = { t: \"one\" };
").unwrap();
        std::fs::write(seed.join("src/data/b.js"), "export const b = { t: \"two\" };
").unwrap();

        let sig = git2::Signature::now("Seed", "seed@example.com").unwrap();
        let mut index = repo.index().unwrap();
        index.add_path(Path::new("src/data/a.js")).unwrap();
        index.add_path(Path::new("src/data/b.js")).unwrap();
        index.write().unwrap();
        let tree = repo.find_tree(index.write_tree().unwrap()).unwrap();
        repo.commit(Some("HEAD"), &sig, &sig, "initial", &tree, &[]).unwrap();
        let branch = repo.head().unwrap().shorthand().unwrap().to_string();
        repo.find_remote("origin")
            .unwrap()
            .push(&[format!("refs/heads/{branch}:refs/heads/{branch}")], None)
            .unwrap();

        let alice = dir.path().join("alice");
        let bob = dir.path().join("bob");
        Repository::clone(remote.to_str().unwrap(), &alice).unwrap();
        Repository::clone(remote.to_str().unwrap(), &bob).unwrap();
        (dir, alice, bob)
    }

    /// Publishes an edit from one clone, the way the app does.
    fn publish_from(root: &Path, file: &str, contents: &str) {
        std::fs::write(root.join(file), contents).unwrap();
        let files: BTreeSet<String> = [file.to_string()].into_iter().collect();
        let outcome = crate::git::push::publish(
            root, "unused-for-local-remote", &files, "content: edit", "T", "t@example.com",
        )
        .unwrap();
        assert!(
            matches!(outcome, crate::git::push::PublishOutcome::Published { .. }),
            "seeding publish failed: {outcome:?}"
        );
    }

    #[test]
    fn pull_brings_in_a_colleagues_changes() {
        let (_g, alice, bob) = two_clones();
        publish_from(&alice, "src/data/a.js", "export const a = { t: \"alice\" };
");

        let before = status(&bob, None).unwrap();
        assert_eq!(before.behind, 0, "bob hasn't fetched yet");

        match pull(&bob, "token").unwrap() {
            PullOutcome::Updated { commits, .. } => assert_eq!(commits, 1),
            other => panic!("expected an update, got {other:?}"),
        }

        let text = std::fs::read_to_string(bob.join("src/data/a.js")).unwrap();
        assert!(text.contains("alice"), "bob should now have alice's edit");
        assert_eq!(status(&bob, None).unwrap().behind, 0);
    }

    #[test]
    fn pull_is_a_no_op_when_nothing_changed() {
        let (_g, _alice, bob) = two_clones();
        assert!(matches!(
            pull(&bob, "token").unwrap(),
            PullOutcome::AlreadyUpToDate
        ));
    }

    #[test]
    fn pull_refuses_to_overwrite_an_edit_in_progress() {
        let (_g, alice, bob) = two_clones();
        publish_from(&alice, "src/data/a.js", "export const a = { t: \"alice\" };
");

        // Bob is mid-edit in the same file, not yet published.
        std::fs::write(bob.join("src/data/a.js"), "export const a = { t: \"bob\" };
").unwrap();

        match pull(&bob, "token").unwrap() {
            PullOutcome::Blocked { message } => assert!(message.contains("a.js"), "{message}"),
            other => panic!("expected to be blocked, got {other:?}"),
        }
        // Bob's unpublished work must still be there.
        let text = std::fs::read_to_string(bob.join("src/data/a.js")).unwrap();
        assert!(text.contains("bob"));
    }

    #[test]
    fn publishing_takes_on_a_colleagues_work_when_it_does_not_overlap() {
        let (_g, alice, bob) = two_clones();
        publish_from(&alice, "src/data/a.js", "export const a = { t: \"alice\" };
");

        // Bob edits a different file and publishes without pulling first.
        publish_from(&bob, "src/data/b.js", "export const b = { t: \"bob\" };
");

        // Both edits survive, and bob's copy carries alice's too.
        let a = std::fs::read_to_string(bob.join("src/data/a.js")).unwrap();
        let b = std::fs::read_to_string(bob.join("src/data/b.js")).unwrap();
        assert!(a.contains("alice"), "alice's edit should have been merged in");
        assert!(b.contains("bob"));
    }

    #[test]
    fn publishing_stops_when_both_edited_the_same_file() {
        let (_g, alice, bob) = two_clones();
        publish_from(&alice, "src/data/a.js", "export const a = { t: \"alice\" };
");

        std::fs::write(bob.join("src/data/a.js"), "export const a = { t: \"bob\" };
").unwrap();
        let files: BTreeSet<String> = ["src/data/a.js".to_string()].into_iter().collect();
        let outcome = crate::git::push::publish(
            &bob, "token", &files, "content: bob", "B", "b@example.com",
        )
        .unwrap();

        match outcome {
            crate::git::push::PublishOutcome::RemoteDiverged { message } => {
                assert!(message.contains("a.js"), "{message}");
            }
            other => panic!("expected to stop on a real conflict, got {other:?}"),
        }
        // Nothing of bob's was thrown away.
        let text = std::fs::read_to_string(bob.join("src/data/a.js")).unwrap();
        assert!(text.contains("bob"));
    }

    #[test]
    fn describes_a_short_list_by_name_and_a_long_one_by_count() {
        assert_eq!(describe_files(&[]), "nothing");
        assert_eq!(
            describe_files(&["src/data/committeeData.js".into()]),
            "committeeData.js"
        );
        assert_eq!(
            describe_files(&["a/one.js".into(), "b/two.js".into()]),
            "one.js and two.js"
        );
        assert_eq!(
            describe_files(&["a.js".into(), "b.js".into(), "c.js".into()]),
            "3 files"
        );
    }
}
