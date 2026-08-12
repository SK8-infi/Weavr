import { useRegistry } from '../../context/RegistryContext';

export default function SandboxPreviewFrame() {
  const { selectedPage } = useRegistry();
  const iframeUrl = `http://localhost:5173${selectedPage.path}`;

  return (
    <div className="flex-1 bg-neutral-900 p-2 flex flex-col">
      <div className="h-8 bg-neutral-950 rounded-t-xl px-4 flex items-center justify-between border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          Live Preview: {iframeUrl}
        </span>
        <span>Vite Dev Sandbox</span>
      </div>
      <iframe
        src={iframeUrl}
        title="Live Sandbox Preview"
        className="flex-1 w-full border-0 rounded-b-xl bg-white"
      />
    </div>
  );
}
