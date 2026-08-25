import { useCallback, useEffect, useState } from "react";
import ContentPanel from "./ContentPanel";
import StructurePanel from "./StructurePanel";
import PublishBar from "./PublishBar";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import WeavrMark from "../components/ui/WeavrMark";
import { invoke } from "../lib/tauri";
import { cn } from "../utils/cn";

const TABS = [
  { id: "text", label: "Text", icon: "text" },
  { id: "lists", label: "Lists", icon: "layers" },
];

/**
 * The editing panel, docked beside the live site.
 *
 * It starts collapsed to a rail so the site gets the whole window — which also
 * keeps the site above its own desktop breakpoint, rather than showing its
 * mobile layout in a narrowed preview. The rail stays on screen because the
 * preview is a separate webview and can't host Weavr's own controls.
 */
export default function EditorView({ project, onBack }) {
  const { repo, info } = project;
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState("text");

  // Rust owns the split, so the webview width and this state move together.
  const applyExpanded = useCallback((next) => {
    setExpanded(next);
    invoke("panel_set_expanded", { expanded: next }).catch(() => {});
  }, []);

  useEffect(() => {
    // Start from the rail every time a site is opened.
    invoke("panel_set_expanded", { expanded: false }).catch(() => {});
  }, [info.local_path]);

  function openTab(id) {
    setTab(id);
    if (!expanded) applyExpanded(true);
  }

  if (!expanded) {
    return (
      <Rail
        tab={tab}
        onOpen={openTab}
        onBack={() => {
          invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
          onBack();
        }}
      />
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="bg-canvas-0/70 backdrop-blur-xl flex shrink-0 items-center gap-1.5 px-2.5 py-2 shadow-panel">
        <Button
          variant="ghost"
          size="icon"
          title="Collapse panel"
          onClick={() => applyExpanded(false)}
        >
          <Icon name="back" />
        </Button>

        <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-canvas-900">
          {repo.name}
        </span>

        <nav className="flex shrink-0 gap-0.5 rounded-[10px] bg-canvas-100 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-medium",
                "transition-all duration-200 ease-[var(--ease-out-soft)]",
                tab === t.id
                  ? "bg-canvas-0 text-canvas-900 shadow-panel"
                  : "text-canvas-500 hover:text-canvas-800",
              )}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5" />
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      {tab === "text" && (
        <p className="shrink-0 bg-brand-50/50 px-4 py-2 text-[11px] leading-relaxed text-canvas-600">
          Click any text on your site to edit it. Hold <Kbd>Ctrl</Kbd> and click
          to follow a link or open a menu.
        </p>
      )}

      <div className="min-h-0 flex-1">
        {tab === "text" ? (
          <ContentPanel projectPath={info.local_path} />
        ) : (
          <StructurePanel />
        )}
      </div>

      <PublishBar />
    </div>
  );
}

/** The collapsed state: mark, tab shortcuts, and a publish indicator. */
function Rail({ tab, onOpen, onBack }) {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const read = () =>
      invoke("publish_pending")
        .then((r) => setPending(r.files.length))
        .catch(() => {});
    read();
    const timer = setInterval(read, 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="bg-canvas-0/70 backdrop-blur-xl flex h-full flex-col items-center gap-1 py-2.5 shadow-panel">
      <button
        type="button"
        onClick={onBack}
        title="Close this website"
        className="mb-1 rounded-xl p-1 transition-transform duration-200 hover:scale-105"
      >
        <WeavrMark className="h-7 w-7" />
      </button>

      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onOpen(t.id)}
          title={t.label}
          className={cn(
            "relative flex h-9 w-9 items-center justify-center rounded-xl",
            "transition-all duration-200 ease-[var(--ease-out-soft)]",
            tab === t.id
              ? "bg-brand-50 text-brand-600"
              : "text-canvas-400 hover:bg-canvas-100 hover:text-canvas-700",
          )}
        >
          <Icon name={t.icon} />
        </button>
      ))}

      <span className="mt-auto flex flex-col items-center gap-2">
        {pending > 0 && (
          <span
            title={`${pending} unpublished ${pending === 1 ? "change" : "changes"}`}
            className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-gradient px-1 text-[10px] font-semibold text-white shadow-accent"
          >
            {pending}
          </span>
        )}
        <button
          type="button"
          onClick={() => onOpen(tab)}
          title="Open panel"
          className="flex h-9 w-9 items-center justify-center rounded-xl text-canvas-400 transition-colors duration-200 hover:bg-canvas-100 hover:text-canvas-700"
        >
          <Icon name="chevronRight" />
        </button>
      </span>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <kbd className="rounded border border-canvas-300 bg-canvas-0 px-1 py-px font-sans text-[10px] font-medium text-canvas-600 shadow-[0_1px_0_var(--color-canvas-300)]">
      {children}
    </kbd>
  );
}
