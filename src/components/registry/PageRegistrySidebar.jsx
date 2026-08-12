import { LayoutGrid, Plus, ChevronRight, Trash2 } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';

export default function PageRegistrySidebar({ onOpenAddModal }) {
  const { pages, selectedPageId, setSelectedPageId, deletePage } = useRegistry();

  return (
    <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col flex-shrink-0">
      <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2 text-neutral-300 font-black uppercase text-[11px]">
          <LayoutGrid className="w-4 h-4 text-amber-400" />
          <span>Page Registry ({pages.length})</span>
        </div>
        <button
          onClick={onOpenAddModal}
          className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 transition-all cursor-pointer"
          title="Add New Page Route"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {pages.map((p) => {
          const isSelected = p.id === selectedPageId;
          return (
            <div
              key={p.id}
              onClick={() => setSelectedPageId(p.id)}
              className={`group p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                isSelected
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-xs'
                  : 'bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200'
              }`}
            >
              <div className="flex items-center gap-2 overflow-hidden">
                <ChevronRight
                  className={`w-3.5 h-3.5 flex-shrink-0 ${
                    isSelected ? 'text-amber-400' : 'text-neutral-600'
                  }`}
                />
                <div className="truncate">
                  <p className="font-black text-[11px] truncate">{p.title}</p>
                  <p className="font-mono text-[9px] text-neutral-500 truncate">
                    {p.path}
                  </p>
                </div>
              </div>

              {pages.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    deletePage(p.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 transition-all cursor-pointer"
                  title="Delete Page"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </aside>
  );
}
