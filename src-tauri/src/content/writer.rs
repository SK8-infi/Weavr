//! Surgical write-back into data files.
//!
//! Edits replace only the bytes inside a string literal's quotes, leaving the
//! rest of the file byte-identical. That keeps git diffs to the single line
//! that actually changed — important both for a legible history and for not
//! reformatting a file the developer maintains by hand.

use std::path::Path;

use crate::error::{AppError, AppResult};

use super::parser;

/// Replaces the value at `json_path` under `export_name` in `file`.
///
/// The file is re-parsed immediately before writing rather than trusting byte
/// offsets captured earlier — the file may have changed on disk (the developer
/// edits it, a git pull lands) since the index was built, and stale offsets
/// would corrupt it.
pub fn write_string_field(
    project_root: &Path,
    relative_file: &str,
    export_name: &str,
    json_path: &str,
    new_value: &str,
) -> AppResult<()> {
    let absolute = project_root.join(relative_file);
    let source = std::fs::read_to_string(&absolute)
        .map_err(|e| AppError::Other(format!("could not read {relative_file}: {e}")))?;

    let leaves = parser::parse_source(relative_file, &source)?;
    let leaf = leaves
        .iter()
        .find(|leaf| leaf.export_name == export_name && leaf.json_path == json_path)
        .ok_or_else(|| {
            AppError::Other(format!(
                "could not find {export_name}.{json_path} in {relative_file} — the file may have changed"
            ))
        })?;

    // A numeric literal has no quotes to write inside, so the replacement has
    // to still parse as a number — otherwise the splice would turn `number: 3`
    // into `number: three` and break the module for the whole site.
    let (new_value, escaped) = if leaf.is_number {
        let trimmed = new_value.trim();
        if trimmed.parse::<f64>().is_err() {
            return Err(AppError::Other(format!(
                "{} expects a number, but got \"{new_value}\"",
                friendly_field(json_path)
            )));
        }
        (trimmed.to_string(), trimmed.to_string())
    } else {
        // The page renders emphasis markers away, so an edit arrives as plain
        // text. Put the markers back around any phrase that was emphasised
        // before and still survives, or saving would quietly strip the bolding.
        let value = reapply_emphasis(&leaf.value, new_value);
        // The delimiter sits immediately before the content span; escaping has
        // to match it (a backtick-delimited string needs `${` neutralised, a
        // quoted one does not).
        let delimiter = source[..leaf.start_byte].chars().next_back().unwrap_or('"');
        let escaped = escape_for_js_string(&value, delimiter);
        (value, escaped)
    };
    let new_value = new_value.as_str();

    let mut updated = String::with_capacity(source.len() + escaped.len());
    updated.push_str(&source[..leaf.start_byte]);
    updated.push_str(&escaped);
    updated.push_str(&source[leaf.end_byte..]);

    // Re-parse the result before committing it to disk. If our splice somehow
    // produced something that no longer parses, or the value didn't land where
    // expected, we'd rather fail loudly than write a broken data file that
    // breaks the user's whole site.
    let verification = parser::parse_source(relative_file, &updated)?;
    let landed = verification
        .iter()
        .any(|l| l.export_name == export_name && l.json_path == json_path && l.value == new_value);
    if !landed {
        return Err(AppError::Other(format!(
            "refusing to write {relative_file}: the edit did not apply cleanly"
        )));
    }

    std::fs::write(&absolute, updated)
        .map_err(|e| AppError::Other(format!("could not write {relative_file}: {e}")))?;

    Ok(())
}

/// "documents[0].title" -> "Documents 1 title", for error messages a
/// non-technical user can act on.
fn friendly_field(json_path: &str) -> String {
    let spaced = json_path.replace('.', " ").replace(['[', ']'], " ");
    let cleaned = spaced.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.is_empty() {
        "This field".to_string()
    } else {
        cleaned
    }
}

/// Collects the phrases wrapped in `**...**` in a stored value.
fn emphasized_phrases(raw: &str) -> Vec<String> {
    let mut phrases = Vec::new();
    let mut rest = raw;

    while let Some(open) = rest.find("**") {
        let after = &rest[open + 2..];
        let Some(close) = after.find("**") else { break };
        let phrase = &after[..close];
        if !phrase.trim().is_empty() {
            phrases.push(phrase.to_string());
        }
        rest = &after[close + 2..];
    }

    phrases
}

/// Re-wraps previously emphasised phrases in newly edited plain text.
///
/// A phrase that the user rewrote or deleted simply loses its emphasis, which
/// is predictable and never corrupts the sentence — the alternative, guessing
/// where the markers should now go, could mangle the text.
fn reapply_emphasis(old_raw: &str, new_plain: &str) -> String {
    // Already carries markers (edited via the forms, not the page) — leave it.
    if new_plain.contains("**") {
        return new_plain.to_string();
    }

    let mut phrases = emphasized_phrases(old_raw);
    if phrases.is_empty() {
        return new_plain.to_string();
    }

    // Longest first, so a phrase contained inside another doesn't claim it.
    phrases.sort_by_key(|p| std::cmp::Reverse(p.len()));

    let mut result = new_plain.to_string();
    for phrase in phrases {
        if phrase.len() < 3 {
            continue;
        }
        // Only when it appears exactly once; otherwise we can't tell which
        // occurrence was the emphasised one.
        let count = result.matches(phrase.as_str()).count();
        if count != 1 {
            continue;
        }
        // Don't re-wrap something already inside markers from an earlier pass.
        if let Some(at) = result.find(phrase.as_str()) {
            let before_has_marker = result[..at].ends_with("**");
            if before_has_marker {
                continue;
            }
            result = format!(
                "{}**{}**{}",
                &result[..at],
                phrase,
                &result[at + phrase.len()..]
            );
        }
    }

    result
}

