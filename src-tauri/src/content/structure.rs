//! Adding, removing and reordering the repeated parts of a site.
//!
//! A page's sections, the site's pages, a committee's members and a track's
//! bullet points are all arrays in a data file, so one set of operations
//! covers "add a section", "add a page" and "add a person".
//!
//! New entries are made by copying an existing one rather than generating one
//! from a schema. A copy is guaranteed to have the right shape, the right
//! fields and the surrounding file's own formatting — and the user renames it
//! immediately anyway. It also means Weavr never has to know what a
//! particular kind of entry looks like.

use std::path::Path;

use crate::error::{AppError, AppResult};

use super::parser;

fn read(project_root: &Path, relative_file: &str) -> AppResult<String> {
    std::fs::read_to_string(project_root.join(relative_file))
        .map_err(|e| AppError::Other(format!("could not read {relative_file}: {e}")))
}

/// Writes only after confirming the result still parses and has the expected
/// number of entries — a botched splice here would break the whole site.
fn commit(
    project_root: &Path,
    relative_file: &str,
    export_name: &str,
    array_path: &str,
    updated: String,
    expected_len: usize,
) -> AppResult<()> {
    let check = parser::locate_array(relative_file, &updated, export_name, array_path)
        .map_err(|e| AppError::Other(format!("refusing to write {relative_file}: {e}")))?;

    if check.elements.len() != expected_len {
        return Err(AppError::Other(format!(
            "refusing to write {relative_file}: expected {expected_len} entries after the change but found {}",
            check.elements.len()
        )));
    }

    std::fs::write(project_root.join(relative_file), updated)
        .map_err(|e| AppError::Other(format!("could not write {relative_file}: {e}")))
}

/// The whitespace an element sits on, so an inserted copy lines up with its
/// neighbours instead of landing flat against the previous entry.
fn indent_before(source: &str, start: usize) -> String {
    let line_start = source[..start].rfind('\n').map(|i| i + 1).unwrap_or(0);
    let prefix = &source[line_start..start];
    if prefix.trim().is_empty() {
        prefix.to_string()
    } else {
        String::new()
    }
}

pub fn duplicate_item(
    project_root: &Path,
    relative_file: &str,
    export_name: &str,
    array_path: &str,
    index: usize,
) -> AppResult<()> {
    let source = read(project_root, relative_file)?;
    let array = parser::locate_array(relative_file, &source, export_name, array_path)?;

    let &(start, end) = array
        .elements
        .get(index)
        .ok_or_else(|| AppError::Other(format!("there is no entry {} to copy", index + 1)))?;

    let copy = &source[start..end];
    let indent = indent_before(&source, start);

    let mut updated = String::with_capacity(source.len() + copy.len() + indent.len() + 2);
    updated.push_str(&source[..end]);
    updated.push(',');
    if indent.is_empty() {
        updated.push(' ');
    } else {
        updated.push('\n');
        updated.push_str(&indent);
    }
    updated.push_str(copy);
    updated.push_str(&source[end..]);

    commit(
        project_root,
        relative_file,
        export_name,
        array_path,
        updated,
        array.elements.len() + 1,
    )
}

pub fn remove_item(
    project_root: &Path,
    relative_file: &str,
    export_name: &str,
    array_path: &str,
    index: usize,
) -> AppResult<()> {
    let source = read(project_root, relative_file)?;
    let array = parser::locate_array(relative_file, &source, export_name, array_path)?;

    let &(start, end) = array
        .elements
        .get(index)
        .ok_or_else(|| AppError::Other(format!("there is no entry {} to remove", index + 1)))?;

    // Take the separating comma with it, whichever side it falls on, or the
    // file is left with a stray comma that won't parse.
    let mut cut_start = start;
    let mut cut_end = end;
    let after = source[end..]
        .char_indices()
        .find(|(_, c)| !c.is_whitespace())
        .map(|(offset, c)| (end + offset, c));

    if let Some((comma_at, ',')) = after {
        cut_end = comma_at + 1;
    } else {
        // Last entry: remove the comma that precedes it instead.
        if let Some(comma_at) = source[..start].rfind(',') {
            if source[comma_at + 1..start].trim().is_empty() {
                cut_start = comma_at;
            }
        }
    }

    // Leave no blank line behind.
    let line_start = source[..cut_start].rfind('\n').map(|i| i + 1).unwrap_or(0);
    if source[line_start..cut_start].trim().is_empty() {
        cut_start = line_start.saturating_sub(1).max(0);
        if cut_start == 0 && line_start == 0 {
            cut_start = 0;
        }
    }

    let mut updated = String::with_capacity(source.len());
    updated.push_str(&source[..cut_start]);
    updated.push_str(&source[cut_end..]);

    commit(
        project_root,
        relative_file,
        export_name,
        array_path,
        updated,
        array.elements.len() - 1,
    )
}

