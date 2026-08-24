import ContentPanel from "./ContentPanel";
import PublishBar from "./PublishBar";
import { invoke } from "../lib/tauri";

export default function EditorView({ project, previewUrl, onBack }) {
  const { repo, info } = project;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-canvas-200 bg-white px-5 py-3 shadow-panel">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
              onBack();
            }}
            className="text-sm text-canvas-800/50 hover:text-canvas-900"
          >
            ← Sites
          </button>
          <span className="font-medium text-canvas-900">{repo.name}</span>
        </div>
        <span className="text-xs text-canvas-800/40">{previewUrl}</span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-full max-w-md flex-col border-r border-canvas-200 bg-white">
          <div className="min-h-0 flex-1">
            <ContentPanel projectPath={info.local_path} />
          </div>
          <PublishBar />
        </aside>

        <div className="flex flex-1 items-center justify-center bg-canvas-100 px-8 text-center">
          <div className="max-w-sm">
            <p className="mb-2 text-sm font-medium text-canvas-900">
              Your site is open in the preview window
            </p>
            <p className="text-sm text-canvas-800/60">
              Click any text there to edit it in place, or use the list on the left.
              Changes save as you go.
            </p>
            <button
              type="button"
              onClick={() =>
                invoke("preview_start", { projectPath: info.local_path }).catch(() => {})
              }
              className="mt-4 rounded-lg border border-canvas-200 bg-white px-4 py-2 text-sm shadow-panel hover:border-brand-500"
            >
              Bring preview to front
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
