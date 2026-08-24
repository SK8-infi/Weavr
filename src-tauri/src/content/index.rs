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

/// A rendered string and the single data field it came from.
#[derive(Debug, Clone, Serialize)]
pub struct ResolvedValue {
    pub value: String,
    pub field_id: String,
}

/// One candidate field for a rendered string.
#[derive(Debug, Clone, Serialize)]
pub struct Candidate {
    pub field_id: String,
    /// Data file stem ("conferenceData"), matched against a section's
    /// declared `data-weavr-source` to break ties.
    pub source: String,
}

/// A rendered string together with every field it could have come from.
#[derive(Debug, Clone, Serialize)]
pub struct ValueCandidates {
    pub value: String,
    pub fields: Vec<Candidate>,
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

    /// Values that identify exactly one field, ready to hand to the preview's
    /// click-to-edit bridge.
    ///
    /// Ambiguous text is deliberately withheld: the same string can appear in
    /// several data fields (a committee affiliation repeated across members),
    /// and there is no way to tell from the text alone which one a given
    /// element came from. Those stay editable through the content forms, where
    /// the user picks the field explicitly, rather than risking a write to the
    /// wrong one.
    pub fn unambiguous_values(&self) -> Vec<ResolvedValue> {
        self.by_value
            .iter()
            .filter(|(_, positions)| positions.len() == 1)
            .map(|(value, positions)| ResolvedValue {
                value: value.clone(),
                field_id: self.leaves[positions[0]].id(),
            })
            .collect()
    }

    /// Every indexed value with all of its candidate fields.
    ///
    /// Duplicated text is included here rather than withheld: the preview can
    /// often still resolve it, because a section declares which data file it
    /// renders from, which narrows the candidates to one.
    pub fn all_values(&self) -> Vec<ValueCandidates> {
        self.by_value
            .iter()
            .map(|(value, positions)| ValueCandidates {
                value: value.clone(),
                fields: positions
                    .iter()
                    .map(|p| {
                        let leaf = &self.leaves[*p];
                        Candidate {
                            field_id: leaf.id(),
                            source: source_of(&leaf.file),
                        }
                    })
                    .collect(),
            })
            .collect()
    }

    /// How many indexed values are too duplicated to resolve from text alone.
    pub fn ambiguous_count(&self) -> usize {
        self.by_value
            .values()
            .filter(|positions| positions.len() > 1)
            .map(|positions| positions.len())
            .sum()
    }
}

/// "src/data/conferenceData.js" -> "conferenceData"
fn source_of(file: &str) -> String {
    file.rsplit('/')
        .next()
        .unwrap_or(file)
        .trim_end_matches(".js")
        .to_string()
}

/// Turns a stored value into the form the page actually renders.
///
/// Two differences to account for. HTML collapses whitespace, so a data string
/// wrapped across lines must compare equal to the single line on screen. And
/// content files mark emphasis inline (`**like this**`), which components strip
/// when rendering — matching on the raw string would never find those.
pub fn normalize(text: &str) -> String {
    strip_emphasis(text)
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

/// Removes `**bold**` / `*italic*` markers, keeping the words between them.
pub fn strip_emphasis(text: &str) -> String {
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::with_capacity(text.len());
    let mut i = 0;

    while i < chars.len() {
        if chars[i] == '*' {
            let run = chars[i..].iter().take_while(|c| **c == '*').count();
            // Only treat a run as a marker if it's one we emit ourselves.
            if run <= 2 {
                i += run;
                continue;
            }
        }
        out.push(chars[i]);
        i += 1;
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn index_from(source: &str) -> ContentIndex {
        ContentIndex::from_leaves(parser::parse_source("src/data/a.js", source).unwrap())
    }

    fn resolved(index: &ContentIndex, text: &str) -> Option<ResolvedValue> {
        index
            .unambiguous_values()
            .into_iter()
            .find(|r| r.value == normalize(text))
    }

    #[test]
    fn resolves_a_unique_string_to_its_field() {
        let index = index_from(r#"export const d = { title: "Contact Us" };"#);
        let hit = resolved(&index, "Contact Us").expect("should resolve");
        assert!(hit.field_id.ends_with("::title"));
    }

    #[test]
    fn matches_across_collapsed_whitespace() {
        // Data files wrap long copy across lines; HTML collapses that
        // whitespace, so the two must still compare equal.
        let index = index_from("export const d = { intro: \"one  two\\nthree\" };");
        assert!(resolved(&index, "one two three").is_some());
    }

    #[test]
    fn withholds_duplicated_text_instead_of_guessing() {
        let index = index_from(r#"export const d = { a: "Submit", b: "Submit" };"#);
        assert!(
            resolved(&index, "Submit").is_none(),
            "duplicated text must not be offered for click-to-edit"
        );
        assert_eq!(index.ambiguous_count(), 2);
    }

    #[test]
    fn excludes_structural_values_from_matching() {
        // "hero" here is a section id, not copy — clicking a heading that
        // happens to read "hero" must never resolve to it.
        let index = index_from(r#"export const p = [{ sectionId: "hero", title: "hero" }];"#);
        let hit = resolved(&index, "hero").expect("the title should still resolve");
        assert!(hit.field_id.ends_with("title"), "got {}", hit.field_id);
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
        assert!(resolved(&index, "Nothing here").is_none());
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
        let clickable = index.unambiguous_values().len();
        let ambiguous = index.ambiguous_count();
        assert!(clickable > 0, "expected some click-to-editable strings");

        let files = index
            .leaves()
            .iter()
            .map(|l| l.file.clone())
            .collect::<std::collections::BTreeSet<_>>();

        println!("leaves parsed:        {}", index.leaves().len());
        println!("data files:           {}", files.len());
        println!("click-to-editable:    {clickable}");
        println!("forms-only (ambiguous): {ambiguous}");

        // Optionally dump the real value list so the click-to-edit bridge can
        // be exercised against actual project data instead of synthetic input.
        if let Ok(out) = std::env::var("WEAVR_DUMP_VALUES") {
            let json = serde_json::to_string(&index.unambiguous_values()).unwrap();
            std::fs::write(&out, json).unwrap();
            println!("wrote value dump to {out}");
        }
        if let Ok(out) = std::env::var("WEAVR_DUMP_ALL") {
            let json = serde_json::to_string(&index.all_values()).unwrap();
            std::fs::write(&out, json).unwrap();
            println!("wrote full dump to {out}");
        }
    }
}
