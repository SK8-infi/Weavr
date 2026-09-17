import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Icon from "../components/ui/Icon";
import { cn } from "../utils/cn";

/**
 * "Keynote & Invited Talks" -> "keynote-invited-talks"
 *
 * Kept in step with the Rust that actually derives the address. It is shown
 * here only so the address is visible before the page is made, never used to
 * decide it.
 */
function slug(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** "callForPapersSection" -> "Call For Papers" */
function readable(id) {
  return id
    .replace(/Section$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

/**
 * The shape of the site, beside the site itself.
 *
 * The work happens on the preview — hovering a section is how you reach it —
 * so this is not a second set of controls competing with those. It answers the
 * questions the preview cannot: what else is on this site, how long each page
 * is, and whether a section you are looking for exists at all.
 */
export default function LayoutPanel() {
  const [pages, setPages] = useState(null);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [addToMenu, setAddToMenu] = useState(true);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    invoke("page_list")
      .then((list) => {
        setPages(list);
        setError("");
      })
      .catch((err) => setError(String(err)));
  }, []);

  async function createPage(event) {
    event.preventDefault();
    if (busy || !title.trim()) return;
    setBusy(true);
    setError("");
    try {
      // No sections to start with. Which ones belong on a page is a question
      // best answered while looking at it, and the Layout tab is already open
      // for exactly that.
      const page = await invoke("page_create", {
        title: title.trim(),
        sectionIds: [],
        addToMenu,
      });
      setTitle("");
      setCreating(false);
      setOpenId(page.id);
      reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function removePage(page) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await invoke("page_remove", { pageId: page.id });
      reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    reload();
    // A section added or removed on the preview changes this outline too.
    const changed = listen("weavr://content-changed", reload);
    const failed = listen("weavr://edit-failed", (event) => setError(String(event.payload)));
    return () => {
      changed.then((un) => un());
      failed.then((un) => un());
    };
  }, [reload]);

  if (!pages) {
    return (
      <div className="flex flex-col gap-1.5 p-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-shimmer rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {error && (
        <p className="shrink-0 border-b border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] leading-relaxed text-red-300">
          {error}
        </p>
      )}

      <div className="shrink-0 border-b border-canvas-800 px-3 py-2">
        {creating ? (
          <form onSubmit={createPage} className="flex flex-col gap-2">
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Page name, e.g. Workshops"
              className="w-full rounded-lg bg-canvas-800 px-2.5 py-1.5 text-[13px] text-canvas-100 outline-none placeholder:text-canvas-600 focus:ring-1 focus:ring-brand-500"
            />
            {/* The address is not asked for: it follows the name, which is the
                only thing anyone has an opinion about. */}
            <p className="px-0.5 font-mono text-[10px] text-canvas-600">
              /{slug(title) || "…"}
            </p>
            <label className="flex items-center gap-2 px-0.5 text-[11px] text-canvas-400">
              <input
                type="checkbox"
                checked={addToMenu}
                onChange={(e) => setAddToMenu(e.target.checked)}
                className="accent-brand-500"
              />
              Add it to the menu
            </label>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy || !title.trim()}
                className="flex-1 rounded-lg bg-brand-500 px-2 py-1.5 text-[12px] font-medium text-canvas-950 disabled:opacity-40"
              >
                Create page
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setTitle("");
                }}
                className="rounded-lg bg-canvas-800 px-3 py-1.5 text-[12px] text-canvas-300"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-canvas-700 px-2 py-2 text-[12px] text-canvas-400 transition-colors hover:border-brand-500/60 hover:text-canvas-200"
          >
            <Icon name="plus" className="size-3.5" />
            New page
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {pages.length === 0 ? (
          <p className="px-1 py-6 text-center text-[11px] leading-relaxed text-canvas-600">
            This site does not list its pages in a way Weavr can read, so
            sections cannot be rearranged here.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {pages.map((page) => {
              const open = openId === page.id;
              return (
                <li key={page.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : page.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      open ? "bg-canvas-800" : "hover:bg-canvas-800/60",
                    )}
                  >
                    <Icon
                      name="chevronRight"
                      className={cn(
                        "size-3.5 shrink-0 text-canvas-500 transition-transform",
                        open && "rotate-90",
                      )}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-canvas-100">
                      {page.title || page.id}
                    </span>
                    <span className="shrink-0 font-mono text-[10px] text-canvas-600">
                      {page.path}
                    </span>
                    <span className="shrink-0 rounded-full bg-canvas-700 px-1.5 text-[10px] leading-4 text-canvas-400">
                      {page.sections.length}
                    </span>
                  </button>

                  {open && (
                    <ol className="mb-1 ml-5 mt-0.5 flex flex-col gap-0.5 border-l border-canvas-700 pl-3">
                      {page.sections.length === 0 && (
                        <li className="py-1 text-[11px] leading-relaxed text-canvas-600">
                          Nothing on this page yet. Open it in the preview and
                          use the <span className="text-canvas-400">+</span> to
                          add a section.
                        </li>
                      )}
                      {page.sections.map((section) => (
                        <li
                          key={`${section.index}-${section.section_id}`}
                          className="flex items-center gap-2 py-1 text-[12px] text-canvas-300"
                        >
                          <span className="w-4 shrink-0 text-right font-mono text-[10px] text-canvas-600">
                            {section.index + 1}
                          </span>
                          <span className="truncate">{readable(section.section_id)}</span>
                        </li>
                      ))}
                      <li className="pt-1.5">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => removePage(page)}
                          className="rounded px-1 py-0.5 text-[11px] text-canvas-600 transition-colors hover:text-red-400 disabled:opacity-40"
                        >
                          Delete this page
                        </button>
                      </li>
                    </ol>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
