//! Parses a conference project's data files into a flat list of editable
//! string leaves.
//!
//! The IATMSI template contract (.agents/AGENTS.md) guarantees data files are
//! self-contained static literals — named `export const`, no imports, no
//! function calls, no computed values. That bounded grammar is why tree-sitter
//! is enough here: we only need to locate exact byte spans so edits can be
//! spliced in surgically, not to understand arbitrary JavaScript.

use std::path::Path;

use serde::{Deserialize, Serialize};
use tree_sitter::{Node, Parser};

use crate::error::{AppError, AppResult};

/// One editable string in a data file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LeafRecord {
    /// Project-relative path, e.g. "src/data/contactData.js".
    pub file: String,
    /// The `export const <name>` this leaf lives under.
    pub export_name: String,
    /// Dotted/indexed path within the export, e.g.
    /// "socialLinks.email" or "documents[0].title".
    pub json_path: String,
    pub value: String,
    /// Byte range of the string's CONTENTS (inside the quotes), so a write
    /// replaces only the text and never disturbs the surrounding syntax.
    pub start_byte: usize,
    pub end_byte: usize,
    /// True for machine-facing values — section ids, route paths, SVG icon
    /// data — as opposed to prose a reader sees. These are excluded from
    /// click-to-edit matching and hidden from the content forms: they're
    /// wiring, and changing one breaks the site rather than reworking copy.
    pub is_structural: bool,
    /// A numeric literal. Written back without quotes so it stays a number,
    /// and only ever replaced with something that still parses as one.
    #[serde(default)]
    pub is_number: bool,
}

/// Field names whose values are identifiers/wiring rather than visible copy.
const STRUCTURAL_FIELDS: &[&str] = &[
    "id",
    "sectionId",
    "dataKey",
    "component",
    "type",
    "key",
    "slug",
    "route",
    "path",
    "icon",
    "iconPath",
    "anchor",
];

impl LeafRecord {
    /// Stable identifier for a leaf, used to address it from the frontend.
    pub fn id(&self) -> String {
        format!("{}::{}::{}", self.file, self.export_name, self.json_path)
    }
}

pub fn js_parser() -> AppResult<Parser> {
    let mut parser = Parser::new();
    parser
        .set_language(&tree_sitter_javascript::LANGUAGE.into())
        .map_err(|e| AppError::Other(format!("failed to load JavaScript grammar: {e}")))?;
    Ok(parser)
}

/// Extracts every string leaf from one data file's source text.
pub fn parse_source(relative_path: &str, source: &str) -> AppResult<Vec<LeafRecord>> {
    let mut parser = js_parser()?;
    let tree = parser
        .parse(source, None)
        .ok_or_else(|| AppError::Other(format!("could not parse {relative_path}")))?;

    let mut leaves = Vec::new();
    let root = tree.root_node();
    let mut cursor = root.walk();

    for child in root.named_children(&mut cursor) {
        // We only care about `export const ...` declarations.
        let declaration = match child.kind() {
            "export_statement" => child.child_by_field_name("declaration"),
            _ => None,
        };
        let Some(declaration) = declaration else {
            continue;
        };
        if declaration.kind() != "lexical_declaration" && declaration.kind() != "variable_declaration"
        {
            continue;
        }

        let mut decl_cursor = declaration.walk();
        for declarator in declaration.named_children(&mut decl_cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }
            let (Some(name_node), Some(value_node)) = (
                declarator.child_by_field_name("name"),
                declarator.child_by_field_name("value"),
            ) else {
                continue;
            };
            let export_name = node_text(&name_node, source).to_string();
            collect_leaves(
                relative_path,
                &export_name,
                String::new(),
                &value_node,
                source,
                &mut leaves,
            );
        }
    }

    Ok(leaves)
}

/// Reads and parses every `src/data/*.js` file in a project.
pub fn parse_project(project_root: &Path) -> AppResult<Vec<LeafRecord>> {
    let data_dir = project_root.join("src").join("data");
    let mut leaves = Vec::new();

    let entries = std::fs::read_dir(&data_dir).map_err(|e| {
        AppError::Other(format!(
            "could not read {}: {e}",
            data_dir.display()
        ))
    })?;

    let mut files: Vec<_> = entries
        .filter_map(|entry| entry.ok())
        .map(|entry| entry.path())
        .filter(|path| path.extension().is_some_and(|ext| ext == "js"))
        .collect();
    files.sort();

    for path in files {
        let Ok(source) = std::fs::read_to_string(&path) else {
            continue;
        };
        let Some(file_name) = path.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        let relative = format!("src/data/{file_name}");
        leaves.extend(parse_source(&relative, &source)?);
    }

    Ok(leaves)
}

