//! The site's pages, and the kinds of section they can be built from.
//!
//! A template following the contract describes its pages in data rather than
//! in code: `pageRegistry` lists the pages, each with the sections it shows,
//! and the router generates a route per entry. So adding a page is adding an
//! object to an array — no file to create, no route to wire — and adding a
//! section is adding an object to the `sections` array inside one.
//!
//! That is what makes structural editing possible at all. Weavr never writes
//! React; it writes data the site already knows how to render.
//!
//! Everything here is read out of the content index rather than parsed again.
//! The index already walks every data file and records each string with the
//! path it sits at, which is exactly the information a page registry is made
//! of.

use serde::Serialize;

use crate::error::{AppError, AppResult};

use super::index::ContentIndex;

/// Part of the template contract, alongside `src/data/*.js` for content.
pub const REGISTRY_FILE: &str = "src/data/pageRegistry.js";
pub const PAGES_EXPORT: &str = "pageRegistry";
pub const MANIFEST_EXPORT: &str = "sectionManifest";

/// One kind of section the site can render — an entry in `sectionManifest`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SectionKind {
    /// The `sectionId` written into a page's list.
    pub id: String,
    /// The React component behind it, for labelling the catalogue.
    pub component: String,
}

/// One section as it appears on a page.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct PageSection {
    /// Position in the page's `sections` array — how it is addressed.
    pub index: usize,
    pub section_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Page {
    /// Position in `pageRegistry` — how the page is addressed for edits.
    pub index: usize,
    pub id: String,
    pub title: String,
    pub path: String,
    pub sections: Vec<PageSection>,
}

impl Page {
    /// The array path of this page's section list, for the structure
    /// operations: `[2].sections`.
    pub fn sections_path(&self) -> String {
        format!("[{}].sections", self.index)
    }
}

/// "[2].sections[0].sectionId" -> (2, Some(0), "sectionId")
///
/// Returned as parts rather than matched with a regex so a path shape the
/// template grows later fails to match instead of half-matching.
fn split_path(json_path: &str) -> Option<(usize, Option<usize>, &str)> {
    let rest = json_path.strip_prefix('[')?;
    let (outer, rest) = rest.split_once(']')?;
    let outer: usize = outer.parse().ok()?;

    let rest = rest.strip_prefix('.')?;
    match rest.split_once('[') {
        None => Some((outer, None, rest)),
        Some((field, tail)) => {
            let (inner, tail) = tail.split_once(']')?;
            let inner: usize = inner.parse().ok()?;
            // Only the sections list has an inner index worth following.
            if field != "sections" {
                return None;
            }
            Some((outer, Some(inner), tail.strip_prefix('.')?))
        }
    }
}

fn grow<T: Default>(list: &mut Vec<T>, index: usize) -> &mut T {
    while list.len() <= index {
        list.push(T::default());
    }
    &mut list[index]
}

#[derive(Default)]
struct PageDraft {
    id: String,
    title: String,
    path: String,
    sections: Vec<String>,
}

/// Every kind of section the site declares it can render.
pub fn catalogue(index: &ContentIndex) -> Vec<SectionKind> {
    let mut kinds: Vec<(String, String)> = Vec::new();

    for leaf in index.leaves() {
        if leaf.file != REGISTRY_FILE || leaf.export_name != MANIFEST_EXPORT {
            continue;
        }
        let Some((position, None, field)) = split_path(&leaf.json_path) else {
            continue;
        };
        let entry = grow(&mut kinds, position);
        match field {
            "id" => entry.0 = leaf.value.clone(),
            "component" => entry.1 = leaf.value.clone(),
            _ => {}
        }
    }

    kinds
        .into_iter()
        // A manifest entry with no id cannot be added to a page: the id is the
        // whole of what gets written into the section list.
        .filter(|(id, _)| !id.is_empty())
        .map(|(id, component)| SectionKind { id, component })
        .collect()
}

