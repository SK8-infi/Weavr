import { useRegistry } from '../../context/RegistryContext';
import { useProject } from '../../context/ProjectContext';

export default function VisualCanvas({ viewportMode, onOpenBlockDrawer }) {
  const { selectedPage } = useRegistry();
  const { selectedRepo } = useProject();

  const viewportWidths = {
    desktop: 'w-full max-w-7xl h-full',
    tablet: 'w-[768px] h-full',
    mobile: 'w-[375px] h-full',
  };

  const targetUrl = `http://localhost:5173${selectedPage.path}`;

  return (
    <div className="flex-1 bg-neutral-950 overflow-hidden p-4 md:p-6 flex flex-col items-center justify-center">
      <div
        className={`transition-all duration-300 bg-white rounded-2xl shadow-2xl overflow-hidden border border-neutral-800 flex flex-col ${viewportWidths[viewportMode]}`}
      >
        {/* Dynamic Sandbox Header Address Bar */}
        <div className="h-9 bg-neutral-900 px-4 border-b border-neutral-800 flex items-center justify-between flex-shrink-0 text-xs font-mono">
          <div className="flex items-center gap-2 text-neutral-400 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="font-bold text-amber-400 truncate">
              {selectedRepo.fullName}
            </span>
            <span className="text-neutral-600">|</span>
            <span className="truncate">{targetUrl}</span>
          </div>

          <div className="flex items-center gap-2 text-[10px] text-neutral-400 font-sans">
            <button
              onClick={onOpenBlockDrawer}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold transition-all cursor-pointer"
            >
              + Insert Block
            </button>
          </div>
        </div>

        {/* Dynamic Live Target Website Frame */}
        <iframe
          src={targetUrl}
          title={`Live Workspace: ${selectedRepo.name}`}
          className="flex-1 w-full h-full border-0 bg-white"
        />
      </div>
    </div>
  );
}
