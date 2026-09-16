//! Per-field text size and alignment.
//!
//! Emphasis (`**bold**`) lives inside the string because it marks a run of
//! text. Size and alignment are properties of the whole field, so they have
//! nowhere to go inside it — they live in their own file, keyed by field id.
//!
//! Unlike the content files, this one belongs to Weavr: it is regenerated
//! whole on every write rather than spliced. That is safe here because nothing
//! else lives in it, and it avoids carrying the offset bookkeeping the content
//! writer needs. A file that cannot be parsed is reported rather than
//! overwritten, so a hand edit that went wrong is never silently discarded.

use std::collections::BTreeMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

/// Where the site keeps them. Part of the template contract, alongside
/// `src/data/*.js` for content.
pub const STYLES_FILE: &str = "src/data/fieldStyles.js";

/// Relative steps, not absolute sizes, so a heading set to `lg` stays larger
/// than body text set to `lg`. The site maps these to classes.
pub const SIZES: [&str; 5] = ["sm", "base", "lg", "xl", "2xl"];
pub const ALIGNMENTS: [&str; 4] = ["left", "center", "right", "justify"];

#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct FieldStyle {
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none", default)]
    pub align: Option<String>,
}

impl FieldStyle {
    /// A style that sets nothing is stored as no entry at all, so the file
    /// stays as short as the number of fields actually restyled.
    pub fn is_empty(&self) -> bool {
        self.size.is_none() && self.align.is_none()
    }

    fn validate(&self) -> AppResult<()> {
        if let Some(size) = &self.size {
            if !SIZES.contains(&size.as_str()) {
                return Err(AppError::Other(format!(
                    "'{size}' is not a text size. Use one of: {}",
                    SIZES.join(", ")
                )));
            }
        }
        if let Some(align) = &self.align {
            if !ALIGNMENTS.contains(&align.as_str()) {
                return Err(AppError::Other(format!(
                    "'{align}' is not an alignment. Use one of: {}",
                    ALIGNMENTS.join(", ")
                )));
            }
        }
        Ok(())
    }
}

pub type StyleMap = BTreeMap<String, FieldStyle>;

/// Reads the stored styles. A site that has never been restyled has no file,
/// which is not an error — it simply has no styles.
pub fn read(root: &Path) -> AppResult<StyleMap> {
    let path = root.join(STYLES_FILE);
    let source = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(StyleMap::new()),
        Err(err) => return Err(err.into()),
    };
    parse(&source)
}

/// Sets one field's style, or clears it when the style sets nothing.
pub fn set(root: &Path, field_id: &str, style: FieldStyle) -> AppResult<()> {
    if field_id.trim().is_empty() {
        return Err(AppError::Other("a field id is required".into()));
    }
    style.validate()?;

    let mut styles = read(root)?;
    if style.is_empty() {
        styles.remove(field_id);
    } else {
        styles.insert(field_id.to_string(), style);
    }

    let path = root.join(STYLES_FILE);
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, render(&styles))?;
    Ok(())
}

/// Pulls the object literal out of the file.
///
/// The body is emitted as JSON so it can be read back without a JavaScript
/// parser. Anything that does not parse is an error rather than an empty map:
/// treating an unreadable file as "no styles" would wipe every style on the
/// next write.
fn parse(source: &str) -> AppResult<StyleMap> {
    let Some(equals) = source.find("fieldStyles").and_then(|at| {
        source[at..].find('=').map(|offset| at + offset + 1)
    }) else {
        return Err(AppError::Other(format!(
            "{STYLES_FILE} does not declare fieldStyles"
        )));
    };

    let rest = &source[equals..];
    let Some(start) = rest.find('{') else {
        return Err(AppError::Other(format!(
            "{STYLES_FILE} has no style map to read"
        )));
    };

    // Braces nest one level deep (the map, then each field's style), so
    // matching them is enough — no string in a key or value contains one.
    let mut depth = 0usize;
    let mut end = None;
    for (offset, ch) in rest[start..].char_indices() {
        match ch {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    end = Some(start + offset + 1);
                    break;
                }
            }
            _ => {}
        }
    }

    let Some(end) = end else {
        return Err(AppError::Other(format!("{STYLES_FILE} is incomplete")));
    };

    serde_json::from_str(&rest[start..end]).map_err(|e| {
        AppError::Other(format!(
            "{STYLES_FILE} could not be read ({e}). It is left unchanged; fix or delete it."
        ))
    })
}

/// Writes the file. Double quotes throughout, so the map body stays valid JSON
/// and `parse` above needs nothing more than serde to read it back.
fn render(styles: &StyleMap) -> String {
    let mut out = String::from(HEADER);
    if styles.is_empty() {
        out.push_str("export const fieldStyles = {};\n");
        return out;
    }

    out.push_str("export const fieldStyles = {\n");
    // No trailing comma on the last entry. JavaScript would accept one, but it
    // would make the body invalid JSON — and reading it back with serde is the
    // whole reason this file is written in JSON's subset.
    let entries: Vec<String> = styles
        .iter()
        .map(|(field_id, style)| {
            let key = serde_json::to_string(field_id).unwrap_or_else(|_| "\"\"".into());
            let value = serde_json::to_string(style).unwrap_or_else(|_| "{}".into());
            format!("    {key}: {value}")
        })
        .collect();
    out.push_str(&entries.join(",\n"));
    out.push_str("\n};\n");
    out
}

const HEADER: &str = "\
// Per-field text styling.
//
// Written by Weavr when a text size or alignment is changed in the editor.
// Regenerated whole on each change, so formatting here is not preserved —
// the styles themselves always are.
//
//   size:  sm | base | lg | xl | 2xl
//   align: left | center | right | justify