/// Every page on the site, with the sections it shows, in order.
pub fn pages(index: &ContentIndex) -> Vec<Page> {
    let mut drafts: Vec<PageDraft> = Vec::new();

    for leaf in index.leaves() {
        if leaf.file != REGISTRY_FILE || leaf.export_name != PAGES_EXPORT {
            continue;
        }
        let Some((position, section, field)) = split_path(&leaf.json_path) else {
            continue;
        };
        let draft = grow(&mut drafts, position);

        match (section, field) {
            (None, "id") => draft.id = leaf.value.clone(),
            (None, "title") => draft.title = leaf.value.clone(),
            (None, "path") => draft.path = leaf.value.clone(),
            (Some(at), "sectionId") => *grow(&mut draft.sections, at) = leaf.value.clone(),
            _ => {}
        }
    }

    drafts
        .into_iter()
        .enumerate()
        .filter(|(_, draft)| !draft.id.is_empty())
        .map(|(index, draft)| Page {
            index,
            id: draft.id,
            title: draft.title,
            path: draft.path,
            sections: draft
                .sections
                .into_iter()
                .enumerate()
                .map(|(index, section_id)| PageSection { index, section_id })
                .collect(),
        })
        .collect()
}

/// Looks a page up the way the preview refers to it — by its id, which is what
/// the rendered page carries, rather than by a position that shifts the moment
/// a page is added above it.
pub fn find(index: &ContentIndex, page_id: &str) -> AppResult<Page> {
    pages(index)
        .into_iter()
        .find(|page| page.id == page_id)
        .ok_or_else(|| AppError::Other(format!("there is no page '{page_id}'")))
}

/// Where the site's menu lives, so a new page can be reached by browsing to it
/// rather than only by knowing the URL.
pub const NAV_FILE: &str = "src/data/navigationData.js";
pub const NAV_EXPORT: &str = "navigationTree";

/// "Keynote & Invited Talks" -> "keynote-invited-talks"
///
/// Used for both the page id and its URL, so what someone types as a title
/// decides both and there is nothing further to fill in.
pub fn slug(text: &str) -> String {
    let mut out = String::new();
    let mut pending_dash = false;

    for ch in text.chars() {
        if ch.is_ascii_alphanumeric() {
            if pending_dash && !out.is_empty() {
                out.push('-');
            }
            pending_dash = false;
            out.extend(ch.to_lowercase());
        } else {
            pending_dash = true;
        }
    }
    out
}

/// A slug no existing page is already using.
///
/// Two pages sharing an id would make `find` ambiguous and two sharing a path
/// would leave the second unreachable — the router matches the first and never
/// reaches the other. Neither fails loudly, so both are prevented here.
pub fn unique_slug(index: &ContentIndex, desired: &str) -> String {
    let existing = pages(index);
    let taken = |candidate: &str| {
        existing
            .iter()
            .any(|page| page.id == candidate || page.path == format!("/{candidate}"))
    };

    if !taken(desired) {
        return desired.to_string();
    }
    for suffix in 2..1000 {
        let candidate = format!("{desired}-{suffix}");
        if !taken(&candidate) {
            return candidate;
        }
    }
    format!("{desired}-{}", std::process::id())
}

/// Checks a page can be added before anything is written.
pub fn validate_new(index: &ContentIndex, id: &str, path: &str) -> AppResult<()> {
    if id.is_empty() {
        return Err(AppError::Other(
            "give the page a name with at least one letter or number in it".into(),
        ));
    }
    if !path.starts_with('/') {
        return Err(AppError::Other(format!("'{path}' has to start with a /")));
    }

    for page in pages(index) {
        if page.id == id {
            return Err(AppError::Other(format!(
                "there is already a page called '{id}'"
            )));
        }
        if page.path == path {
            // The router matches the first entry, so the second would simply
            // never open — a page that exists and cannot be reached.
            return Err(AppError::Other(format!(
                "'{}' already uses the address {path}",
                page.title
            )));
        }
    }
    Ok(())
}