/// Moves an entry to a new position, carrying its source text along.
pub fn move_item(
    project_root: &Path,
    relative_file: &str,
    export_name: &str,
    array_path: &str,
    from: usize,
    to: usize,
) -> AppResult<()> {
    let source = read(project_root, relative_file)?;
    let array = parser::locate_array(relative_file, &source, export_name, array_path)?;
    let count = array.elements.len();

    if from >= count || to >= count {
        return Err(AppError::Other("that entry no longer exists".into()));
    }
    if from == to {
        return Ok(());
    }

    // Rebuild the list from its own element texts in the new order, so only
    // the region between the brackets is touched.
    let mut texts: Vec<&str> = array
        .elements
        .iter()
        .map(|&(s, e)| &source[s..e])
        .collect();
    let moved = texts.remove(from);
    texts.insert(to, moved);

    let first = array.elements[0].0;
    let last = array.elements[count - 1].1;
    let indent = indent_before(&source, first);
    let separator = if indent.is_empty() {
        ", ".to_string()
    } else {
        format!(",\n{indent}")
    };

    let mut updated = String::with_capacity(source.len());
    updated.push_str(&source[..first]);
    updated.push_str(&texts.join(&separator));
    updated.push_str(&source[last..]);

    commit(
        project_root,
        relative_file,
        export_name,
        array_path,
        updated,
        count,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(contents: &str) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().expect("tempdir");
        let root = dir.path().to_path_buf();
        std::fs::create_dir_all(root.join("src/data")).unwrap();
        std::fs::write(root.join("src/data/t.js"), contents).unwrap();
        (dir, root)
    }

    fn read_back(root: &Path) -> String {
        std::fs::read_to_string(root.join("src/data/t.js")).unwrap()
    }

    fn items(root: &Path, export: &str, path: &str) -> Vec<String> {
        let source = read_back(root);
        parser::locate_array("src/data/t.js", &source, export, path)
            .unwrap()
            .elements
            .iter()
            .map(|&(s, e)| source[s..e].to_string())
            .collect()
    }

    const SECTIONS: &str = r#"export const page = {
    id: 'home',
    sections: [
        { sectionId: 'hero', props: {} },
        { sectionId: 'about', props: {} },
        { sectionId: 'tracks', props: {} }
    ]
};
"#;

    #[test]
    fn duplicates_an_entry_in_place() {
        let (_g, root) = scratch(SECTIONS);
        duplicate_item(&root, "src/data/t.js", "page", "sections", 1).unwrap();

        let found = items(&root, "page", "sections");
        assert_eq!(found.len(), 4);
        assert_eq!(found[1], found[2], "the copy should match its original");
        assert!(found[2].contains("about"));
    }

    #[test]
    fn removes_the_last_entry_without_leaving_a_stray_comma() {
        let (_g, root) = scratch(SECTIONS);
        remove_item(&root, "src/data/t.js", "page", "sections", 2).unwrap();

        let found = items(&root, "page", "sections");
        assert_eq!(found.len(), 2);
        assert!(!read_back(&root).contains("tracks"));
    }

    #[test]
    fn removes_a_middle_entry() {
        let (_g, root) = scratch(SECTIONS);
        remove_item(&root, "src/data/t.js", "page", "sections", 1).unwrap();

        let found = items(&root, "page", "sections");
        assert_eq!(found.len(), 2);
        assert!(found[0].contains("hero"));
        assert!(found[1].contains("tracks"));
    }

    #[test]
    fn reorders_entries() {
        let (_g, root) = scratch(SECTIONS);
        move_item(&root, "src/data/t.js", "page", "sections", 2, 0).unwrap();

        let found = items(&root, "page", "sections");
        assert_eq!(found.len(), 3);
        assert!(found[0].contains("tracks"), "got {:?}", found[0]);
        assert!(found[1].contains("hero"));
        assert!(found[2].contains("about"));
    }

    #[test]
    fn works_on_a_nested_list_of_strings() {
        let (_g, root) = scratch(
            "export const d = { track: { topics: ['One', 'Two', 'Three'] } };\n",
        );
        duplicate_item(&root, "src/data/t.js", "d", "track.topics", 0).unwrap();
        assert_eq!(items(&root, "d", "track.topics").len(), 4);

        remove_item(&root, "src/data/t.js", "d", "track.topics", 0).unwrap();
        assert_eq!(items(&root, "d", "track.topics").len(), 3);
    }

    /// Exercises the operations against a real project's own data files,
    /// which are far messier than a hand-written fixture — nested objects,
    /// comments, trailing commas, mixed quoting:
    ///   WEAVR_TEST_PROJECT=C:/Github/IATMSI cargo test round_trips_real -- --nocapture
    #[test]
    fn round_trips_real_project_files() {
        let Ok(project) = std::env::var("WEAVR_TEST_PROJECT") else {
            eprintln!("skipped: set WEAVR_TEST_PROJECT to a conference site checkout");
            return;
        };

        let cases = [
            ("pageRegistry.js", "pageRegistry", "[0].sections"),
            ("committeeData.js", "committeeGroupManifest", ""),
            ("tracksData.js", "tracks", ""),
        ];

        for (file_name, export, path) in cases {
            let original =
                match std::fs::read_to_string(Path::new(&project).join("src/data").join(file_name))
                {
                    Ok(text) => text,
                    Err(_) => continue,
                };

            let (_guard, root) = scratch(&original);
            let rel = "src/data/t.js";

            let before = parser::locate_array(rel, &original, export, path)
                .unwrap_or_else(|e| panic!("{file_name}: {e}"))
                .elements
                .len();
            assert!(before > 1, "{file_name} needs several entries to test");

            duplicate_item(&root, rel, export, path, 0).unwrap();
            assert_eq!(items(&root, export, path).len(), before + 1);

            move_item(&root, rel, export, path, 0, before).unwrap();
            assert_eq!(items(&root, export, path).len(), before + 1);

            remove_item(&root, rel, export, path, before).unwrap();
            assert_eq!(items(&root, export, path).len(), before);

            // Every string in the file must still be readable afterwards,
            // which is the real proof the splices left valid JavaScript.
            let after = read_back(&root);
            assert!(
                parser::parse_source(rel, &after).is_ok(),
                "{file_name} no longer parses after editing"
            );
            println!("{file_name}: {before} entries, add/move/remove all clean");
        }
    }

    #[test]
    fn refuses_an_index_that_does_not_exist() {
        let (_g, root) = scratch(SECTIONS);
        assert!(duplicate_item(&root, "src/data/t.js", "page", "sections", 9).is_err());
        // The file must be left exactly as it was.
        assert_eq!(read_back(&root), SECTIONS);
    }
}