";

#[cfg(test)]
mod tests {
    use super::*;

    fn style(size: Option<&str>, align: Option<&str>) -> FieldStyle {
        FieldStyle {
            size: size.map(str::to_string),
            align: align.map(str::to_string),
        }
    }

    #[test]
    fn a_site_with_no_styles_file_has_no_styles() {
        let dir = tempfile::tempdir().unwrap();
        assert!(read(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn a_style_survives_a_write_and_a_read() {
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "heroData.title", style(Some("xl"), Some("center"))).unwrap();

        let stored = read(dir.path()).unwrap();
        assert_eq!(stored.get("heroData.title"), Some(&style(Some("xl"), Some("center"))));
    }

    #[test]
    fn setting_one_field_leaves_the_others_alone() {
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "a.one", style(Some("lg"), None)).unwrap();
        set(dir.path(), "b.two", style(None, Some("right"))).unwrap();

        let stored = read(dir.path()).unwrap();
        assert_eq!(stored.len(), 2);
        assert_eq!(stored.get("a.one"), Some(&style(Some("lg"), None)));
        assert_eq!(stored.get("b.two"), Some(&style(None, Some("right"))));
    }

    #[test]
    fn clearing_a_style_removes_its_entry_rather_than_storing_an_empty_one() {
        // An entry that sets nothing would grow the file for every field ever
        // touched, and the site would read it as a style and apply no classes.
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "a.one", style(Some("lg"), Some("center"))).unwrap();
        set(dir.path(), "a.one", FieldStyle::default()).unwrap();

        assert!(read(dir.path()).unwrap().is_empty());
        let text = std::fs::read_to_string(dir.path().join(STYLES_FILE)).unwrap();
        assert!(text.contains("fieldStyles = {}"), "got: {text}");
    }

    #[test]
    fn only_half_a_style_is_allowed() {
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "a.one", style(None, Some("justify"))).unwrap();
        assert_eq!(read(dir.path()).unwrap().get("a.one"), Some(&style(None, Some("justify"))));
    }

    #[test]
    fn an_unknown_size_or_alignment_is_refused() {
        // These become class names on the site. A value that is not one of the
        // published steps has no class behind it and would do nothing, so it
        // is rejected here rather than written and silently ignored there.
        let dir = tempfile::tempdir().unwrap();
        assert!(set(dir.path(), "a.one", style(Some("enormous"), None)).is_err());
        assert!(set(dir.path(), "a.one", style(None, Some("sideways"))).is_err());
        assert!(read(dir.path()).unwrap().is_empty());
    }

    #[test]
    fn a_field_id_is_required() {
        let dir = tempfile::tempdir().unwrap();
        assert!(set(dir.path(), "   ", style(Some("lg"), None)).is_err());
    }

    #[test]
    fn a_file_that_cannot_be_read_is_reported_not_overwritten() {
        // Reading a damaged file as "no styles" would quietly wipe every style
        // on the next write. Better to refuse and say so.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join(STYLES_FILE);
        std::fs::create_dir_all(path.parent().unwrap()).unwrap();
        std::fs::write(&path, "export const fieldStyles = { this is not json };").unwrap();

        assert!(read(dir.path()).is_err());
        assert!(set(dir.path(), "a.one", style(Some("lg"), None)).is_err());

        let after = std::fs::read_to_string(&path).unwrap();
        assert!(after.contains("this is not json"), "the damaged file was overwritten");
    }

    #[test]
    fn the_written_file_is_valid_javascript_shaped() {
        let dir = tempfile::tempdir().unwrap();
        set(dir.path(), "heroData.title", style(Some("2xl"), Some("center"))).unwrap();

        let text = std::fs::read_to_string(dir.path().join(STYLES_FILE)).unwrap();
        assert!(text.contains("export const fieldStyles = {"));
        assert!(text.contains("\"heroData.title\""));
        assert!(text.trim_end().ends_with("};"));
    }

    /// The bridge is a resource file, not compiled with the rest of this, so
    /// nothing else would notice it offering a size or alignment Rust refuses
    /// — the button would simply do nothing, with the reason only in a log.
    #[test]
    fn the_bridge_offers_exactly_the_values_this_accepts() {
        let bridge = include_str!("../../resources/weavr-edit-bridge.js");

        let steps = bridge
            .split_once("const SIZE_STEPS = [")
            .and_then(|(_, rest)| rest.split_once(']'))
            .map(|(list, _)| list.to_string())
            .expect("the bridge no longer declares SIZE_STEPS");

        for size in SIZES {
            assert!(
                steps.contains(&format!("\"{size}\"")),
                "the bridge cannot offer the size '{size}'"
            );
        }
        assert_eq!(
            steps.matches('"').count() / 2,
            SIZES.len(),
            "the bridge offers a different number of sizes than this accepts: {steps}"
        );

        for align in ALIGNMENTS {
            assert!(
                bridge.contains(&format!("value: \"{align}\"")),
                "the bridge cannot offer the alignment '{align}'"
            );
        }
    }

    #[test]
    fn keys_with_awkward_characters_round_trip() {
        // Field ids come from data paths, which can contain quotes in a key.
        let dir = tempfile::tempdir().unwrap();
        let id = r#"data.odd"key.title"#;
        set(dir.path(), id, style(Some("sm"), None)).unwrap();
        assert_eq!(read(dir.path()).unwrap().get(id), Some(&style(Some("sm"), None)));
    }
}
