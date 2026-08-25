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
  /** Bounds how far up the tree a match is worth looking for. */
  let maxValueLength = 0;
  let enabled = false;

  const normalize = (text) => text.replace(/\s+/g, " ").trim();

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
      .weavr-popover-hint {
        margin: 8px 0 0;
        font-size: 10px;
        line-height: 1.5;
        color: #9d938a;
      }
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
        element.dataset.weavrOriginal = normalize(element.textContent || "");
      }
      element.addEventListener("keydown", onKeyDown);
      element.addEventListener("blur", onBlur);
    }
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
      element.textContent = element.dataset.weavrOriginal ?? element.textContent;
      element.blur();
    }
  }

  function onBlur(event) {
    const element = event.currentTarget;
    const fieldId = element.getAttribute(EDITABLE_ATTR);
    const newValue = normalize(element.textContent || "");
    const original = element.dataset.weavrOriginal;

    if (original === undefined || newValue === original) return;
    if (!newValue) {
      // Refuse to blank a field by accident; restore and let the user use the
      // side panel if they really mean to clear it.
      element.textContent = original;
      return;
    }

    // For text built from a literal plus a field, save only the field's share.
    // If the user changed the literal part, there's nothing sensible to write,
    // so put it back rather than guess.
    const prefix = element.dataset.weavrPrefix || "";
    const suffix = element.dataset.weavrSuffix || "";
    let fieldValue = newValue;
    if (prefix || suffix) {
      const fits =
        newValue.startsWith(prefix) &&
        newValue.endsWith(suffix) &&
        newValue.length > prefix.length + suffix.length;
      if (!fits) {
        element.textContent = original;
        return;
      }
      fieldValue = newValue.slice(prefix.length, newValue.length - suffix.length);
    }

    element.setAttribute("data-weavr-saving", "1");
    if (!emit("weavr://text-edited", { fieldIds: [fieldId], newValue: fieldValue })) {
      // Never leave an unsaved change looking saved.
      element.removeAttribute("data-weavr-saving");
      element.setAttribute("data-weavr-error", "1");
      element.textContent = original;
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
      maxValueLength = 0;
      for (const entry of entries) {
        const key = normalize(entry.value);
        if (!key) continue;
        valueIndex.set(key, entry.fields);
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
        clearBypassKey();
        observer.disconnect();
        document.querySelectorAll(`[${EDITABLE_ATTR}]`).forEach((element) => {
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
          // Re-attach the literal parts so the baseline matches what's shown.
          const prefix = element.dataset.weavrPrefix || "";
          const suffix = element.dataset.weavrSuffix || "";
          element.dataset.weavrOriginal = normalize(prefix + savedValue + suffix);
        });
    },

    /** True once Weavr has sent this page its editable values. */
    hasValues() {
      return valueIndex.size > 0;
    },

    /** Rolls elements back if Rust rejected the write. */
    rejectSave(fieldIds) {
      closePopover();
      selectorFor(fieldIds)
        .forEach((element) => {
          element.removeAttribute("data-weavr-saving");
          if (element.dataset.weavrOriginal !== undefined) {
            element.textContent = element.dataset.weavrOriginal;
          }
        });
    },
  };

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
