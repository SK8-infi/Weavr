import { Sparkles, FolderOpen, Layers, FileText, Eye, Save, Send, Check } from 'lucide-react';
import Button from '../common/Button';
import { useProject } from '../../context/ProjectContext';

export default function HeaderBar({ activeTab, setActiveTab }) {
  const { workspacePath, isDirty, isSaving, saveLocal, isPublishing, publishGit, publishStatus } = useProject();

  return (
    <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-rose-700 flex items-center justify-center text-white shadow-md">
          <Sparkles className="w-4 h-4" />
        </div>
        <div>
          <h1 className="text-sm font-black tracking-widest uppercase bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
            WEAVR
          </h1>
          <p className="text-[10px] text-neutral-400 font-medium">
            No-Code Visual Editor & Site Studio
          </p>
        </div>

        <div className="ml-6 px-3 py-1 rounded-lg bg-neutral-950 border border-neutral-800 flex items-center gap-2 text-[11px] text-neutral-300">
          <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono text-neutral-400">{workspacePath}</span>
        </div>
      </div>

      {/* Center Tab Navigation */}
      <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
        <button
          onClick={() => setActiveTab('sections')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'sections'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Section Stack</span>
        </button>

        <button
          onClick={() => setActiveTab('content')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'content'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span>Content Data</span>
        </button>

        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold text-xs transition-all ${
            activeTab === 'preview'
              ? 'bg-amber-500 text-neutral-950 shadow-xs'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Eye className="w-3.5 h-3.5" />
          <span>Live Sandbox</span>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-2">
        {isDirty && (
          <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 px-2 py-1 rounded-md border border-amber-500/30">
            Unsaved Changes
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
          {isPublishing ? 'Publishing...' : 'Save & Publish'}
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
