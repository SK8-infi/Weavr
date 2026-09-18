// Weavr click-to-edit bridge.
//
// Injected by Weavr into the preview webview — the conference site itself
// contains none of this, so any site following the template contract becomes
// editable without modification.
//
// Weavr pushes the list of editable strings (value -> field id) once per load.
// We match rendered text nodes against it, make the matches editable in place,
// and emit an event back to Rust when one changes. Text that doesn't resolve
// to exactly one data field is left alone rather than guessed at.

(function () {
  if (window.__weavrEditBridge) return;

  const STYLE_ID = "weavr-edit-styles";
  const EDITABLE_ATTR = "data-weavr-field";
  /** Text that came from the data but matches more than one field. */
  const AMBIGUOUS_ATTR = "data-weavr-ambiguous";

  /** @type {Map<string, Array<{field_id: string, source: string}>>} */
  let valueIndex = new Map();
  /** Stored form of each value, markers intact. */
  let rawByValue = new Map();
  /** Bounds how far up the tree a match is worth looking for. */
  let maxValueLength = 0;

  /**
   * The child nodes React rendered, kept while Weavr has an element open for
   * editing.
   *
   * React holds direct references to these nodes in its fiber tree. Editing
   * replaces them — re-hydrating markers into markup, and execCommand building
   * its own tags — so the nodes React is still holding stop being in the
   * document. The next time it reconciles that element it calls removeChild on
   * a node that is no longer a child, which throws, and an uncaught error
   * during commit unmounts the entire tree: the whole page goes blank.
   *
   * Putting the very same node objects back before React touches the element
   * again is what prevents that. Fresh nodes with identical markup would not
   * do: it is the identity React matches on, not the shape.
   *
   * Each entry is `{ nodes, text, held }`. Typing mutates a text node's data in
   * place rather than replacing the node, so the nodes alone do not say what
   * the field looked like before the edit — `text` records that separately, and
   * is what a rollback puts back.
   */
  const reactNodes = new WeakMap();
  let enabled = false;

  const normalize = (text) => text.replace(/\s+/g, " ").trim();

  /** Drops emphasis markers, so stored text compares against rendered text. */
  const stripMarks = (text) =>
    text.replace(/\*\*|__|\*/g, "");

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      [${EDITABLE_ATTR}] {
        outline: 1px dashed rgba(79, 70, 229, 0.45);
        outline-offset: 2px;
        cursor: text;
        transition: outline-color 0.12s ease, background-color 0.12s ease;
      }
      [${EDITABLE_ATTR}]:hover {
        outline: 2px solid rgb(79, 70, 229);
        background-color: rgba(79, 70, 229, 0.06);
      }
      [${EDITABLE_ATTR}][contenteditable="true"]:focus {
        outline: 2px solid rgb(79, 70, 229);
        background-color: rgba(79, 70, 229, 0.1);
      }
      [${EDITABLE_ATTR}][data-weavr-saving="1"] {
        outline-color: rgb(202, 138, 4);
      }
      /* An edit that could not be saved, restored to its stored value. */
      [${EDITABLE_ATTR}][data-weavr-error="1"] {
        outline: 2px solid rgb(220, 38, 38);
        background-color: rgba(220, 38, 38, 0.08);
      }
      /* Backed by the data, but several fields share these words — clicking
         asks which one is meant instead of picking one. */
      [${AMBIGUOUS_ATTR}] {
        outline: 1px dashed rgba(217, 119, 6, 0.5);
        outline-offset: 2px;
        cursor: help;
      }
      [${AMBIGUOUS_ATTR}]:hover {
        outline: 2px solid rgb(217, 119, 6);
        background-color: rgba(217, 119, 6, 0.08);
      }
      /* The inline chooser. Deliberately styled as Weavr's own chrome so it
         reads as part of the tool, not part of the site being edited. */
      .weavr-popover {
        /* Fixed, so no ancestor's overflow can clip it and no scroll offset
           has to be reasoned about. */
        position: fixed;
        z-index: 2147483647;
        width: 288px;
        padding: 12px;
        border-radius: 14px;
        background: rgba(28, 25, 23, 0.93);
        backdrop-filter: blur(20px) saturate(150%);
        -webkit-backdrop-filter: blur(20px) saturate(150%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 18px 40px -12px rgba(0, 0, 0, 0.85);
        font-family: ui-sans-serif, "Segoe UI", system-ui, sans-serif;
        color: #faf7f2;
        text-align: left;
        cursor: default;
      }
      .weavr-popover-title {
        font-size: 11px;
        line-height: 1.5;
        color: #b5aca3;
        margin: 0 0 8px;
      }
      .weavr-popover-input {
        width: 100%;
        box-sizing: border-box;
        border: 0;
        border-radius: 9px;
        padding: 8px 10px;
        font: inherit;
        font-size: 13px;
        color: #faf7f2;
        background: rgba(0, 0, 0, 0.35);
        box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.12);
        outline: none;
        resize: vertical;
        min-height: 34px;
      }
      .weavr-popover-input:focus {
        box-shadow:
          inset 0 0 0 1.5px #e8a317,
          0 0 0 4px rgba(232, 163, 23, 0.18);
      }
      .weavr-popover-actions {
        display: flex;
        gap: 6px;
        margin-top: 10px;
      }
      .weavr-btn {
        flex: 1;
        border: 0;
        border-radius: 9px;
        padding: 7px 10px;
        font: inherit;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: filter 0.15s ease, background-color 0.15s ease;
      }
      .weavr-btn-primary {
        color: #23180a;
        background-image: linear-gradient(135deg, #f0b429, #b8621d);
        box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
      }
      .weavr-btn-primary:hover { filter: brightness(1.08); }
      .weavr-btn-secondary {
        color: #ece7e1;
        background: rgba(255, 255, 255, 0.09);
      }
      .weavr-btn-secondary:hover { background: rgba(255, 255, 255, 0.16); }
      .weavr-popover-wide { width: 340px; }
      .weavr-popover-hint {
        margin: 8px 0 0;
        font-size: 10px;
        line-height: 1.5;
        color: #9d938a;
      }
      /* Formatting bar, shown while a piece of text is being edited. */
      .weavr-toolbar {
        position: fixed;
        z-index: 2147483646;
        display: flex;
        gap: 2px;
        padding: 4px;
        border-radius: 10px;
        background: rgba(28, 25, 23, 0.94);
        backdrop-filter: blur(18px) saturate(150%);
        -webkit-backdrop-filter: blur(18px) saturate(150%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 12px 28px -10px rgba(0, 0, 0, 0.85);
      }
      .weavr-tool {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 7px;
        background: transparent;
        color: #ded8d1;
        font: 600 12px/1 ui-serif, Georgia, serif;
        cursor: pointer;
        transition: background-color 0.12s ease, color 0.12s ease;
      }
      .weavr-tool:hover { background: rgba(255, 255, 255, 0.12); color: #faf7f2; }
      .weavr-tool[aria-pressed="true"] { background: #e8a317; color: #23180a; }
      .weavr-tool[disabled] { opacity: 0.35; cursor: default; }
      .weavr-tool[disabled]:hover { background: transparent; color: #ded8d1; }
      .weavr-tool-sep {
        width: 1px;
        margin: 3px 3px;
        background: rgba(255, 255, 255, 0.14);
      }
      .weavr-tool-readout {
        min-width: 30px;
        padding: 0 2px;
        font: 500 10px/26px ui-sans-serif, system-ui, sans-serif;
        color: #b5aca3;
        text-align: center;
        text-transform: lowercase;
      }
      /* One glyph, rotated per alignment, so the four read as a set. */
      .weavr-tool-align-left,
      .weavr-tool-align-center,
      .weavr-tool-align-right,
      .weavr-tool-align-justify { font-size: 13px; line-height: 1; }
      .weavr-tool-align-left { text-align: left; letter-spacing: -1px; }
      .weavr-tool-align-right { text-align: right; letter-spacing: -1px; }
      .weavr-tool-align-justify { letter-spacing: 0; }
      .weavr-tool-b { font-weight: 800; }
      .weavr-tool-i { font-style: italic; }
      .weavr-tool-u { text-decoration: underline; }
      /* Marks the element the chooser is currently attached to. */
      [data-weavr-focus="1"] {
        outline: 2px solid #e8a317 !important;
        background-color: rgba(232, 163, 23, 0.12) !important;
      }
      /* Holding Ctrl/Cmd switches to using the site rather than editing it. */
      body.weavr-bypass [${EDITABLE_ATTR}] {
        cursor: pointer;
        outline-style: solid;
        outline-color: rgba(22, 163, 74, 0.6);
        background-color: rgba(22, 163, 74, 0.06);
      }
      /* ---- Layout mode -------------------------------------------------
         Rearranging a page is a different job from rewriting its words, and
         doing both at once means every click is ambiguous. In layout mode the
         text is left alone and the sections become the thing you handle.

         All of this chrome lives in one fixed layer on top of the page. None
         of it is ever inserted into the site's own markup: the framework
         rendering that markup holds references to those nodes, and putting
         something between them is what blanked the page once already. */
      .weavr-layer {
        position: fixed;
        inset: 0;
        z-index: 2147483640;
        pointer-events: none;
      }
      .weavr-layer > * { pointer-events: auto; }
      .weavr-outline {
        position: fixed;
        border: 2px solid #e8a317;
        border-radius: 8px;
        background: rgba(232, 163, 23, 0.07);
        pointer-events: none;
        transition: opacity 0.1s ease;
      }
      .weavr-tag {
        position: fixed;
        padding: 3px 8px;
        border-radius: 6px 6px 0 0;
        background: #e8a317;
        color: #23180a;
        font: 600 10px/1.4 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: 0.02em;
        white-space: nowrap;
        pointer-events: none;
      }
      .weavr-section-bar {
        position: fixed;
        display: flex;
        gap: 2px;
        padding: 4px;
        border-radius: 10px;
        background: rgba(28, 25, 23, 0.94);
        backdrop-filter: blur(18px) saturate(150%);
        -webkit-backdrop-filter: blur(18px) saturate(150%);
        box-shadow:
          inset 0 1px 0 rgba(255, 255, 255, 0.08),
          0 0 0 1px rgba(255, 255, 255, 0.1),
          0 12px 28px -10px rgba(0, 0, 0, 0.85);
      }
      .weavr-section-bar .weavr-tool-danger:hover {
        background: rgba(220, 38, 38, 0.9);
        color: #fff;
      }
      /* The seam between two sections, where a new one can go. */
      .weavr-seam {
        position: fixed;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 22px;
        opacity: 0;
        transition: opacity 0.12s ease;
      }
      .weavr-seam:hover,
      .weavr-seam[data-weavr-near="1"] { opacity: 1; }
      .weavr-seam::before {
        content: "";
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        border-radius: 2px;
        background: linear-gradient(90deg, transparent, #e8a317 18%, #e8a317 82%, transparent);
      }
      .weavr-seam-add {
        position: relative;
        width: 24px;
        height: 24px;
        border: 0;
        border-radius: 50%;
        background: #e8a317;
        color: #23180a;
        font: 700 15px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
        box-shadow: 0 3px 10px -2px rgba(0, 0, 0, 0.6);
      }
      .weavr-seam-add:hover { filter: brightness(1.1); transform: scale(1.08); }
      .weavr-catalogue {
        /* Positioned so a card's offsetTop is measured against this list,
           which is what decides whether it is in view. */
        position: relative;
        display: grid;
        /* minmax(0, ...) or a column grows to fit its content, and the
           content here is a section drawn at full desktop width. The cards
           would each be sized by whatever happened to be inside them. */
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 5px;
        max-height: 268px;
        margin-top: 8px;
        overflow-y: auto;
        /* A site has dozens of section kinds; the list scrolls rather than
           growing a popover taller than the window. */
        scrollbar-width: thin;
      }
      .weavr-catalogue-item {
        flex: none;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 5px;
        padding: 5px;
        border: 0;
        border-radius: 10px;
        background: rgba(255, 255, 255, 0.05);
        text-align: left;
        cursor: pointer;
        transition: background-color 0.12s ease, box-shadow 0.12s ease;
      }
      .weavr-catalogue-item:hover {
        background: rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 0 1.5px #e8a317;
      }
      .weavr-catalogue-name {
        font: 500 11px/1.3 ui-sans-serif, system-ui, sans-serif;
        color: #ece7e1;
        padding: 0 2px 1px;
      }
      /* The card's window onto the section. Fixed height so the list stays a
         tidy grid whatever the sections themselves are. */
      .weavr-preview {
        position: relative;
        width: 100%;
        height: 74px;
        border-radius: 6px;
        overflow: hidden;
        background: #fff;
        pointer-events: none;
      }
      .weavr-preview:not([data-weavr-loaded]):not([data-weavr-empty])::after {
        content: "";
        position: absolute;
        inset: 0;
        background: linear-gradient(100deg, #efeae3 30%, #f8f5f1 50%, #efeae3 70%);
        background-size: 200% 100%;
        animation: weavr-shimmer 1.1s linear infinite;
      }
      @keyframes weavr-shimmer {
        to { background-position: -200% 0; }
      }
      .weavr-preview[data-weavr-empty] {
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(255, 255, 255, 0.04);
        color: #8c837a;
        font: 500 10px/1 ui-sans-serif, system-ui, sans-serif;
      }
      /* The section itself, drawn at the width it was designed for and scaled
         down. Anything reacting to the pointer is inert: this is a picture. */
      .weavr-preview-stage {
        transform-origin: top left;
        pointer-events: none;
      }
      .weavr-tool-select {
        height: 26px;
        max-width: 92px;
        border: 0;
        border-radius: 7px;
        padding: 0 4px;
        background: rgba(255, 255, 255, 0.08);
        color: #ded8d1;
        font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
        cursor: pointer;
      }
      .weavr-tool-select:hover { background: rgba(255, 255, 255, 0.16); color: #faf7f2; }
      .weavr-tool-select option { background: #1c1917; color: #ded8d1; }
      body.weavr-layout [${EDITABLE_ATTR}] {
        outline: none !important;
        background-color: transparent !important;
        cursor: default;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * An element is editable when its ENTIRE visible text is one data value.
   *
   * Child markup is fine. Components routinely decorate a single data string —
   * bolding key phrases, wrapping a link — so requiring a childless element
   * would leave much of a page uneditable even though one field backs it.
   * Saving only ever writes textContent, never innerHTML, so the decoration is
   * regenerated by the component from the new text.
   *
   * Where an inner element also matches a field (a bolded phrase that is itself
   * a data value), the outermost match wins: it owns the whole string, and
   * nesting editables inside each other would make saves ambiguous.
   */
  /**
   * Picks which data field a rendered string belongs to.
   *
   * The same words often appear in several fields — a page title duplicated in
   * pageRegistry and in the section's own data, "Hybrid" as both the
   * conference mode and a statistic. Sections declare the data file they
   * render from (data-weavr-source), which usually narrows that to one. If it
   * doesn't, the text stays non-editable in place: overwriting the wrong field
   * would silently change a different part of the site.
   */
  /**
   * Every data source declared anywhere above this element.
   *
   * Collected from the whole ancestor chain rather than the nearest
   * declaration alone: an inner element often names a file broadly
   * ("committeeData") while an outer one names the exact list
   * ("committeeData.organizingCoreCommittee"). Stopping at the nearest would
   * take the vaguer of the two and throw away the only thing that identifies
   * the field.
   */
  function declarationsAbove(element) {
    const levels = [];
    for (let node = element; node && node !== document.body; node = node.parentElement) {
      const declared = node.getAttribute?.("data-weavr-source");
      if (declared) levels.push(declared.split(/\s+/).filter(Boolean));
    }
    return levels;
  }

  /**
   * Candidates left after honouring the declared data sources.
   *
   * Declarations are applied one level at a time, innermost first, and the
   * first level that pins the text to a single field wins. Merging every
   * ancestor's declaration into one set doesn't work: an outer section
   * legitimately names several files, which re-introduces the ambiguity a
   * nearer, narrower declaration had already settled. Walking outwards only
   * while still ambiguous also lets a list item inherit its list's identity —
   * a member card says "committeeData", the group around it says which
   * committee.
   *
   * Within a level, a declaration naming one export ("navigationData.
   * footerQuickLinks") beats one naming the whole file, since that is the only
   * thing separating two lists that live in the same file.
   */
  function narrowBySource(element, entries) {
    let best = entries;

    for (const sources of declarationsAbove(element)) {
      const exact = entries.filter((e) => sources.includes(e.qualified_source));
      const byFile = entries.filter((e) => sources.includes(e.source));
      const narrowed = exact.length > 0 ? exact : byFile;

      if (narrowed.length === 0) continue;
      if (narrowed.length < best.length || best === entries) best = narrowed;
      if (best.length === 1) return best;
    }

    return best;
  }

  /**
   * Picks which field a rendered string belongs to.
   *
   * `occurrences` maps each matched string to every element showing it, in
   * document order. When a string is repeated — a role like "Chair" held by
   * several people, a shared affiliation — the nth on screen is the nth in the
   * data, because components render lists in order.
   *
   * That pairing is only trusted when the counts agree exactly. If the page is
   * showing a filtered subset, the positions no longer line up, and guessing
   * would write to the wrong person's entry; the text stays non-editable in
   * place and can still be changed from the side panel.
   */
  function resolveField(element, entries, occurrences) {
    if (!entries || entries.length === 0) return null;
    if (entries.length === 1) return entries[0].field_id;

    const pool = narrowBySource(element, entries);
    if (pool.length === 1) return pool[0].field_id;

    const shown = occurrences?.get(normalize(element.textContent || ""));
    if (!shown || shown.length !== pool.length) return null;

    const position = shown.indexOf(element);
    return position === -1 ? null : pool[position].field_id;
  }

  /** Leaf-ish elements worth testing for a literal + field combination. */
  function composedElements() {
    return Array.from(document.body.querySelectorAll("*")).filter((el) => {
      if (el.closest("script, style, svg, textarea, input, [data-weavr-ignore]")) return false;
      if (el.children.length > 0) return false;
      const text = normalize(el.textContent || "");
      return text.length > 0 && text.length <= maxValueLength;
    });
  }

  /**
   * Finds a field whose value is embedded in this element's text, and returns
   * the literal text around it. Only accepts an unambiguous, single occurrence
   * — if the value appears twice, or several fields could fit, there's no way
   * to know which part of the string the user means to change.
   */
  function matchComposed(element, occurrences) {
    const text = normalize(element.textContent || "");
    let found = null;

    for (const [value, entries] of valueIndex) {
      // Very short values match far too eagerly ("2027" inside a date line).
      if (value.length < 8 || value.length >= text.length) continue;
      const at = text.indexOf(value);
      if (at === -1) continue;
      if (text.indexOf(value, at + 1) !== -1) continue;

      // A value embedded in a longer string can't be paired by position, so
      // only accept it when the source narrows it to exactly one field.
      const pool = narrowBySource(element, entries);
      if (pool.length !== 1) continue;
      const fieldId = pool[0].field_id;
      if (found) return null;

      found = {
        fieldId,
        prefix: text.slice(0, at),
        suffix: text.slice(at + value.length),
      };
    }

    return found;
  }

  /**
   * Gives a bare text node its own element so it can be made editable.
   *
   * Components often mix a data value straight into markup beside other
   * elements — `<span><span>Latest</span> Updates</span>`. "Updates" is a data
   * value, but no element wraps only it, so there is nothing to make editable.
   * A plain inline span changes nothing visually (it inherits everything and
   * adds no box) and gives the value an element of its own.
   */
  /**
   * Whether an element is actually laid out.
   *
   * Responsive markup keeps a second copy of the navigation in the DOM for
   * small screens. Counting those hidden copies makes the number of times a
   * string appears disagree with the number of fields holding it, which blocks
   * position-based matching for every repeated label on the page.
   *
   * Uses client rects rather than `offsetParent`, which is also null inside
   * any `position: fixed` subtree — that would wrongly discard a fixed header
   * and take the whole navigation with it. A `display: none` element has no
   * rects, while one that is merely transparent or behind a hover still does,
   * which is the distinction wanted here.
   */
  function isRendered(element) {
    return element === document.body || element.getClientRects().length > 0;
  }

  function wrapTextNode(textNode) {
    const existing = textNode.parentElement;
    if (existing?.dataset?.weavrWrapped === "1") return existing;

    const span = document.createElement("span");
    span.dataset.weavrWrapped = "1";
    textNode.replaceWith(span);
    span.appendChild(textNode);
    return span;
  }

  function elementsToMark() {
    const candidates = new Map();
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

    // First pass: find every element whose whole text is a known value, in
    // document order. Resolution waits until all of them are known, because
    // deciding which field a repeated string belongs to depends on how many
    // times the page shows it.
    const hits = [];
    const occurrences = new Map();
    const seen = new Set();

    // Collect first: wrapping mutates the tree, which would disturb a live
    // TreeWalker mid-iteration.
    const textNodes = [];
    while (walker.nextNode()) textNodes.push(walker.currentNode);

    for (const textNode of textNodes) {
      let parent = textNode.parentElement;
      if (!parent) continue;
      const ownText = normalize(textNode.textContent || "");
      if (!ownText) continue;
      if (parent.closest("script, style, svg, textarea, input, [data-weavr-ignore]")) {
        continue;
      }
      if (!isRendered(parent)) continue;

      // A value sitting directly among sibling elements has no element of its
      // own to edit, so give it one.
      if (
        valueIndex.has(ownText) &&
        normalize(parent.textContent || "") !== ownText &&
        parent.dataset.weavrWrapped !== "1"
      ) {
        parent = wrapTextNode(textNode);
      }

      // Climb while an ancestor's whole text could still be a data value.
      // Once it's longer than the longest value we know, no match is possible.
      let element = parent;
      while (element && element !== document.body) {
        const key = normalize(element.textContent || "");
        if (!key || key.length > maxValueLength) break;

        if (valueIndex.has(key) && !seen.has(element)) {
          seen.add(element);
          hits.push([element, key]);
          if (!occurrences.has(key)) occurrences.set(key, []);
          occurrences.get(key).push(element);
        }

        element = element.parentElement;
      }
    }

    for (const [element, key] of hits) {
      const entries = valueIndex.get(key);
      const fieldId = resolveField(element, entries, occurrences);
      if (fieldId) {
        candidates.set(element, { fieldId, prefix: "", suffix: "" });
      } else if (entries && entries.length > 1) {
        // The text is definitely from the data, but several fields hold the
        // same words and nothing on the page separates them. Rather than
        // guess — which would silently rewrite an unrelated part of the site
        // — offer it for the user to choose from in the panel.
        candidates.set(element, {
          ambiguous: narrowBySource(element, entries).map((e) => e.field_id),
        });
      }
    }

    // Text a component builds from a literal plus a field ("Track 5: " + title,
    // "Welcome to " + shortTitle) matches no field on its own. Remember the
    // literal parts so an edit can be mapped back to just the field's share of
    // the string.
    for (const element of composedElements()) {
      if (candidates.has(element)) continue;
      const composed = matchComposed(element, occurrences);
      if (composed) candidates.set(element, composed);
    }

    const matches = [];
    for (const [element, match] of candidates) {
      let ancestor = element.parentElement;
      let nested = false;
      while (ancestor) {
        if (candidates.has(ancestor)) {
          nested = true;
          break;
        }
        ancestor = ancestor.parentElement;
      }
      if (!nested && !element.hasAttribute(EDITABLE_ATTR)) {
        matches.push([element, match]);
      }
    }

    return matches;
  }

  function markEditable() {
    if (!enabled) return;
    for (const [element, match] of elementsToMark()) {
      if (match.ambiguous) {
        // Only the attribute is set — the click is caught by a delegated
        // listener on the document. A listener bound here would be lost the
        // moment the component re-rendered, which the hero carousel does on a
        // timer: the outline stayed but clicking it did nothing.
        element.setAttribute(AMBIGUOUS_ATTR, match.ambiguous.join(" "));
        continue;
      }
      element.setAttribute(EDITABLE_ATTR, match.fieldId);
      element.setAttribute("contenteditable", "true");
      element.setAttribute("spellcheck", "false");
      if (match.prefix) element.dataset.weavrPrefix = match.prefix;
      if (match.suffix) element.dataset.weavrSuffix = match.suffix;
      // Record the last-saved text once, when the element is first adopted.
      // It must NOT be refreshed as the user types, or a rejected save would
      // "roll back" to the unsaved text and the preview would show content
      // that was never written to disk.
      if (element.dataset.weavrOriginal === undefined) {
        const shown = normalize(element.textContent || "");
        element.dataset.weavrOriginal = shown;
        const raw = rawByValue.get(shown);
        if (raw) element.dataset.weavrMarks = raw;
      }
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("blur", onBlur);
      element.addEventListener("focus", onFocus);
    }
  }


  // ---------------------------------------------------------------------
  // Inline formatting
  //
  // Emphasis is stored in the text itself (`**bold**`, `*italic*`,
  // `__underline__`) rather than as markup, because the destination is a
  // plain string in a data file. The site's own renderer turns the markers
  // back into styling, which is why nothing here writes HTML.
  // ---------------------------------------------------------------------

  const MARKS = [
    { command: "bold", mark: "**", label: "B", cls: "weavr-tool-b", title: "Bold" },
    { command: "italic", mark: "*", label: "I", cls: "weavr-tool-i", title: "Italic" },
    { command: "underline", mark: "__", label: "U", cls: "weavr-tool-u", title: "Underline" },
  ];

  // ---------------------------------------------------------------------
  // Size and alignment
  //
  // Emphasis marks a run of text, so it can live inside the string. These
  // describe the whole field and have nowhere to go inside it, so they are
  // stored separately and keyed by field id — see content/styles.rs.
  //
  // The steps and names must match that file: a value it does not know is
  // refused, and one the site does not know renders no class at all.
  // ---------------------------------------------------------------------

  const SIZE_STEPS = ["sm", "base", "lg", "xl", "2xl"];
  const DEFAULT_SIZE = "base";

  const ALIGNMENTS = [
    { value: "left", label: "≡", title: "Align left" },
    { value: "center", label: "≡", title: "Centre" },
    { value: "right", label: "≡", title: "Align right" },
    { value: "justify", label: "≡", title: "Justify" },
  ];

  /** Field id -> { size, align }, pushed by Weavr with the values. */
  let fieldStyles = {};

  function styleOf(fieldId) {
    return fieldStyles[fieldId] || {};
  }

  /**
   * Shows a change straight away, before the file has been written and the dev
   * server has reloaded.
   *
   * Inline, because the published styling arrives as a class from the site's
   * own style file and the two must not fight: a reload drops these and the
   * class takes over. Without it, every size change would sit unchanged on
   * screen for as long as the round trip takes and read as a dead button.
   */
  const PREVIEW_SIZES = {
    sm: "0.85em",
    base: "",
    lg: "1.15em",
    xl: "1.35em",
    "2xl": "1.6em",
  };

  function previewStyle(fieldId) {
    const style = styleOf(fieldId);
    for (const element of selectorFor(fieldId)) {
      element.style.fontSize = PREVIEW_SIZES[style.size] ?? "";
      element.style.textAlign = style.align || "";
    }
  }

  /** Records the change locally, shows it, and asks Weavr to store it. */
  function setFieldStyle(fieldId, next) {
    const style = { ...styleOf(fieldId), ...next };
    // An unset value is absent rather than empty, so it round-trips as the
    // `None` the Rust side expects rather than as a size called "".
    if (!style.size || style.size === DEFAULT_SIZE) delete style.size;
    if (!style.align) delete style.align;

    if (style.size || style.align) fieldStyles[fieldId] = style;
    else delete fieldStyles[fieldId];

    previewStyle(fieldId);
    if (!emit("weavr://style-edited", { fieldId, size: style.size ?? null, align: style.align ?? null })) {
      console.error("[weavr] style not saved: the editor bridge is unavailable");
    }
  }

  let toolbar = null;

  function closeToolbar() {
    toolbar?.remove();
    toolbar = null;
  }

  function positionToolbar(element) {
    const box = element.getBoundingClientRect();
    const height = toolbar.offsetHeight || 34;
    const top = box.top - height - 6;
    toolbar.style.left = `${Math.max(8, box.left)}px`;
    // Below the text when there's no room above it.
    toolbar.style.top = `${top < 8 ? box.bottom + 6 : top}px`;
  }

  function refreshToolbarState() {
    if (!toolbar) return;
    for (const { command } of MARKS) {
      const button = toolbar.querySelector(`[data-weavr-mark="${command}"]`);
      if (button) {
        button.setAttribute("aria-pressed", String(document.queryCommandState?.(command) === true));
      }
    }

    const fieldId = toolbar.dataset.weavrFor;
    if (!fieldId) return;
    const style = styleOf(fieldId);

    for (const button of toolbar.querySelectorAll("[data-weavr-align]")) {
      const active = button.getAttribute("data-weavr-align") === style.align;
      button.setAttribute("aria-pressed", String(active));
    }

    const readout = toolbar.querySelector("[data-weavr-size-readout]");
    if (readout) readout.textContent = style.size || DEFAULT_SIZE;

    // Nothing smaller than the smallest step, nothing larger than the largest.
    const index = SIZE_STEPS.indexOf(style.size || DEFAULT_SIZE);
    toolbar.querySelector('[data-weavr-size="-1"]')?.toggleAttribute("disabled", index <= 0);
    toolbar.querySelector('[data-weavr-size="1"]')?.toggleAttribute(
      "disabled",
      index >= SIZE_STEPS.length - 1,
    );
  }

  function openToolbar(element) {
    closeToolbar();
    const fieldId = element.getAttribute(EDITABLE_ATTR);

    toolbar = document.createElement("div");
    toolbar.className = "weavr-toolbar";
    toolbar.setAttribute("data-weavr-ignore", "");
    toolbar.dataset.weavrFor = fieldId || "";

    const marks = MARKS.map(
      (m) =>
        `<button class="weavr-tool ${m.cls}" data-weavr-mark="${m.command}" title="${m.title}" aria-pressed="false">${m.label}</button>`,
    ).join("");

    // Size and alignment need a field id to attach to. Text that Weavr could
    // not resolve to exactly one field has none, so it gets emphasis only
    // rather than controls that would have nowhere to write.
    const styleTools = fieldId
      ? `<span class="weavr-tool-sep"></span>` +
        `<button class="weavr-tool" data-weavr-size="-1" title="Smaller">A−</button>` +
        `<span class="weavr-tool-readout" data-weavr-size-readout>${DEFAULT_SIZE}</span>` +
        `<button class="weavr-tool" data-weavr-size="1" title="Larger">A+</button>` +
        `<span class="weavr-tool-sep"></span>` +
        ALIGNMENTS.map(
          (a) =>
            `<button class="weavr-tool weavr-tool-align-${a.value}" data-weavr-align="${a.value}" title="${a.title}" aria-pressed="false">${a.label}</button>`,
        ).join("")
      : "";

    toolbar.innerHTML = marks + styleTools;

    // mousedown, not click: the default would blur the text being edited and
    // throw away the selection before the command could apply.
    toolbar.addEventListener("mousedown", (event) => {
      const target = event.target.closest?.("button");
      if (!target) return;
      event.preventDefault();

      if (target.hasAttribute("data-weavr-mark")) {
        document.execCommand(target.getAttribute("data-weavr-mark"));
      } else if (target.hasAttribute("data-weavr-size") && fieldId) {
        const step = Number(target.getAttribute("data-weavr-size"));
        const current = SIZE_STEPS.indexOf(styleOf(fieldId).size || DEFAULT_SIZE);
        const next = Math.min(SIZE_STEPS.length - 1, Math.max(0, current + step));
        setFieldStyle(fieldId, { size: SIZE_STEPS[next] });
      } else if (target.hasAttribute("data-weavr-align") && fieldId) {
        const value = target.getAttribute("data-weavr-align");
        // Clicking the active alignment clears it, so there is a way back to
        // whatever the design already did.
        setFieldStyle(fieldId, { align: styleOf(fieldId).align === value ? null : value });
      }

      refreshToolbarState();
    });

    document.body.appendChild(toolbar);
    positionToolbar(element);
    refreshToolbarState();
  }

  /** Converts the browser's formatting markup back into stored markers. */
  function htmlToMarks(root) {
    let out = "";

    const walk = (node, open) => {
      for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          out += child.textContent;
          continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) continue;

        const tag = child.nodeName.toLowerCase();
        const style = child.getAttribute?.("style") || "";
        let mark = "";
        if (tag === "b" || tag === "strong" || /font-weight:\s*(bold|[6-9]00)/.test(style)) {
          mark = "**";
        } else if (tag === "i" || tag === "em" || /font-style:\s*italic/.test(style)) {
          mark = "*";
        } else if (tag === "u" || /text-decoration[^;]*underline/.test(style)) {
          mark = "__";
        }

        /*
            An element with no text of its own must not get markers.

            Clicking Bold with nothing selected leaves an empty <strong> at the
            caret, which serialised to `****`. The site renders that literally —
            its pattern needs something between the markers — so the words on
            the page stopped matching the stored value, and matching is how this
            bridge decides what is editable. The paragraph could then only be
            repaired by hand.

            Nesting the same mark twice is refused for the same reason: it would
            also produce an empty pair.
        */
        const hasText = (child.textContent || "").trim() !== "";

        if (mark && hasText && !open.includes(mark)) {
          out += mark;
          walk(child, [...open, mark]);
          out += mark;
        } else {
          walk(child, open);
        }
      }
    };

    walk(root, []);
    return out;
  }

  /** Turns stored markers back into markup for editing. */
  function marksToHtml(text) {
    const escaped = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    return escaped
      .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/__([^_]+)__/g, "<u>$1</u>")
      .replace(/\*([^*]+)\*/g, "<i>$1</i>");
  }

  let popover = null;
  let popoverAnchor = null;

  function closePopover() {
    popover?.remove();
    popover = null;
    popoverAnchor?.removeAttribute("data-weavr-focus");
    popoverAnchor = null;
  }

  function selectorFor(fieldIds) {
    const ids = Array.isArray(fieldIds) ? fieldIds : [fieldIds];
    return ids.flatMap((id) =>
      Array.from(document.querySelectorAll(`[${EDITABLE_ATTR}="${CSS.escape(id)}"]`)),
    );
  }

  /** Keeps the chooser beside its element, and fully on screen. */
  function positionPopover(element) {
    const box = element.getBoundingClientRect();
    const width = 288;
    const height = popover.offsetHeight || 150;
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;

    const left = Math.min(Math.max(8, box.left), viewportW - width - 8);
    // Flip above the element when there isn't room beneath it.
    const below = box.bottom + 8;
    const top = below + height > viewportH ? Math.max(8, box.top - height - 8) : below;

    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
  }

  /**
   * Asks, on the page itself, which of several fields the user meant.
   *
   * The same words can be held by more than one field, and nothing in the
   * markup separates them. Rather than send the question off to the side
   * panel — which is usually collapsed, so the click would appear to do
   * nothing — the choice is offered right where it was made: change this one
   * occurrence, or every place that shares the text.
   */
  function onAmbiguousClick(event) {
    if (!enabled || isBypass(event)) return;
    const element = event.target.closest?.(`[${AMBIGUOUS_ATTR}]`);
    if (!element) return;
    // Clicks inside the chooser itself are its own business.
    if (event.target.closest?.(".weavr-popover")) return;

    event.preventDefault();
    event.stopPropagation();

    const fieldIds = (element.getAttribute(AMBIGUOUS_ATTR) || "")
      .split(" ")
      .filter(Boolean);
    if (fieldIds.length === 0) return;

    closePopover();
    popoverAnchor = element;
    element.setAttribute("data-weavr-focus", "1");

    const original = normalize(element.textContent || "");

    popover = document.createElement("div");
    popover.className = "weavr-popover";
    popover.setAttribute("data-weavr-ignore", "");
    popover.innerHTML = `
      <p class="weavr-popover-title">These words are used in ${fieldIds.length} places on your site.</p>
      <textarea class="weavr-popover-input" rows="2"></textarea>
      <div class="weavr-popover-actions">
        <button class="weavr-btn weavr-btn-secondary" data-weavr-action="one">Just here</button>
        <button class="weavr-btn weavr-btn-primary" data-weavr-action="all">Change all ${fieldIds.length}</button>
      </div>
      <p class="weavr-popover-hint">Escape to cancel.</p>
    `;

    const input = popover.querySelector(".weavr-popover-input");
    input.value = original;

    const save = (scope) => {
      const next = normalize(input.value);
      if (!next || next === original) {
        closePopover();
        return;
      }
      const targets = scope === "all" ? fieldIds : [fieldIds[0]];
      element.setAttribute("data-weavr-saving", "1");
      if (!emit("weavr://text-edited", { fieldIds: targets, newValue: next })) {
        element.removeAttribute("data-weavr-saving");
        element.setAttribute("data-weavr-error", "1");
        console.error("[weavr] edit not saved: the editor bridge is unavailable");
      }
      closePopover();
    };

    popover.addEventListener("click", (e) => {
      const action = e.target.closest?.("[data-weavr-action]");
      if (action) save(action.getAttribute("data-weavr-action"));
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closePopover();
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        save("one");
      }
    });

    document.body.appendChild(popover);
    positionPopover(element);
    input.focus();
    input.select();
  }

  // Clicking away or scrolling should dismiss it, like any other popover.
  function onDocumentPointerDown(event) {
    if (!popover) return;
    if (event.target.closest?.(".weavr-popover")) return;
    if (event.target.closest?.(`[${AMBIGUOUS_ATTR}]`) === popoverAnchor) return;
    closePopover();
  }

  function onFocus(event) {
    const element = event.currentTarget;

    // Taken before anything is changed, and unconditionally: plain typing
    // alters the text nodes React rendered just as much as the re-hydration
    // below replaces them.
    takeFromReact(element);

    // Re-hydrate the stored markers into markup so the words appear the way
    // they will be published, and the toolbar can toggle them.
    const marks = element.dataset.weavrMarks;
    if (marks && marks !== element.textContent) {
      element.innerHTML = marksToHtml(marks);
    }
    openToolbar(element);
    document.addEventListener("selectionchange", refreshToolbarState);
  }

  function onKeyDown(event) {
    // Typing again clears a previous failure so the warning reflects this
    // attempt, not an old one.
    event.currentTarget.removeAttribute("data-weavr-error");

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      event.currentTarget.blur();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      const element = event.currentTarget;
      restore(element);
      element.blur();
    }
  }

  function onBlur(event) {
    closeToolbar();
    document.removeEventListener("selectionchange", refreshToolbarState);
    const element = event.currentTarget;
    const fieldId = element.getAttribute(EDITABLE_ATTR);
    const original = element.dataset.weavrOriginal;

    /*
        Read the edit out of the DOM first, because every path below then hands
        the element back to React — and must, before React next renders it. It
        is holding direct references to the nodes it created here; finding them
        gone is what threw `removeChild` and took the whole page down.

        Handing back also rolls the wording back, so the field shows what is
        stored until the write lands and the reload brings the new text in.
    */
    const newValue = normalize(element.textContent || "");
    const marked = normalize(htmlToMarks(element));

    if (original === undefined) {
      restore(element);
      return;
    }
    if (!newValue) {
      // Refuse to blank a field by accident; restore and let the user use the
      // side panel if they really mean to clear it.
      restore(element);
      return;
    }

    // For text built from a literal plus a field, save only the field's share.
    // If the user changed the literal part, there's nothing sensible to write,
    // so put it back rather than guess.
    const prefix = element.dataset.weavrPrefix || "";
    const suffix = element.dataset.weavrSuffix || "";

    if (prefix || suffix) {
      // Emphasis is not offered on these: only the field's share is stored, and
      // a marker spanning the literal part would have nowhere to go.
      if (newValue === original) {
        restore(element);
        return;
      }
      const fits =
        newValue.startsWith(prefix) &&
        newValue.endsWith(suffix) &&
        newValue.length > prefix.length + suffix.length;
      if (!fits) {
        restore(element);
        return;
      }
      restore(element);
      return send(element, fieldId, newValue.slice(prefix.length, newValue.length - suffix.length));
    }

    /*
        Compare the marked form, not the plain text.

        Bold, italic and underline change only the markup — `textContent` is
        identical before and after. Comparing plain text therefore reported "no
        change" for every formatting edit and returned here without saving, so
        emphasis applied on screen and was gone on the next reload. It looked
        like the editor worked and quietly discarded the work.

        `weavrMarks` holds the stored form when the value has markers; when it
        has none the plain original is already the marked form.
    */
    const markedOriginal = element.dataset.weavrMarks ?? original;
    if (marked === markedOriginal) {
      restore(element);
      return;
    }

    restore(element);
    return send(element, fieldId, marked || newValue);
  }

  /**
   * Takes custody of what React rendered, before the editor changes any of it.
   *
   * Re-taken after a hand-back even though the entry is still there: by then
   * the element may have been re-rendered from the saved file, and the nodes
   * recorded here would be ones React has already discarded.
   */
  function takeFromReact(element) {
    const held = reactNodes.get(element);
    if (held && held.held) return;

    const nodes = Array.from(element.childNodes);
    const text = [];
    (function walk(list) {
      for (const node of list) {
        if (node.nodeType === Node.TEXT_NODE) text.push({ node, data: node.data });
        else walk(node.childNodes);
      }
    })(nodes);

    reactNodes.set(element, { nodes, text, held: true });
  }

  function revertText(record) {
    for (const { node, data } of record.text) {
      if (node.data !== data) node.data = data;
    }
  }

  /**
   * Hands an element back to React exactly as it rendered it, and with that
   * puts the field back to its last saved state — nodes, emphasis and text.
   *
   * It is deliberately all-or-nothing. An earlier version tried to leave the
   * new wording on screen while the write was in flight, by writing the value
   * into the first of React's text nodes and emptying the others. That looked
   * right on a field of plain text and wrecked anything with emphasis in it:
   * the formatting vanished and empty <strong> tags were left behind, which
   * the next edit serialised as `****` and wrote into the content file. A
   * field's markup only ever has one honest source, which is React.
   *
   * So the field shows the stored text until the write lands and the reload
   * brings the new one back. That is a visible pause, and it is worth it.
   */
  function releaseToReact(element) {
    const record = reactNodes.get(element);
    if (!record) return false;

    revertText(record);
    if (record.held) element.replaceChildren(...record.nodes);
    reactNodes.delete(element);
    return true;
  }

  /** Puts an element back to its last saved state, markers and all. */
  function restore(element) {
    releaseToReact(element);
  }

  /** Hands a new value to Weavr, and rolls back if it cannot be reached. */
  function send(element, fieldId, valueToStore) {
    element.setAttribute("data-weavr-saving", "1");
    if (!emit("weavr://text-edited", { fieldIds: [fieldId], newValue: valueToStore })) {
      // Never leave an unsaved change looking saved.
      element.removeAttribute("data-weavr-saving");
      element.setAttribute("data-weavr-error", "1");
      restore(element);
      console.error("[weavr] edit not saved: the editor bridge is unavailable");
    }
  }

  /**
   * Returns whether the message actually reached Weavr. Callers must check:
   * if the bridge to Rust is missing, an edit looks applied on screen but is
   * never written, and the user loses it on the next reload without warning.
   */
  function emit(name, payload) {
    const api = window.__TAURI__;
    if (!api?.event?.emit) return false;
    try {
      api.event.emit(name, payload);
      return true;
    } catch (err) {
      console.error("[weavr] could not reach the editor:", err);
      return false;
    }
  }

  const isBypass = (event) => event.ctrlKey || event.metaKey;
  let replayingClick = false;

  // Reflect the modifier in a body class so the outlines can show that a click
  // will use the site rather than edit it.
  function trackBypassKey(event) {
    if (!enabled) return;
    document.body.classList.toggle("weavr-bypass", isBypass(event));
  }
  const clearBypassKey = () => document.body.classList.remove("weavr-bypass");

  /**
   * Ctrl/Cmd-click means "use the site normally" — follow the link, open the
   * dropdown — so the user can reach the page they want to edit. A plain click
   * edits, which is the common case.
   *
   * The contenteditable attribute has to come off before the browser handles
   * the press, or it swallows the click into a caret placement instead.
   */
  function onMouseDownCapture(event) {
    if (!enabled || !isBypass(event)) return;
    const editable = event.target.closest?.(`[${EDITABLE_ATTR}]`);
    if (!editable) return;

    editable.removeAttribute("contenteditable");
    // Restore once the click has been dispatched.
    setTimeout(() => {
      if (editable.hasAttribute(EDITABLE_ATTR)) {
        editable.setAttribute("contenteditable", "true");
      }
    }, 0);
  }

  function onClickCapture(event) {
    if (!enabled) return;
    // Our own replayed click — let it reach the site's handlers.
    if (replayingClick) return;
    const anchor = event.target.closest?.("a");

    if (isBypass(event)) {
      // Buttons run their own handler untouched. Links need the modifier
      // stripped: a router treats Ctrl-click as "open a new tab" and steps
      // aside, and a new tab has nowhere to go inside the preview. Replaying
      // it as a plain click keeps navigation client-side, so the page doesn't
      // reload and the edit bridge stays live.
      if (anchor) {
        event.preventDefault();
        event.stopPropagation();
        replayingClick = true;
        anchor.dispatchEvent(
          new MouseEvent("click", { bubbles: true, cancelable: true, view: window }),
        );
        replayingClick = false;
        // Don't leave focus sitting on a link that the navigation is about to
        // remove from the page.
        anchor.blur?.();
      }
      return;
    }

    // Plain click on an editable link: stay put so the edit isn't lost.
    if (anchor && anchor.closest(`[${EDITABLE_ATTR}]`)) {
      event.preventDefault();
    }
  }

  let refreshQueued = false;
  function queueRefresh() {
    if (refreshQueued) return;
    // Deliberately no "skip while an editable is focused" check here. Focus
    // lingers on a link after it is clicked, so such a check silently stops
    // every later refresh and a page navigated to never becomes editable.
    // Rescanning during typing is harmless: already-adopted elements are
    // skipped, and the work is bounded by the longest known value.
    refreshQueued = true;
    // setTimeout rather than requestAnimationFrame: the preview window is
    // frequently occluded by the Weavr dashboard, and rAF does not fire in a
    // hidden page — the site would silently never become editable. This is
    // DOM bookkeeping, not animation, so it should not be tied to painting.
    setTimeout(() => {
      refreshQueued = false;
      markEditable();
    }, 0);
  }

  const observer = new MutationObserver(queueRefresh);

  window.__weavrEditBridge = {
    /**
     * Called by Weavr with this project's resolvable values —
     * [{ value, field_id }] — each already known to map to one field.
     */
    setValues(entries) {
      valueIndex = new Map();
      rawByValue = new Map();
      maxValueLength = 0;
      for (const entry of entries) {
        const key = normalize(entry.value);
        if (!key) continue;
        valueIndex.set(key, entry.fields);
        if (entry.raw) rawByValue.set(key, entry.raw);
        if (key.length > maxValueLength) maxValueLength = key.length;
      }
      queueRefresh();
    },

    setEnabled(next) {
      enabled = next;
      if (enabled) {
        installStyles();
        document.addEventListener("mousedown", onMouseDownCapture, true);
        document.addEventListener("click", onAmbiguousClick, true);
        document.addEventListener("mousedown", onDocumentPointerDown);
        window.addEventListener("scroll", closePopover, true);
        document.addEventListener("click", onClickCapture, true);
        document.addEventListener("keydown", trackBypassKey, true);
        document.addEventListener("keyup", trackBypassKey, true);
        window.addEventListener("blur", clearBypassKey);
        // Resizing can swap which copy of a responsive layout is displayed,
        // changing what counts as on-screen.
        window.addEventListener("resize", queueRefresh);
        observer.observe(document.body, { childList: true, subtree: true });
        queueRefresh();
      } else {
        document.removeEventListener("mousedown", onMouseDownCapture, true);
        document.removeEventListener("click", onAmbiguousClick, true);
        document.removeEventListener("mousedown", onDocumentPointerDown);
        window.removeEventListener("scroll", closePopover, true);
        closePopover();
        document.removeEventListener("click", onClickCapture, true);
        document.removeEventListener("keydown", trackBypassKey, true);
        document.removeEventListener("keyup", trackBypassKey, true);
        window.removeEventListener("blur", clearBypassKey);
        window.removeEventListener("resize", queueRefresh);
        closeToolbar();
        clearBypassKey();
        observer.disconnect();
        document.querySelectorAll(`[${EDITABLE_ATTR}]`).forEach((element) => {
          // Editing can be switched off with a field still focused, which would
          // otherwise leave React's nodes in the bridge's custody for good.
          restore(element);
          element.removeAttribute(EDITABLE_ATTR);
          element.removeAttribute("contenteditable");
          // Drop the saved-value baseline too, so re-enabling re-reads it
          // from whatever the site renders at that point.
          delete element.dataset.weavrOriginal;
          element.removeEventListener("keydown", onKeyDown);
          element.removeEventListener("blur", onBlur);
        });
        document
          .querySelectorAll(`[${AMBIGUOUS_ATTR}]`)
          .forEach((element) => element.removeAttribute(AMBIGUOUS_ATTR));
      }
    },

    /** Confirms a save landed, so elements stop showing as in-flight. */
    confirmSaved(fieldIds, savedValue) {
      closePopover();
      selectorFor(fieldIds)
        .forEach((element) => {
          element.removeAttribute("data-weavr-saving");
          // The write landed, so the text kept for rolling it back is no longer
          // wanted — and holding stale nodes past a re-render helps nobody.
          reactNodes.delete(element);
          element.dataset.weavrMarks = savedValue;
          // Re-attach the literal parts so the baseline matches what's shown.
          const prefix = element.dataset.weavrPrefix || "";
          const suffix = element.dataset.weavrSuffix || "";
          element.dataset.weavrOriginal = stripMarks(
            normalize(prefix + savedValue + suffix),
          );
        });
    },

    /**
     * Receives the stored field styles.
     *
     * Sent with the values on every load, because a dev-server reload drops
     * them the same way it drops everything else the bridge holds.
     */
    setStyles(map) {
      fieldStyles = map && typeof map === "object" ? map : {};
      for (const fieldId of Object.keys(fieldStyles)) previewStyle(fieldId);
      refreshToolbarState();
    },

    /** True once Weavr has sent this page its editable values. */
    hasValues() {
      return valueIndex.size > 0;
    },

    /**
     * Switches between rewriting the words and rearranging the page.
     *
     * Two jobs that want the same clicks. Trying to serve both at once makes
     * every click ambiguous — is a press on a heading an edit, or the start of
     * dragging its section? — so they are separate modes and only one is live.
     */
    setMode(next) {
      const wanted = next === "layout" ? "layout" : "text";
      if (wanted === mode) return;
      mode = wanted;
      if (mode === "layout") {
        // Editing text and rearranging sections must not overlap: a field left
        // focused would keep its caret and its toolbar over the layout chrome.
        document.activeElement?.blur?.();
        closePopover();
        closeToolbar();
        enterLayoutMode();
      } else {
        leaveLayoutMode();
      }
    },

    /** The kinds of section this site can render, from its own manifest. */
    setCatalogue(kinds) {
      catalogue = Array.isArray(kinds) ? kinds : [];
    },

    /** Re-measures the chrome after the page re-renders under it. */
    refreshLayout() {
      retrack();
    },

    /** Rolls elements back if Rust rejected the write. */
    rejectSave(fieldIds) {
      closePopover();
      selectorFor(fieldIds)
        .forEach((element) => {
          element.removeAttribute("data-weavr-saving");
          if (element.dataset.weavrOriginal !== undefined) {
            restore(element);
          }
        });
    },
  };

  /* =========================================================================
     Layout mode: rearranging a page rather than rewriting it.

     A template following the contract describes its pages as data — a list of
     sections per page — and marks each rendered section with the page and
     position it came from. That is all this needs: hovering a section shows
     what it is and what can be done to it, and the seams between sections are
     where a new one goes.

     Every pixel of this is drawn in a fixed layer over the page. Nothing is
     inserted into the site's own markup, and nothing in the site is mutated;
     the only writes are events sent to Weavr, which edits the data file and
     lets the page re-render itself.
     ========================================================================= */

  const SECTION_ATTR = "data-weavr-section";
  const SECTION_TOOLS = [
    { op: "up", label: "↑", title: "Move up" },
    { op: "down", label: "↓", title: "Move down" },
    { op: "duplicate", label: "⧉", title: "Duplicate" },
    { op: "remove", label: "✕", title: "Remove", danger: true },
  ];

  /*
      How a section can be presented.

      Each list has to match what the site can actually render — these become
      class names it was built with, and one outside the set would be written
      to the file and then do nothing at all. Rust holds the same lists and
      refuses anything else, and a test compares the two so they cannot drift.

      The first entry of each is the unset state, so a section with no
      appearance set reads as "default" rather than as having no answer.
  */
  const APPEARANCE = [
    {
      key: "background",
      title: "Background",
      options: [
        { value: "default", label: "Default" },
        { value: "light", label: "Light" },
        { value: "dark", label: "Dark" },
        { value: "accent", label: "Accent" },
      ],
    },
    {
      key: "spacing",
      title: "Spacing",
      options: [
        { value: "normal", label: "Normal" },
        { value: "tight", label: "Tight" },
        { value: "loose", label: "Loose" },
      ],
    },
    {
      key: "align",
      title: "Alignment",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Centre" },
      ],
    },
  ];

  let mode = "text";
  let layer = null;
  let outline = null;
  let tag = null;
  let sectionBar = null;
  let hovered = null;
  let trackQueued = false;

  /**
   * The rectangle a section occupies.
   *
   * The element carrying the attributes is `display: contents`, so it has no
   * box of its own and reports an empty rectangle. Its children are what is
   * actually on screen, so their union is the section.
   */
  function sectionRect(element) {
    let box = null;
    for (const child of element.children) {
      const rect = child.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      box = box
        ? {
            top: Math.min(box.top, rect.top),
            left: Math.min(box.left, rect.left),
            right: Math.max(box.right, rect.right),
            bottom: Math.max(box.bottom, rect.bottom),
          }
        : { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    }
    if (!box) return null;
    return { ...box, width: box.right - box.left, height: box.bottom - box.top };
  }

  /** Every section on the page, in the order the data file lists them. */
  function sections() {
    return Array.from(document.querySelectorAll(`[${SECTION_ATTR}]`)).sort(
      (a, b) => Number(a.dataset.weavrSection) - Number(b.dataset.weavrSection),
    );
  }

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    layer = document.createElement("div");
    layer.className = "weavr-layer";
    document.body.appendChild(layer);
    return layer;
  }

  function label(element) {
    // The section id as written in the data, spaced out for reading:
    // "callForPapersSection" -> "Call For Papers".
    const id = element.dataset.weavrSectionId || "Section";
    return id
      .replace(/Section$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  function buildSectionBar() {
    const bar = document.createElement("div");
    bar.className = "weavr-section-bar";

    // Appearance first, because it is what someone reaches for most often
    // once a page is in the right order.
    for (const group of APPEARANCE) {
      const select = document.createElement("select");
      select.className = "weavr-tool-select";
      select.title = group.title;
      select.dataset.weavrAppearance = group.key;
      for (const option of group.options) {
        const node = document.createElement("option");
        node.value = option.value;
        node.textContent = option.label;
        select.appendChild(node);
      }
      bar.appendChild(select);
    }
    const separator = document.createElement("div");
    separator.className = "weavr-tool-sep";
    bar.appendChild(separator);

    for (const tool of SECTION_TOOLS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `weavr-tool${tool.danger ? " weavr-tool-danger" : ""}`;
      button.textContent = tool.label;
      button.title = tool.title;
      button.dataset.weavrOp = tool.op;
      bar.appendChild(button);
    }

    bar.addEventListener("change", (event) => {
      const select = event.target.closest?.("[data-weavr-appearance]");
      if (!select || !hovered) return;
      setSectionAppearance(hovered);
    });
    // Pointer-down rather than click, and swallowed, so the press never
    // reaches the site underneath and never moves focus off the section.
    bar.addEventListener("mousedown", (event) => event.preventDefault());
    bar.addEventListener("click", (event) => {
      const button = event.target.closest?.("[data-weavr-op]");
      if (!button || !hovered) return;
      event.preventDefault();
      event.stopPropagation();
      runSectionOp(hovered, button.dataset.weavrOp);
    });
    return bar;
  }

  /**
   * Sends the whole appearance, not just what changed.
   *
   * The three settings are stored as one object on the section, so a message
   * carrying only the changed one would be read as "the others are now unset"
   * and quietly clear them.
   */
  function setSectionAppearance(element) {
    const pageId = element.dataset.weavrPage;
    const index = Number(element.dataset.weavrSection);
    if (!pageId || Number.isNaN(index) || !sectionBar) return;

    const appearance = { pageId, index };
    for (const group of APPEARANCE) {
      const select = sectionBar.querySelector(`[data-weavr-appearance="${group.key}"]`);
      const value = select?.value;
      // The first option is the unset state, and is sent as absent so an
      // untouched section keeps no appearance at all.
      appearance[group.key] = value && value !== group.options[0].value ? value : null;
    }

    if (!emit("weavr://section-appearance", appearance)) {
      console.error("[weavr] the editor bridge is unavailable");
    }
  }

  function runSectionOp(element, op) {
    const pageId = element.dataset.weavrPage;
    const index = Number(element.dataset.weavrSection);
    if (!pageId || Number.isNaN(index)) return;

    // Asked for rather than done here. The section on screen is rendered from
    // the data file, so Weavr changes the file and the page follows; moving
    // the nodes about would only disagree with what is stored.
    if (!emit("weavr://section-op", { pageId, index, op })) {
      console.error("[weavr] the editor bridge is unavailable");
      return;
    }
    hideSectionChrome();
  }

  function showSectionChrome(element) {
    const box = sectionRect(element);
    if (!box) return;

    const host = ensureLayer();
    if (!outline || !outline.isConnected) {
      outline = document.createElement("div");
      outline.className = "weavr-outline";
      host.appendChild(outline);
    }
    if (!tag || !tag.isConnected) {
      tag = document.createElement("div");
      tag.className = "weavr-tag";
      host.appendChild(tag);
    }
    if (!sectionBar || !sectionBar.isConnected) {
      sectionBar = buildSectionBar();
      host.appendChild(sectionBar);
    }

    hovered = element;
    outline.style.cssText = `position:fixed;top:${box.top}px;left:${box.left}px;width:${box.width}px;height:${box.height}px`;
    tag.textContent = label(element);
    tag.style.cssText = `position:fixed;top:${Math.max(0, box.top - 21)}px;left:${box.left}px`;

    const all = sections();
    const position = all.indexOf(element);
    for (const button of sectionBar.querySelectorAll("[data-weavr-op]")) {
      const op = button.dataset.weavrOp;
      button.disabled =
        (op === "up" && position <= 0) || (op === "down" && position >= all.length - 1);
    }

    // The site renders its own appearance, so what it is showing is the truth
    // about what is stored — read it back off the element rather than keeping
    // a copy here that a reload would make stale.
    for (const group of APPEARANCE) {
      const select = sectionBar.querySelector(`[data-weavr-appearance="${group.key}"]`);
      if (select) {
        select.value =
          element.dataset[`weavrAppearance${group.key[0].toUpperCase()}${group.key.slice(1)}`] ||
          group.options[0].value;
      }
    }

    const barWidth = sectionBar.offsetWidth || 130;
    sectionBar.style.cssText = `position:fixed;top:${Math.max(4, box.top + 6)}px;left:${Math.max(4, box.right - barWidth - 6)}px`;
  }

  function hideSectionChrome() {
    hovered = null;
    for (const node of [outline, tag, sectionBar]) {
      if (node && node.isConnected) node.remove();
    }
    outline = tag = sectionBar = null;
  }

  /** The gaps between sections, each offering to put a new one there. */
  function drawSeams() {
    const host = ensureLayer();
    const all = sections();
    const wanted = all.length ? all.length + 1 : 0;

    let seams = Array.from(host.querySelectorAll(".weavr-seam"));
    while (seams.length > wanted) seams.pop().remove();
    while (seams.length < wanted) {
      const seam = document.createElement("div");
      seam.className = "weavr-seam";
      const add = document.createElement("button");
      add.type = "button";
      add.className = "weavr-seam-add";
      add.textContent = "+";
      add.title = "Add a section here";
      seam.appendChild(add);
      seam.addEventListener("mousedown", (event) => event.preventDefault());
      seam.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openCatalogue(Number(seam.dataset.weavrAt), seam);
      });
      host.appendChild(seam);
      seams.push(seam);
    }

    const pageId = all[0]?.dataset.weavrPage;
    seams.forEach((seam, at) => {
      // A seam sits above the section it would push down; the last one sits
      // under the final section, which is how a page gets a new bottom.
      const anchor = at < all.length ? sectionRect(all[at]) : sectionRect(all[all.length - 1]);
      if (!anchor) {
        seam.style.display = "none";
        return;
      }
      const y = at < all.length ? anchor.top : anchor.bottom;
      seam.style.display = "";
      seam.dataset.weavrAt = String(at);
      seam.dataset.weavrPage = pageId || "";
      seam.style.cssText += `;position:fixed;top:${y - 11}px;left:${anchor.left}px;width:${anchor.width}px`;
    });
  }

  function retrack() {
    if (mode !== "layout" || trackQueued) return;
    trackQueued = true;
    // setTimeout, not requestAnimationFrame, for the same reason the editable
    // scan uses it: the preview is frequently occluded by the Weavr panel or
    // by another window, and rAF does not fire in a hidden page. The chrome
    // would simply never appear, with nothing to show for it.
    setTimeout(() => {
      trackQueued = false;
      if (mode !== "layout") return;
      if (hovered && hovered.isConnected) showSectionChrome(hovered);
      else if (hovered) hideSectionChrome();
      drawSeams();
    }, 0);
  }

  function onLayoutPointerMove(event) {
    if (mode !== "layout") return;
    if (event.target.closest?.(".weavr-layer")) return;
    const section = event.target.closest?.(`[${SECTION_ATTR}]`);
    if (!section) {
      if (hovered) hideSectionChrome();
      return;
    }
    if (section !== hovered) showSectionChrome(section);
  }

  /** Swallows clicks on the page so layout mode never navigates away. */
  function onLayoutClick(event) {
    if (mode !== "layout") return;
    if (event.target.closest?.(".weavr-layer")) return;
    if (!event.target.closest?.(`[${SECTION_ATTR}]`)) return;
    event.preventDefault();
    event.stopPropagation();
  }

  /* ---- The catalogue ------------------------------------------------------
     What can be added, offered where it would go. The list comes from Weavr,
     which reads the site's own manifest of section kinds — the bridge never
     guesses at what a site can render. */

  let catalogue = [];
  let picker = null;

  /*
      Previews of what can be added.

      Nothing is drawn or mocked up. Weavr says which page already shows each
      kind of section, and the real one is taken from that page: what the
      catalogue shows is what would actually be added, and cannot drift from it
      as the site changes.

      The page is loaded in a hidden frame and the matching section copied out
      of it. Both documents are the same site, so the copy lands among the
      stylesheets that styled it and needs nothing else to look right. One
      frame is reused for all of them and the pages are fetched one at a time,
      because a catalogue of forty sections would otherwise open forty pages at
      once.
  */
  const SAMPLE_WIDTH = 1280;
  /** Sections already copied out, by kind. These outlive the frame. */
  const previewCache = new Map();
  /** Pages currently loaded, by path. These do not: a document dies with it. */
  let sampleDocs = new Map();
  let sampleFrame = null;
  let sampleQueue = Promise.resolve();

  function loadSample(path) {
    if (sampleDocs.has(path)) return Promise.resolve(sampleDocs.get(path));

    sampleQueue = sampleQueue.then(
      () =>
        new Promise((resolve) => {
          if (sampleDocs.has(path)) return resolve(sampleDocs.get(path));

          if (!sampleFrame || !sampleFrame.isConnected) {
            sampleFrame = document.createElement("iframe");
            // Off-screen rather than hidden: a frame with `display: none` has
            // no layout, and a section with no size cannot be scaled to fit.
            sampleFrame.setAttribute("aria-hidden", "true");
            sampleFrame.style.cssText = `position:fixed;left:-20000px;top:0;width:${SAMPLE_WIDTH}px;height:2400px;border:0;visibility:hidden;pointer-events:none`;
            document.body.appendChild(sampleFrame);
          }

          let settled = false;
          const done = (doc) => {
            if (settled) return;
            settled = true;
            sampleDocs.set(path, doc);
            resolve(doc);
          };

          sampleFrame.onload = () => {
            // The site renders after load, so give it a moment to put the
            // sections on the page before looking for one.
            setTimeout(() => {
              try {
                done(sampleFrame.contentDocument);
              } catch {
                // A cross-origin frame cannot be read from. Nothing to preview,
                // and nothing broken — the names still work.
                done(null);
              }
            }, 350);
          };
          // Never leave the queue stuck behind a page that will not load.
          setTimeout(() => done(null), 6000);
          sampleFrame.src = path;
        }),
    );
    return sampleQueue;
  }

  /** Copies the real section out of a loaded page, scaled to fit a card. */
  async function fillPreview(box, kind) {
    if (!kind.sample_path) return;

    let copy = previewCache.get(kind.id);
    if (!copy) {
      const doc = await loadSample(kind.sample_path);
      if (!doc) return;

      const found = doc.querySelector(`[data-weavr-section-id="${CSS.escape(kind.id)}"]`);
      // The wrapper carrying the attribute is `display: contents`, so the
      // child is the thing with a box.
      const source = found?.children?.[0] || found;
      if (!source) return;

      copy = document.importNode(source, true);
      // Ids are unique to a document and this one already holds the original's.
      // Duplicates would break in-page anchors and any styling that selects on
      // them — including the site's own.
      copy.removeAttribute?.("id");
      for (const node of copy.querySelectorAll?.("[id]") || []) node.removeAttribute("id");
      previewCache.set(kind.id, copy);
    }

    if (!box.isConnected) return;

    const stage = document.createElement("div");
    stage.className = "weavr-preview-stage";
    stage.style.width = `${SAMPLE_WIDTH}px`;
    stage.style.transform = `scale(${box.clientWidth / SAMPLE_WIDTH})`;
    // Cloned again on the way in, so the cached copy is never handed to a card
    // that is about to be thrown away with the rest of the list.
    stage.appendChild(copy.cloneNode(true));

    box.replaceChildren(stage);
    box.dataset.weavrLoaded = "1";
  }

  function closeCatalogue() {
    if (picker && picker.isConnected) picker.remove();
    picker = null;
    document.removeEventListener("mousedown", onCataloguePointerDown, true);
    // The frame goes, and the documents with it — they belong to it and stop
    // working the moment it is gone. The sections already copied out are kept,
    // which is what makes reopening the catalogue instant.
    if (sampleFrame && sampleFrame.isConnected) sampleFrame.remove();
    sampleFrame = null;
    sampleDocs = new Map();
  }

  function onCataloguePointerDown(event) {
    if (!picker) return;
    if (event.target.closest?.(".weavr-popover")) return;
    if (event.target.closest?.(".weavr-seam")) return;
    closeCatalogue();
  }

  function openCatalogue(at, seam) {
    closeCatalogue();
    const pageId = seam.dataset.weavrPage;
    if (!pageId) return;

    picker = document.createElement("div");
    picker.className = "weavr-popover weavr-popover-wide";
    picker.innerHTML = `
      <p class="weavr-popover-title">Add a section here</p>
      <input class="weavr-popover-input" type="search" placeholder="Search sections" />
      <div class="weavr-catalogue"></div>
      <p class="weavr-popover-hint">${
        catalogue.length
          ? "Pick one to add it at this point in the page."
          : "Weavr has not sent this site's section list yet."
      }</p>
    `;

    const list = picker.querySelector(".weavr-catalogue");
    const search = picker.querySelector(".weavr-popover-input");

    /*
        Only what is on screen is loaded. A catalogue of forty sections is
        forty page loads if they are all fetched at once, and most are scrolled
        past without being looked at.

        Worked out from the list's own scroll position rather than with an
        IntersectionObserver. Observers deliver on the rendering lifecycle, and
        this page spends much of its life occluded by the Weavr panel — where
        that lifecycle stops and the callbacks simply never arrive. The same
        trap as requestAnimationFrame, which the editable scan avoids for the
        same reason. Arithmetic keeps working when nothing is being painted.
    */
    const MARGIN = 140;
    const loadVisible = () => {
      const from = list.scrollTop - MARGIN;
      const to = list.scrollTop + list.clientHeight + MARGIN;

      for (const box of list.querySelectorAll(
        ".weavr-preview:not([data-weavr-loaded]):not([data-weavr-empty]):not([data-weavr-pending])",
      )) {
        const top = box.offsetTop;
        if (top + box.offsetHeight < from || top > to) continue;
        box.dataset.weavrPending = "1";
        fillPreview(box, JSON.parse(box.dataset.weavrKindJson));
      }
    };
    list.addEventListener("scroll", loadVisible);

    const render = (term) => {
      const needle = term.trim().toLowerCase();
      const shown = catalogue.filter(
        (kind) => !needle || readable(kind.id).toLowerCase().includes(needle),
      );

      list.replaceChildren(
        ...shown.map((kind) => {
          const card = document.createElement("button");
          card.type = "button";
          card.className = "weavr-catalogue-item";
          card.dataset.weavrKind = kind.id;

          const box = document.createElement("div");
          box.className = "weavr-preview";
          box.dataset.weavrKindJson = JSON.stringify(kind);
          if (!kind.sample_path) {
            // Nowhere on the site shows one yet, so there is nothing to show.
            // Said plainly rather than left as an empty frame that reads as
            // still loading.
            box.dataset.weavrEmpty = "1";
            box.textContent = "Not used yet";
          }

          const name = document.createElement("span");
          name.className = "weavr-catalogue-name";
          name.textContent = readable(kind.id);

          card.append(box, name);
          return card;
        }),
      );

      loadVisible();
    };

    list.addEventListener("click", (event) => {
      const choice = event.target.closest?.("[data-weavr-kind]");
      if (!choice) return;
      if (!emit("weavr://section-add", { pageId, index: at, sectionId: choice.dataset.weavrKind })) {
        console.error("[weavr] the editor bridge is unavailable");
      }
      closeCatalogue();
      hideSectionChrome();
    });
    search.addEventListener("input", () => render(search.value));
    picker.addEventListener("mousedown", (event) => {
      // Keep the press off the site underneath, but let the search field take
      // focus for typing.
      if (event.target !== search) event.preventDefault();
    });

    // Into the document before the cards are made, not after. The previews
    // load when a card scrolls into view, and nothing is ever in view inside
    // a list that is not yet on the page — so every preview would sit waiting
    // for a moment that had already passed.
    document.body.appendChild(picker);
    render("");

    const box = seam.getBoundingClientRect();
    // Measured rather than assumed: it is in the document by now, and a width
    // written here in two places is one that eventually disagrees with the CSS.
    const width = picker.offsetWidth || 340;
    const height = picker.offsetHeight || 220;
    const viewportW = document.documentElement.clientWidth;
    const viewportH = document.documentElement.clientHeight;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), viewportW - width - 8);
    const below = box.bottom + 8;
    const preferred = below + height > viewportH ? box.top - height - 8 : below;

    // Clamped into the viewport, not merely flipped above the seam. A seam far
    // down a long page sits below the fold, and both the space under it and
    // the space over it are off-screen — the popover would open somewhere
    // nobody can see it, and the previews inside it would never load, because
    // nothing is ever in view inside a box that is not.
    picker.style.left = `${left}px`;
    picker.style.top = `${Math.min(Math.max(8, preferred), Math.max(8, viewportH - height - 8))}px`;

    document.addEventListener("mousedown", onCataloguePointerDown, true);
    search.focus();
  }

  /** "callForPapersSection" -> "Call For Papers" */
  function readable(id) {
    return id
      .replace(/Section$/, "")
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/^./, (c) => c.toUpperCase())
      .trim();
  }

  function enterLayoutMode() {
    document.body.classList.add("weavr-layout");
    document.addEventListener("mousemove", onLayoutPointerMove, true);
    document.addEventListener("click", onLayoutClick, true);
    window.addEventListener("scroll", retrack, true);
    window.addEventListener("resize", retrack);
    retrack();
  }

  function leaveLayoutMode() {
    document.body.classList.remove("weavr-layout");
    document.removeEventListener("mousemove", onLayoutPointerMove, true);
    document.removeEventListener("click", onLayoutClick, true);
    window.removeEventListener("scroll", retrack, true);
    window.removeEventListener("resize", retrack);
    closeCatalogue();
    hideSectionChrome();
    if (layer && layer.isConnected) layer.remove();
    layer = null;
  }

  // Announce ourselves so Weavr sends the current values. This is what makes
  // the page editable on first load and again after every reload — a dev-server
  // reload wipes the values we were given, and the page can come up before
  // Weavr has finished reading the project, so we ask rather than wait to be
  // told. Retried briefly because the Tauri bridge may not be attached yet.
  (function announce() {
    let attempts = 0;
    const tell = () => {
      if (window.__TAURI__?.event?.emit) {
        emit("weavr://bridge-ready", {});
        return;
      }
      if (attempts++ < 100) setTimeout(tell, 50);
    };
    tell();
  })();
})();