/// Byte ranges of each element of one array in a data file.
///
/// Everything structural a user might rearrange is an array: the sections on a
/// page, the pages on the site, the members of a committee. Locating the
/// elements is enough to duplicate, remove or reorder any of them by moving
/// bytes, without needing to understand their contents.
#[derive(Debug, Clone)]
pub struct ArrayLocation {
    /// Byte range of each element, in source order.
    pub elements: Vec<(usize, usize)>,
}

pub fn locate_array(
    relative_path: &str,
    source: &str,
    export_name: &str,
    array_path: &str,
) -> AppResult<ArrayLocation> {
    let mut parser = js_parser()?;
    let tree = parser
        .parse(source, None)
        .ok_or_else(|| AppError::Other(format!("could not parse {relative_path}")))?;

    let root = tree.root_node();
    let mut cursor = root.walk();

    for child in root.named_children(&mut cursor) {
        let Some(declaration) = (match child.kind() {
            "export_statement" => child.child_by_field_name("declaration"),
            _ => None,
        }) else {
            continue;
        };

        let mut decl_cursor = declaration.walk();
        for declarator in declaration.named_children(&mut decl_cursor) {
            if declarator.kind() != "variable_declarator" {
                continue;
            }
            let (Some(name_node), Some(value_node)) = (
                declarator.child_by_field_name("name"),
                declarator.child_by_field_name("value"),
            ) else {
                continue;
            };
            if node_text(&name_node, source) != export_name {
                continue;
            }
            if let Some(array) = descend_to(&value_node, array_path, source) {
                return array_location(&array);
            }
        }
    }

    Err(AppError::Other(format!(
        "could not find {export_name}{} in {relative_path}",
        if array_path.is_empty() {
            String::new()
        } else {
            format!(".{array_path}")
        }
    )))
}

/// Walks a dotted/indexed path ("sections", "groups[2].items") from a node.
fn descend_to<'a>(node: &Node<'a>, path: &str, source: &str) -> Option<Node<'a>> {
    let mut current = *node;

    for segment in path.split('.').filter(|s| !s.is_empty()) {
        let (name, indices) = split_indices(segment);

        if !name.is_empty() {
            current = object_value(&current, name, source)?;
        }
        for index in indices {
            current = array_element(&current, index)?;
        }
    }

    Some(current)
}

/// "groups[2][0]" -> ("groups", [2, 0])
fn split_indices(segment: &str) -> (&str, Vec<usize>) {
    let name_end = segment.find('[').unwrap_or(segment.len());
    let (name, rest) = segment.split_at(name_end);
    let indices = rest
        .split(']')
        .filter_map(|part| part.trim_start_matches('[').parse::<usize>().ok())
        .collect();
    (name, indices)
}

fn object_value<'a>(node: &Node<'a>, key: &str, source: &str) -> Option<Node<'a>> {
    if node.kind() != "object" {
        return None;
    }
    let mut cursor = node.walk();
    let found = node.named_children(&mut cursor).find_map(|pair| {
        if pair.kind() != "pair" {
            return None;
        }
        let key_node = pair.child_by_field_name("key")?;
        if property_key_name(&key_node, source) != key {
            return None;
        }
        pair.child_by_field_name("value")
    });
    found
}

fn array_element<'a>(node: &Node<'a>, index: usize) -> Option<Node<'a>> {
    if node.kind() != "array" {
        return None;
    }
    let mut cursor = node.walk();
    let found = node
        .named_children(&mut cursor)
        .filter(|child| child.kind() != "comment")
        .nth(index);
    found
}

fn array_location(node: &Node) -> AppResult<ArrayLocation> {
    if node.kind() != "array" {
        return Err(AppError::Other(format!(
            "expected a list but found {}",
            node.kind()
        )));
    }

    let mut cursor = node.walk();
    let elements: Vec<(usize, usize)> = node
        .named_children(&mut cursor)
        .filter(|child| child.kind() != "comment")
        .map(|child| (child.start_byte(), child.end_byte()))
        .collect();

    Ok(ArrayLocation { elements })
}