/// Escapes a user-typed value for insertion inside a JS string literal with
/// the given delimiter. Backslashes go first — otherwise we'd re-escape the
/// backslashes introduced by the later replacements.
fn escape_for_js_string(value: &str, delimiter: char) -> String {
    let mut escaped = value.replace('\\', "\\\\");

    if delimiter == '`' {
        escaped = escaped.replace('`', "\\`").replace("${", "\\${");
    } else {
        escaped = escaped.replace(delimiter, &format!("\\{delimiter}"));
        escaped = escaped.replace('\n', "\\n");
    }

    escaped.replace('\r', "")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::parser;

    #[test]
    fn escapes_delimiter_and_backslashes_without_doubling() {
        assert_eq!(escape_for_js_string(r#"say "hi""#, '"'), r#"say \"hi\""#);
        assert_eq!(escape_for_js_string(r"C:\path", '"'), r"C:\\path");
        assert_eq!(escape_for_js_string("a\nb", '"'), r"a\nb");
        // A quote that isn't the delimiter needs no escaping.
        assert_eq!(escape_for_js_string("it's", '"'), "it's");
        // Template literals must not gain an interpolation.
        assert_eq!(escape_for_js_string("${x}", '`'), r"\${x}");
    }

    /// End-to-end through a real file: an edit made on the page arrives as
    /// plain text, and the stored value must come back out still emphasised.
    #[test]
    fn writing_a_page_edit_preserves_emphasis_in_the_file() {
        let dir = tempfile::tempdir().unwrap();
        let data_dir = dir.path().join("src/data");
        std::fs::create_dir_all(&data_dir).unwrap();
        let rel = "src/data/homeData.js";
        std::fs::write(
            dir.path().join(rel),
            "export const homeData = {\n    intro: \"The **5th IEEE Conference** meets in **Kathmandu, Nepal** yearly.\"\n};\n",
        )
        .unwrap();

        // What the browser sends: the rendered text, markers stripped.
        write_string_field(
            dir.path(),
            rel,
            "homeData",
            "intro",
            "The 5th IEEE Conference meets in Kathmandu, Nepal twice yearly.",
        )
        .expect("write should succeed");

        let saved = std::fs::read_to_string(dir.path().join(rel)).unwrap();
        assert!(
            saved.contains("**5th IEEE Conference**") && saved.contains("**Kathmandu, Nepal**"),
            "emphasis was lost: {saved}"
        );
        assert!(saved.contains("twice yearly"), "edit was lost: {saved}");
    }

    #[test]
    fn keeps_emphasis_on_phrases_that_survive_an_edit() {
        let old = "The **5th IEEE Conference** is held in **Kathmandu, Nepal** yearly.";
        let edited = "The 5th IEEE Conference is held in Kathmandu, Nepal twice a year.";

        let saved = reapply_emphasis(old, edited);
        assert_eq!(
            saved,
            "The **5th IEEE Conference** is held in **Kathmandu, Nepal** twice a year."
        );
    }

    #[test]
    fn drops_emphasis_for_a_phrase_the_user_rewrote() {
        let old = "Held in **Gwalior, India** this year.";
        let saved = reapply_emphasis(old, "Held in Kathmandu, Nepal this year.");
        assert_eq!(saved, "Held in Kathmandu, Nepal this year.");
    }

    #[test]
    fn leaves_text_alone_when_nothing_was_emphasised() {
        let saved = reapply_emphasis("plain sentence", "edited sentence");
        assert_eq!(saved, "edited sentence");
    }

    #[test]
    fn does_not_double_wrap_text_that_already_has_markers() {
        // An edit from the side panel shows the raw value, markers included.
        let old = "The **conference** runs yearly.";
        let saved = reapply_emphasis(old, "The **conference** runs twice yearly.");
        assert_eq!(saved, "The **conference** runs twice yearly.");
    }

    #[test]
    fn skips_a_phrase_that_now_appears_more_than_once() {
        // Can't tell which occurrence was the emphasised one, so leave it.
        let old = "**IEEE** members welcome.";
        let saved = reapply_emphasis(old, "IEEE members welcome, IEEE guests too.");
        assert_eq!(saved, "IEEE members welcome, IEEE guests too.");
    }

    /// The escape/unescape pair has to round-trip, or the writer's
    /// verification step would reject its own correct output.
    #[test]
    fn escaped_values_round_trip_through_the_parser() {
        for original in [
            r#"He said "hello" loudly"#,
            r"a backslash \ here",
            "it's fine",
            "line one\nline two",
            "plain text",
        ] {
            let escaped = escape_for_js_string(original, '"');
            let source = format!("export const d = {{ field: \"{escaped}\" }};");
            let leaves = parser::parse_source("src/data/test.js", &source).unwrap();
            let leaf = leaves
                .iter()
                .find(|l| l.json_path == "field")
                .unwrap_or_else(|| panic!("no leaf parsed for {original:?}"));
            assert_eq!(leaf.value, original, "round-trip failed for {original:?}");
        }
    }
}
