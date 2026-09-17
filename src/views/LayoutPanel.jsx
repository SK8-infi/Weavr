import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Icon from "../components/ui/Icon";
import { cn } from "../utils/cn";

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

  const reload = useCallback(() => {
    invoke("page_list")
      .then((list) => {
        setPages(list);
        setError("");
      })
      .catch((err) => setError(String(err)));
  }, []);

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
