import {
  Sparkles,
  Monitor,
  Tablet,
  Smartphone,
  Plus,
  Save,
  Send,
  Check,
  ChevronDown,
  Globe,
  ExternalLink,
} from 'lucide-react';
import Button from '../common/Button';
import { useProject } from '../../context/ProjectContext';
import { useRegistry } from '../../context/RegistryContext';

export default function VisualToolbar({
  viewportMode,
  setViewportMode,
  onOpenBlockDrawer,
}) {
  const { workspacePath, isDirty, isSaving, saveLocal, isPublishing, publishGit, publishStatus } = useProject();
  const { pages, selectedPageId, setSelectedPageId, selectedPage } = useRegistry();

  return (
    <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between flex-shrink-0 z-40">
      {/* Brand & Page Selector */}
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-rose-700 flex items-center justify-center text-white shadow-md">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-black tracking-widest uppercase bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
            WEAVR
          </h1>
          <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-wider">
            WordPress Visual Studio
          </p>
        </div>

        {/* WordPress Style Page Selector Dropdown */}
        <div className="ml-4 relative">
          <select
            value={selectedPageId}
            onChange={(e) => setSelectedPageId(e.target.value)}
            className="bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-1.5 text-xs text-amber-300 font-bold focus:outline-none focus:border-amber-500 cursor-pointer appearance-none pr-8"
          >
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                📄 {p.title} ({p.path})
              </option>
            ))}
          </select>
          <ChevronDown className="w-3.5 h-3.5 text-neutral-400 absolute right-2.5 top-2.5 pointer-events-none" />
        </div>
      </div>

      {/* Center Device Viewport Toggles */}
      <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
        <button
          onClick={() => setViewportMode('desktop')}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            viewportMode === 'desktop'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Desktop Viewport"
        >
          <Monitor className="w-4 h-4" />
        </button>

        <button
          onClick={() => setViewportMode('tablet')}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            viewportMode === 'tablet'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Tablet Viewport (768px)"
        >
          <Tablet className="w-4 h-4" />
        </button>

        <button
          onClick={() => setViewportMode('mobile')}
          className={`p-1.5 rounded-lg transition-all cursor-pointer ${
            viewportMode === 'mobile'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
          title="Mobile Viewport (375px)"
        >
          <Smartphone className="w-4 h-4" />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          icon={Plus}
          onClick={onOpenBlockDrawer}
          className="border-amber-500/50 text-amber-300"
        >
          Add Block
        </Button>

        {isDirty && (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/30 animate-pulse">
            Unsaved Edits
          </span>
        )}

        <Button
          variant="secondary"
          size="sm"
          icon={Save}
          onClick={saveLocal}
          disabled={isSaving}
        >
          {isSaving ? 'Saving...' : 'Save Local'}
        </Button>

        <Button
          variant="primary"
          size="sm"
          icon={Send}
          onClick={publishGit}
          disabled={isPublishing}
        >
          {isPublishing ? 'Publishing...' : 'Publish Site'}
        </Button>

        {publishStatus?.type === 'success' && (
          <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
            <Check className="w-3.5 h-3.5" /> Published!
          </span>
        )}
      </div>
    </header>
  );
}
