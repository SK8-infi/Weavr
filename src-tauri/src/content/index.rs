//! Reverse index from rendered text back to the data field it came from.
//!
//! This is what makes click-to-edit possible without asking every conference
//! site to annotate its components: the site renders strings that must (by the
//! template's own contract) have come from a data file, so we can match a text
//! node's contents back to its source field.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;

use super::parser::{self, LeafRecord};

#[derive(Debug, Default)]
pub struct ContentIndex {
    leaves: Vec<LeafRecord>,
    by_value: HashMap<String, Vec<usize>>,
}

/// What a lookup produced. Ambiguity is reported rather than guessed at —
/// writing to the wrong field would silently corrupt unrelated content.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum LookupResult {
    Unique { leaf: LeafRecord },
    Ambiguous { candidates: Vec<LeafRecord> },
    NotFound,
}

impl ContentIndex {
    pub fn build(project_root: &Path) -> AppResult<Self> {
        Ok(Self::from_leaves(parser::parse_project(project_root)?))
    }

    pub fn from_leaves(leaves: Vec<LeafRecord>) -> Self {
        let mut by_value: HashMap<String, Vec<usize>> = HashMap::new();
        for (position, leaf) in leaves.iter().enumerate() {
            // Structural values (ids, routes, icon paths) are wiring, not
            // rendered copy — indexing them would let a heading that happens
            // to read "Chair" resolve to a section id.
            if leaf.is_structural || leaf.value.trim().is_empty() {
                continue;
            }
            by_value
                .entry(normalize(&leaf.value))
                .or_default()
                .push(position);
        }
        Self { leaves, by_value }
    }

    pub fn leaves(&self) -> &[LeafRecord] {
        &self.leaves
    }

    pub fn find_by_id(&self, id: &str) -> Option<&LeafRecord> {
        self.leaves.iter().find(|leaf| leaf.id() == id)
    }

    /// Looks up rendered text. `preferred_files` narrows candidates to the data
    /// files the currently-rendered page is known to read from, which is how
    /// most duplicate strings get resolved.
    pub fn lookup(&self, rendered_text: &str, preferred_files: &[String]) -> LookupResult {
        let key = normalize(rendered_text);
        let Some(positions) = self.by_value.get(&key) else {
            return LookupResult::NotFound;
        };

        let candidates: Vec<LeafRecord> =
            positions.iter().map(|i| self.leaves[i.clone()].clone()).collect();

        if candidates.len() == 1 {
            return LookupResult::Unique {
                leaf: candidates.into_iter().next().expect("length checked"),
            };
        }

        if !preferred_files.is_empty() {
            let narrowed: Vec<LeafRecord> = candidates
                .iter()
                .filter(|leaf| preferred_files.contains(&leaf.file))
                .cloned()
                .collect();
            if narrowed.len() == 1 {
                return LookupResult::Unique {
                    leaf: narrowed.into_iter().next().expect("length checked"),
                };
            }
            if !narrowed.is_empty() {
                return LookupResult::Ambiguous { candidates: narrowed };
            }
        }

        LookupResult::Ambiguous { candidates }
    }
}

/// Rendered HTML collapses whitespace, so compare on collapsed whitespace or
/// nothing in a data file that wraps across lines would ever match.
fn normalize(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index_from(source: &str) -> ContentIndex {
        ContentIndex::from_leaves(parser::parse_source("src/data/a.js", source).unwrap())
    }

    #[test]
    fn finds_a_unique_string() {
        let index = index_from(r#"export const d = { title: "Contact Us" };"#);
        match index.lookup("Contact Us", &[]) {
            LookupResult::Unique { leaf } => assert_eq!(leaf.json_path, "title"),
            other => panic!("expected unique, got {other:?}"),
        }
    }

    #[test]
    fn matches_across_collapsed_whitespace() {
        let index = index_from("export const d = { intro: \"one  two\\nthree\" };");
        assert!(matches!(
            index.lookup("one two three", &[]),
            LookupResult::Unique { .. }
        ));
    }

    #[test]
    fn reports_duplicates_instead_of_guessing() {
        let index = index_from(r#"export const d = { a: "Submit", b: "Submit" };"#);
        match index.lookup("Submit", &[]) {
            LookupResult::Ambiguous { candidates } => assert_eq!(candidates.len(), 2),
            other => panic!("expected ambiguous, got {other:?}"),
        }
    }

    #[test]
    fn indexes_nested_paths_and_array_elements() {
        let index = index_from(
            r#"export const d = { social: { email: "a@b.c" }, docs: [{ title: "One" }] };"#,
        );
        let paths: Vec<_> = index.leaves().iter().map(|l| l.json_path.clone()).collect();
        assert!(paths.contains(&"social.email".to_string()));
        assert!(paths.contains(&"docs[0].title".to_string()));
    }

    #[test]
    fn missing_text_is_not_found() {
        let index = index_from(r#"export const d = { title: "Contact Us" };"#);
        assert!(matches!(
            index.lookup("Nothing here", &[]),
            LookupResult::NotFound
        ));
    }

    /// Run against a real conference site to see what the index actually looks
    /// like on production data:
    ///   WEAVR_TEST_PROJECT=C:/Github/IATMSI cargo test real_project -- --nocapture
    #[test]
    fn reports_coverage_for_a_real_project() {
        let Ok(root) = std::env::var("WEAVR_TEST_PROJECT") else {
            eprintln!("skipped: set WEAVR_TEST_PROJECT to a conference site checkout");
            return;
        };

        let index = ContentIndex::build(Path::new(&root)).expect("project should parse");
        let total: usize = index.by_value.values().map(|p| p.len()).sum();
        assert!(total > 0, "expected to extract some editable strings");
        println!(
            "leaves parsed: {} (structural/empty excluded from matching: {})",
            index.leaves().len(),
            index.leaves().len() - total
        );

        let duplicated: usize = index
            .by_value
            .values()
            .filter(|positions| positions.len() > 1)
            .map(|positions| positions.len())
            .sum();

        let mut files: Vec<_> = index
            .leaves()
            .iter()
            .map(|l| l.file.clone())
            .collect::<std::collections::BTreeSet<_>>()
            .into_iter()
            .collect();
        files.sort();

        println!("editable strings: {total}");
        println!("across data files: {}", files.len());
        println!(
            "needing disambiguation: {duplicated} ({:.1}%)",
            (duplicated as f64 / total as f64) * 100.0
        );

        let mut worst: Vec<_> = index
            .by_value
            .iter()
            .filter(|(_, positions)| positions.len() > 1)
            .map(|(value, positions)| (positions.len(), value.clone()))
            .collect();
        worst.sort_by(|a, b| b.0.cmp(&a.0));
        println!("\nmost-duplicated values:");
        for (count, value) in worst.iter().take(15) {
            let preview: String = value.chars().take(60).collect();
            println!("  {count:>4}x  {preview:?}");
        }
    }
}