fn collect_leaves(
    file: &str,
    export_name: &str,
    path: String,
    node: &Node,
    source: &str,
    out: &mut Vec<LeafRecord>,
) {
    match node.kind() {
        "string" | "template_string" => {
            if let Some((start, end, value)) = string_content_span(node, source) {
                let is_structural = is_structural_path(&path);
                out.push(LeafRecord {
                    file: file.to_string(),
                    export_name: export_name.to_string(),
                    json_path: path,
                    value,
                    start_byte: start,
                    end_byte: end,
                    is_structural,
                    is_number: false,
                });
            }
        }
        // Numbers render as text too — a track's `number`, a statistic, a
        // count. Without these, visible figures on the page trace to no field
        // and can't be edited. The span is the literal itself (no quotes to
        // sit inside), and writing back keeps it unquoted so it stays a number.
        "number" => {
            let value = node_text(node, source).to_string();
            if !value.is_empty() {
                let is_structural = is_structural_path(&path);
                out.push(LeafRecord {
                    file: file.to_string(),
                    export_name: export_name.to_string(),
                    json_path: path,
                    value,
                    start_byte: node.start_byte(),
                    end_byte: node.end_byte(),
                    is_structural,
                    is_number: true,
                });
            }
        }
        "object" => {
            let mut cursor = node.walk();
            for pair in node.named_children(&mut cursor) {
                if pair.kind() != "pair" {
                    continue;
                }
                let (Some(key_node), Some(value_node)) = (
                    pair.child_by_field_name("key"),
                    pair.child_by_field_name("value"),
                ) else {
                    continue;
                };
                let key = property_key_name(&key_node, source);
                let child_path = if path.is_empty() {
                    key
                } else {
                    format!("{path}.{key}")
                };
                collect_leaves(file, export_name, child_path, &value_node, source, out);
            }
        }
        "array" => {
            let mut cursor = node.walk();
            for (index, element) in node.named_children(&mut cursor).enumerate() {
                if element.kind() == "comment" {
                    continue;
                }
                let child_path = format!("{path}[{index}]");
                collect_leaves(file, export_name, child_path, &element, source, out);
            }
        }
        _ => {}
    }
}

/// Byte range of a string literal's contents, excluding the quote characters,
/// plus the unescaped value.
///
/// The span deliberately spans everything between the quotes rather than
/// tracking individual `string_fragment` nodes: a literal containing escapes
/// (`"say \"hi\""`) is split by the grammar into several fragments, and we
/// still want to treat it as one editable value.
///
/// Returns None for template literals with `${...}` interpolation — the data
/// contract forbids them, and rewriting one blindly could destroy an
/// expression.
fn string_content_span(node: &Node, source: &str) -> Option<(usize, usize, String)> {
    if node.kind() == "template_string" {
        let mut cursor = node.walk();
        let has_interpolation = node
            .named_children(&mut cursor)
            .any(|c| c.kind() == "template_substitution");
        if has_interpolation {
            return None;
        }
    }

    let start = node.start_byte() + 1;
    let end = node.end_byte().checked_sub(1)?;
    if start > end {
        return None;
    }
    let raw = source.get(start..end)?;
    Some((start, end, unescape_js_string(raw)))
}

/// Resolves the escape sequences the data files actually use. Anything more
/// exotic (`\uXXXX`, octal) is left as written rather than guessed at.
fn unescape_js_string(raw: &str) -> String {
    let mut out = String::with_capacity(raw.len());
    let mut chars = raw.chars();

    while let Some(ch) = chars.next() {
        if ch != '\\' {
            out.push(ch);
            continue;
        }
        match chars.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('r') => out.push('\r'),
            Some('\\') => out.push('\\'),
            Some('"') => out.push('"'),
            Some('\'') => out.push('\''),
            Some('`') => out.push('`'),
            Some(other) => {
                out.push('\\');
                out.push(other);
            }
            None => out.push('\\'),
        }
    }

    out
}

fn property_key_name(node: &Node, source: &str) -> String {
    match node.kind() {
        "string" => string_content_span(node, source)
            .map(|(_, _, value)| value)
            .unwrap_or_else(|| node_text(node, source).to_string()),
        _ => node_text(node, source).to_string(),
    }
}

fn node_text<'a>(node: &Node, source: &'a str) -> &'a str {
    source.get(node.start_byte()..node.end_byte()).unwrap_or("")
}

/// Classifies a leaf by its final field name — `sections[0].sectionId` is
/// wiring, `sections[0].title` is copy.
fn is_structural_path(path: &str) -> bool {
    let last_field = path
        .rsplit('.')
        .next()
        .map(|segment| segment.split('[').next().unwrap_or(segment))
        .unwrap_or(path);

    STRUCTURAL_FIELDS.contains(&last_field)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn marks_identifier_fields_as_structural() {
        let source = r#"export const pages = [
            { id: "home", title: "Home", sections: [{ sectionId: "hero", props: { title: "Welcome" } }] }
        ];"#;
        let leaves = parse_source("src/data/pageRegistry.js", source).unwrap();

        let structural: Vec<_> = leaves
            .iter()
            .filter(|l| l.is_structural)
            .map(|l| l.json_path.as_str())
            .collect();
        assert!(structural.contains(&"[0].id"));
        assert!(structural.contains(&"[0].sections[0].sectionId"));

        let editable: Vec<_> = leaves
            .iter()
            .filter(|l| !l.is_structural)
            .map(|l| l.json_path.as_str())
            .collect();
        assert!(editable.contains(&"[0].title"));
        assert!(editable.contains(&"[0].sections[0].props.title"));
    }
}
