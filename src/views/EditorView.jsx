import ContentPanel from "./ContentPanel";
import PublishBar from "./PublishBar";
import Button from "../components/ui/Button";
import { invoke } from "../lib/tauri";

/**
 * The editing panel.
 *
 * The live site is docked beside this in the same window, but it's a separate
 * webview drawn by the OS — nothing here renders it, which is why there's no
 * preview element in this tree.
 */
export default function EditorView({ project, onBack }) {
  const { repo, info } = project;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-canvas-50">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-canvas-200/70 bg-canvas-0/80 px-2.5 py-2 backdrop-blur">
        <Button
          variant="ghost"
          size="sm"
          title="Close this website"
          onClick={() => {
            invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
            onBack();
          }}
        >
          ←
        </Button>
        <span className="truncate text-[13px] font-semibold tracking-[-0.01em] text-canvas-900">
          {repo.name}
        </span>
      </header>

      <p className="shrink-0 border-b border-canvas-200/70 bg-brand-50/60 px-4 py-2 text-[11px] leading-relaxed text-canvas-600">
        Click any text on your site to edit it. Hold{" "}
        <Kbd>Ctrl</Kbd> and click to follow a link or open a menu.
      </p>

      <div className="min-h-0 flex-1">
        <ContentPanel projectPath={info.local_path} />
      </div>

      <PublishBar />
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