/// The source for a new page.
///
/// Written multi-line with the same indentation the registry already uses, so
/// the file still reads as something a person maintains by hand — which they
/// will, the moment they want something Weavr cannot do.
pub fn page_literal(id: &str, title: &str, path: &str, section_ids: &[String]) -> String {
    let sections = section_ids
        .iter()
        .map(|section_id| format!("            {}", section_literal(section_id)))
        .collect::<Vec<_>>()
        .join(",\n");

    format!(
        "{{\n        id: '{id}',\n        title: '{}',\n        path: '{path}',\n        sections: [{}]\n    }}",
        escape(title),
        if sections.is_empty() {
            String::new()
        } else {
            format!("\n{sections}\n        ")
        }
    )
}

/// A menu entry pointing at a page.
pub fn nav_literal(id: &str, label: &str, path: &str) -> String {
    format!(
        "{{ id: '{id}', label: '{}', type: 'link', path: '{path}' }}",
        escape(label)
    )
}

/// Titles are written into single-quoted literals, so a quote or a backslash
/// in one would end the string early and leave the file unparseable.
fn escape(text: &str) -> String {
    text.replace('\\', "\\\\").replace('\'', "\\'")
}

/// The source for a new section entry.
///
/// `props` is left empty rather than omitted so the object matches the shape
/// every other entry has, and so there is somewhere for appearance settings to
/// be written later without restructuring the line.
pub fn section_literal(section_id: &str) -> String {
    format!("{{ sectionId: '{section_id}', props: {{}} }}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::content::parser::LeafRecord;

    fn leaf(export: &str, path: &str, value: &str) -> LeafRecord {
        LeafRecord {
            file: REGISTRY_FILE.to_string(),
            export_name: export.to_string(),
            json_path: path.to_string(),
            value: value.to_string(),
            start_byte: 0,
            end_byte: 0,
            is_structural: true,
            is_number: false,
        }
    }

    fn sample() -> ContentIndex {
        ContentIndex::from_leaves(vec![
            leaf(MANIFEST_EXPORT, "[0].id", "hero"),
            leaf(MANIFEST_EXPORT, "[0].component", "HeroSection"),
            leaf(MANIFEST_EXPORT, "[1].id", "faqsSection"),
            leaf(MANIFEST_EXPORT, "[1].component", "FaqsSection"),
            leaf(PAGES_EXPORT, "[0].id", "home"),
            leaf(PAGES_EXPORT, "[0].title", "Home"),
            leaf(PAGES_EXPORT, "[0].path", "/"),
            leaf(PAGES_EXPORT, "[0].sections[0].sectionId", "hero"),
            leaf(PAGES_EXPORT, "[0].sections[1].sectionId", "faqsSection"),
            leaf(PAGES_EXPORT, "[1].id", "about"),
            leaf(PAGES_EXPORT, "[1].title", "About"),
            leaf(PAGES_EXPORT, "[1].path", "/about"),
            leaf(PAGES_EXPORT, "[1].sections[0].sectionId", "hero"),
        ])
    }

    #[test]
    fn reads_the_catalogue_of_section_kinds() {
        let kinds = catalogue(&sample());
        assert_eq!(
            kinds,
            vec![
                SectionKind { id: "hero".into(), component: "HeroSection".into() },
                SectionKind { id: "faqsSection".into(), component: "FaqsSection".into() },
            ]
        );
    }

    #[test]
    fn reads_each_page_with_its_sections_in_order() {
        let pages = pages(&sample());
        assert_eq!(pages.len(), 2);

        assert_eq!(pages[0].id, "home");
        assert_eq!(pages[0].path, "/");
        assert_eq!(
            pages[0].sections.iter().map(|s| s.section_id.as_str()).collect::<Vec<_>>(),
            vec!["hero", "faqsSection"]
        );

        assert_eq!(pages[1].id, "about");
        assert_eq!(pages[1].sections.len(), 1);
    }

    #[test]
    fn a_page_knows_the_path_its_sections_live_at() {
        let pages = pages(&sample());
        assert_eq!(pages[0].sections_path(), "[0].sections");
        assert_eq!(pages[1].sections_path(), "[1].sections");
    }

    #[test]
    fn a_page_is_found_by_id_not_by_position() {
        // The preview knows which page it is showing, not where that page sits
        // in the file — and the position moves whenever a page is added above.
        let index = sample();
        assert_eq!(find(&index, "about").unwrap().index, 1);
        assert!(find(&index, "nope").is_err());
    }

    #[test]
    fn values_from_other_files_are_ignored() {
        let mut other = leaf(PAGES_EXPORT, "[0].id", "impostor");
        other.file = "src/data/heroData.js".into();

        let index = ContentIndex::from_leaves(vec![
            other,
            leaf(PAGES_EXPORT, "[0].id", "home"),
            leaf(PAGES_EXPORT, "[0].path", "/"),
        ]);
        let pages = pages(&index);
        assert_eq!(pages.len(), 1);
        assert_eq!(pages[0].id, "home");
    }

    #[test]
    fn a_new_section_entry_has_somewhere_to_put_its_appearance() {
        assert_eq!(section_literal("faqsSection"), "{ sectionId: 'faqsSection', props: {} }");
    }

    #[test]
    fn a_title_becomes_an_address() {
        assert_eq!(slug("Keynote & Invited Talks"), "keynote-invited-talks");
        assert_eq!(slug("  Awards  "), "awards");
        assert_eq!(slug("IATMSI-2027"), "iatmsi-2027");
        assert_eq!(slug("!!!"), "");
    }

    #[test]
    fn a_new_page_never_takes_an_address_that_is_in_use() {
        // Two pages on one path is not an error anyone sees: the router
        // matches the first and the second simply never opens.
        let index = sample();
        assert_eq!(unique_slug(&index, "team"), "team");
        assert_eq!(unique_slug(&index, "about"), "about-2");
    }

    #[test]
    fn a_page_that_would_clash_is_refused_before_anything_is_written() {
        let index = sample();
        assert!(validate_new(&index, "team", "/team").is_ok());
        assert!(validate_new(&index, "about", "/team").is_err(), "duplicate id allowed");
        assert!(validate_new(&index, "team", "/about").is_err(), "duplicate path allowed");
        assert!(validate_new(&index, "", "/team").is_err(), "empty id allowed");
        assert!(validate_new(&index, "team", "team").is_err(), "path without a / allowed");
    }

    #[test]
    fn a_new_page_reads_back_as_the_page_that_was_asked_for() {
        let literal = page_literal("team", "Our Team", "/team", &["hero".into(), "faqs".into()]);
        let source = format!("export const pageRegistry = [\n    {literal}\n];\n");

        let leaves = crate::content::parser::parse_source(REGISTRY_FILE, &source).unwrap();
        let built = pages(&ContentIndex::from_leaves(leaves));

        assert_eq!(built.len(), 1);
        assert_eq!(built[0].id, "team");
        assert_eq!(built[0].title, "Our Team");
        assert_eq!(built[0].path, "/team");
        assert_eq!(
            built[0].sections.iter().map(|s| s.section_id.as_str()).collect::<Vec<_>>(),
            vec!["hero", "faqs"]
        );
    }

    #[test]
    fn a_page_with_no_sections_yet_is_still_a_valid_file() {
        let literal = page_literal("blank", "Blank", "/blank", &[]);
        let source = format!("export const pageRegistry = [\n    {literal}\n];\n");

        let built = pages(&ContentIndex::from_leaves(
            crate::content::parser::parse_source(REGISTRY_FILE, &source).unwrap(),
        ));
        assert_eq!(built.len(), 1);
        assert!(built[0].sections.is_empty());
    }

    #[test]
    fn a_quote_in_a_title_does_not_break_the_file() {
        // Titles are written into single-quoted literals. An apostrophe is
        // ordinary in a conference title — "Chair's Welcome" — and would end
        // the string early, leaving a site that will not build.
        let literal = page_literal("welcome", "Chair's Welcome", "/welcome", &[]);
        let source = format!("export const pageRegistry = [\n    {literal}\n];\n");

        let built = pages(&ContentIndex::from_leaves(
            crate::content::parser::parse_source(REGISTRY_FILE, &source).unwrap(),
        ));
        assert_eq!(built.len(), 1, "the file did not parse: {source}");
        assert_eq!(built[0].title, "Chair's Welcome");
    }

    /// The sample above is the shape this module expects. A real registry is
    /// hand-written and has commented-out sections, nested template literals
    /// in props and pages added over years — which is where an assumption
    /// about shape actually breaks.
    #[test]
    fn reads_a_real_site_registry() {
        let Ok(project) = std::env::var("WEAVR_TEST_PROJECT") else {
            eprintln!("skipped: set WEAVR_TEST_PROJECT to a conference site checkout");
            return;
        };

        let index = ContentIndex::build(std::path::Path::new(&project)).unwrap();

        let kinds = catalogue(&index);
        assert!(kinds.len() > 5, "only found {} section kinds", kinds.len());
        assert!(
            kinds.iter().all(|k| !k.id.is_empty() && !k.component.is_empty()),
            "a catalogue entry is missing its id or component: {kinds:?}"
        );

        let pages = pages(&index);
        assert!(pages.len() > 3, "only found {} pages", pages.len());

        for page in &pages {
            assert!(!page.path.is_empty(), "page '{}' has no path", page.id);
            assert!(
                !page.sections.is_empty(),
                "page '{}' came back with no sections",
                page.id
            );
            // Deliberately not asserted: that every section a page uses is in
            // the manifest. A real site has sections wired into the resolver
            // but never declared, and they render perfectly well — the
            // manifest is what can be *added*, not what exists. Weavr has to
            // read such a page without complaint, which is what this loop
            // checks by getting here at all.
            for section in &page.sections {
                assert!(
                    !section.section_id.is_empty(),
                    "page '{}' has a section with no id at position {}",
                    page.id,
                    section.index
                );
            }
        }

        // Positions have to be the real ones: they are what edits are applied
        // at, so an off-by-one here would rewrite the wrong page.
        let home = find(&index, "home").expect("no page with id 'home'");
        assert_eq!(home.sections_path(), format!("[{}].sections", home.index));
    }

    /// A new page, added to the real registry and the real menu.
    ///
    /// The menu half is the part worth doing on the real file: it is wrapped
    /// in `listed([...])`, so it exercises whether a list behind a call can
    /// actually be written to, not just read.
    #[test]
    fn creates_a_page_in_a_real_site_and_puts_it_in_the_menu() {
        let Ok(project) = std::env::var("WEAVR_TEST_PROJECT") else {
            eprintln!("skipped: set WEAVR_TEST_PROJECT to a conference site checkout");
            return;
        };
        let source = std::path::Path::new(&project);
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src/data")).unwrap();

        for file in [REGISTRY_FILE, NAV_FILE] {
            let Ok(text) = std::fs::read_to_string(source.join(file)) else {
                eprintln!("skipped: no {file} in the test project");
                return;
            };
            std::fs::write(root.join(file), text).unwrap();
        }

        let index = ContentIndex::build(root).unwrap();
        let before = pages(&index);
        let menu_before =
            crate::content::parser::locate_array(
                NAV_FILE,
                &std::fs::read_to_string(root.join(NAV_FILE)).unwrap(),
                NAV_EXPORT,
                "",
            )
            .expect("the menu could not be read")
            .elements
            .len();
        assert!(menu_before > 1, "the menu should have several entries");

        let title = "Chair's Welcome";
        let id = unique_slug(&index, &slug(title));
        let path = format!("/{id}");
        validate_new(&index, &id, &path).unwrap();

        let kind = catalogue(&index).into_iter().next().expect("no section kinds");
        crate::content::structure::insert_item(
            root,
            REGISTRY_FILE,
            PAGES_EXPORT,
            "",
            before.len(),
            &page_literal(&id, title, &path, &[kind.id.clone()]),
        )
        .unwrap();
        crate::content::structure::insert_item(
            root,
            NAV_FILE,
            NAV_EXPORT,
            "",
            menu_before,
            &nav_literal(&id, title, &path),
        )
        .unwrap();

        let after = pages(&ContentIndex::build(root).unwrap());
        assert_eq!(after.len(), before.len() + 1);

        let created = find(&ContentIndex::build(root).unwrap(), &id).expect("the page is not there");
        assert_eq!(created.title, title, "the apostrophe was not carried through");
        assert_eq!(created.path, path);
        assert_eq!(created.sections.len(), 1);
        assert_eq!(created.sections[0].section_id, kind.id);

        // Every page that was already there comes through untouched.
        for page in &before {
            let same = after.iter().find(|p| p.id == page.id).expect("a page went missing");
            assert_eq!(same, page, "page '{}' changed", page.id);
        }

        let menu_after = crate::content::parser::locate_array(
            NAV_FILE,
            &std::fs::read_to_string(root.join(NAV_FILE)).unwrap(),
            NAV_EXPORT,
            "",
        )
        .expect("the menu no longer reads back")
        .elements
        .len();
        assert_eq!(menu_after, menu_before + 1, "the page was not added to the menu");
    }

    /// End to end on the real file, because addressing is the whole risk here.
    /// Reading a page and writing to it are two separate pieces of counting,
    /// and an edit that lands on the wrong page or the wrong position is not
    /// something the user can be expected to notice before publishing.
    #[test]
    fn adds_a_section_to_the_right_page_of_a_real_registry() {
        let Ok(project) = std::env::var("WEAVR_TEST_PROJECT") else {
            eprintln!("skipped: set WEAVR_TEST_PROJECT to a conference site checkout");
            return;
        };
        let Ok(original) = std::fs::read_to_string(
            std::path::Path::new(&project).join(REGISTRY_FILE),
        ) else {
            eprintln!("skipped: no {REGISTRY_FILE} in the test project");
            return;
        };

        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        std::fs::create_dir_all(root.join("src/data")).unwrap();
        std::fs::write(root.join(REGISTRY_FILE), &original).unwrap();

        let index = ContentIndex::build(root).unwrap();
        let before = pages(&index);
        // A page that is not first or last, so a mistake in either direction
        // has somewhere to show up.
        let target = before
            .iter()
            .find(|p| p.index > 0 && p.index + 1 < before.len() && p.sections.len() > 1)
            .expect("no middle page with several sections")
            .clone();
        let kind = catalogue(&index)
            .into_iter()
            .find(|k| !target.sections.iter().any(|s| s.section_id == k.id))
            .expect("every section kind is already on that page");

        let at = 1;
        crate::content::structure::insert_item(
            root,
            REGISTRY_FILE,
            PAGES_EXPORT,
            &target.sections_path(),
            at,
            &section_literal(&kind.id),
        )
        .unwrap();

        let after = pages(&ContentIndex::build(root).unwrap());
        assert_eq!(after.len(), before.len(), "a page appeared or vanished");

        let edited = after.iter().find(|p| p.id == target.id).unwrap();
        assert_eq!(
            edited.sections.len(),
            target.sections.len() + 1,
            "the section did not land on '{}'",
            target.id
        );
        assert_eq!(edited.sections[at].section_id, kind.id, "it landed at the wrong position");
        assert_eq!(
            edited.sections[0].section_id, target.sections[0].section_id,
            "the section above it moved"
        );
        assert_eq!(
            edited.sections[at + 1].section_id,
            target.sections[at].section_id,
            "the section it displaced is not directly below it"
        );

        // Every other page has to come through untouched — this is the check
        // that catches an edit applied to the wrong page entirely.
        for page in &before {
            if page.id == target.id {
                continue;
            }
            let same = after.iter().find(|p| p.id == page.id).expect("a page went missing");
            assert_eq!(same, page, "page '{}' changed but should not have", page.id);
        }
    }
}
