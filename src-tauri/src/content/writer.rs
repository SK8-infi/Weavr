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

    // The delimiter sits immediately before the content span; escaping has to
    // match it (a backtick-delimited string needs `${` neutralised, a quoted
    // one does not).
    let delimiter = source[..leaf.start_byte].chars().next_back().unwrap_or('"');
    let escaped = escape_for_js_string(new_value, delimiter);

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
