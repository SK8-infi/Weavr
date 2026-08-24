import ContentPanel from "./ContentPanel";
import PublishBar from "./PublishBar";
import { invoke } from "../lib/tauri";

/**
 * The editing panel. The live preview is docked beside this in the same
 * window, but it's a separate webview rendered by the OS — nothing here draws
 * it, which is why there's no preview element in this tree.
 */
export default function EditorView({ project, onBack }) {
  const { repo, info } = project;

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex items-center gap-2 border-b border-canvas-200 bg-white px-4 py-3">
        <button
          type="button"
          onClick={() => {
            invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
            onBack();
          }}
          className="shrink-0 text-sm text-canvas-800/50 hover:text-canvas-900"
          title="Close this site"
        >
          ←
        </button>
        <span className="truncate font-medium text-canvas-900">{repo.name}</span>
      </header>

      <p className="border-b border-canvas-200 bg-brand-50 px-4 py-2 text-xs text-canvas-800/70">
        Click any text in the preview to edit it, or use the list below.
      </p>

      <div className="min-h-0 flex-1">
        <ContentPanel projectPath={info.local_path} />
      </div>

      <PublishBar />
    </div>
  );
}
