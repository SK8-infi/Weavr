// The edit bridge, run against a real React tree.
//
// These exist because of a crash the Rust tests could not see: the bridge
// edits the DOM React rendered, and React keeps direct references to the nodes
// it created. Replacing them and then letting React reconcile threw
// `NotFoundError: Failed to execute 'removeChild'`, and an uncaught error
// during commit unmounts the whole tree — the preview went blank.
//
// Reproducing that needs React actually reconciling, so these tests render with
// react-dom into jsdom rather than asserting on markup.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";

const BRIDGE = new URL("../src-tauri/resources/weavr-edit-bridge.js", import.meta.url);
const source = readFileSync(BRIDGE, "utf8");

/**
 * A page with the bridge installed, React rendering into it, and the emitted
 * events captured.
 *
 * React is imported after the globals are in place: react-dom reads `document`
 * and `window` as it initialises.
 */
async function setup() {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div></body></html>`, {
    url: "http://localhost/",
    pretendToBeVisual: true,
    // The bridge is evaluated inside the page, the way Weavr injects it.
    runScripts: "outside-only",
  });
  const { window } = dom;

  // jsdom performs no layout, so every element reports no client rects and the
  // bridge would treat the entire page as off-screen and adopt nothing.
  window.Element.prototype.getClientRects = function () {
    return [{ width: 10, height: 10 }];
  };

  // jsdom does not implement CSS.escape; every browser engine Tauri uses does.
  window.CSS = window.CSS || { escape: (s) => s.replace(/["\\]/g, "\\$&") };

  const emitted = [];
  window.__TAURI__ = { event: { emit: (name, payload) => emitted.push({ name, payload }) } };

  // `navigator` is deliberately not among these: Node has its own, read-only.
  for (const key of ["window", "document", "Node", "NodeFilter", "Element", "HTMLElement", "MutationObserver", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "MouseEvent", "Event"]) {
    globalThis[key] = window[key];
  }
  // Rendering goes through flushSync, not act.
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;

  window.eval(source);

  const React = (await import("react")).default;
  const { createRoot } = await import("react-dom/client");
  const { flushSync } = await import("react-dom");

  const container = window.document.getElementById("root");
  const root = createRoot(container);

  return { window, React, root, flushSync, emitted };
}

/** Marked-up text, the way a template's renderRichText builds it. */
function rich(React, text) {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**")
      ? React.createElement("strong", { key: i }, part.slice(2, -2))
      : part,
  );
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 5));

/** Renders one editable paragraph and lets the bridge adopt it. */
async function editableParagraph(env, { text = "Hello **bold** world", field = "data.one" } = {}) {
  const { window, React, root, flushSync } = env;
  const plain = text.replace(/\*\*/g, "");

  // The paragraph has a sibling so that the container's own text is not also
  // the field's value: the bridge adopts the outermost element whose whole text
  // matches, which on a bare root would be the container rather than the
  // paragraph.
  const render = (value) =>
    flushSync(() =>
      root.render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement("p", { id: "field" }, rich(React, value)),
          React.createElement("footer", null, "unrelated text"),
        ),
      ),
    );

  render(text);
  window.__weavrEditBridge.setValues([
    { value: plain, raw: text, fields: [{ field_id: field, source: "data/one.js" }] },
  ]);
  window.__weavrEditBridge.setEnabled(true);
  await settle();

  const element = window.document.getElementById("field");
  assert.equal(
    element.getAttribute("data-weavr-field"),
    field,
    "the bridge did not adopt the paragraph, so the rest of this test proves nothing",
  );
  return { element, render };
}

/** Focus, edit, blur — the way the browser drives it. */
function focus(window, element) {
  element.dispatchEvent(new window.FocusEvent("focus"));
}
function blur(window, element) {
  element.dispatchEvent(new window.FocusEvent("blur"));
}

test("React can re-render a field that was focused and left alone", async () => {
  const env = await setup();
  const { element, render } = await editableParagraph(env);

  focus(env.window, element);
  blur(env.window, element);

  // The crash needs React to reconcile against the nodes it is holding.
  render("Hello **bold** world again");
  assert.match(env.window.document.getElementById("field").textContent, /again/);
});

test("removing emphasis does not take the page down", async () => {
  // The reported bug, in full: bold text is unbolded in the editor, the write
  // lands, and the reload re-renders the field without the <strong>. That last
  // step is where it broke — React removes the emphasis it rendered, finds the
  // node is no longer a child, and throws out of commit.
  //
  // execCommand is not implemented in jsdom, so the unbolding is done the way
  // it leaves the DOM: the <strong> replaced by a bare text node.
  const env = await setup();
  const { element, render } = await editableParagraph(env);

  focus(env.window, element);
  element.innerHTML = "Hello bold world";
  blur(env.window, element);

  render("Hello bold world");
  const after = env.window.document.getElementById("field");
  assert.ok(after, "the field is gone: React unmounted the tree, which is the blank page");
  assert.equal(after.textContent, "Hello bold world");
  assert.equal(
    env.window.document.querySelectorAll("strong").length,
    0,
    "the emphasis is still on screen after being removed",
  );
});

test("unbolding is saved, not silently dropped", async () => {
  const env = await setup();
  const { element } = await editableParagraph(env);

  focus(env.window, element);
  element.innerHTML = "Hello bold world";
  blur(env.window, element);

  const edit = env.emitted.find((e) => e.name === "weavr://text-edited");
  assert.ok(edit, "no edit was emitted");
  // Compared field by field: the payload was built in the page's realm, so it
  // is not deepStrictEqual to an object literal from this one.
  assert.deepEqual([...edit.payload.fieldIds], ["data.one"]);
  assert.equal(edit.payload.newValue, "Hello bold world");
});

test("an edit is still on screen while it is being written", async () => {
  // Handing React's nodes back must not undo the edit: the write and the
  // reload it triggers take a moment, and the field flicking back to the old
  // wording in between reads as a failed edit.
  const env = await setup();
  const { element } = await editableParagraph(env, { text: "Hello world" });

  focus(env.window, element);
  element.textContent = "Goodbye world";
  blur(env.window, element);

  assert.equal(env.window.document.getElementById("field").textContent, "Goodbye world");
});

test("a refused write is rolled back on screen", async () => {
  // Never leave text showing that was not written. This runs after the nodes
  // have been handed back, which is the case the rollback has to survive.
  const env = await setup();
  const { element, render } = await editableParagraph(env, { text: "Hello world" });

  focus(env.window, element);
  element.textContent = "Goodbye world";
  blur(env.window, element);
  env.window.__weavrEditBridge.rejectSave(["data.one"]);

  assert.equal(env.window.document.getElementById("field").textContent, "Hello world");
  render("Hello world!");
  assert.equal(env.window.document.getElementById("field").textContent, "Hello world!");
});

test("escape abandons an edit and leaves React able to render", async () => {
  const env = await setup();
  const { element, render } = await editableParagraph(env);

  focus(env.window, element);
  element.innerHTML = "Hello <em>bold</em> world";
  element.dispatchEvent(
    new env.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
  blur(env.window, element);

  assert.equal(element.textContent, "Hello bold world");
  assert.equal(
    env.emitted.filter((e) => e.name === "weavr://text-edited").length,
    0,
    "an abandoned edit was saved",
  );
  render("Hello **bold** world, edited");
  assert.match(env.window.document.getElementById("field").textContent, /edited/);
});

test("turning editing off returns every field to React", async () => {
  const env = await setup();
  const { element, render } = await editableParagraph(env);

  focus(env.window, element);
  element.innerHTML = "Hello bold world";
  env.window.__weavrEditBridge.setEnabled(false);

  render("Hello **bold** world, later");
  assert.match(env.window.document.getElementById("field").textContent, /later/);
});
