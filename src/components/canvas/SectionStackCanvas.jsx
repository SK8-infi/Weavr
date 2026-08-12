import { GripVertical, Trash2 } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';

export default function SectionStackCanvas() {
  const { selectedPage, moveSection, removeSectionFromPage, availableSections } = useRegistry();

  return (
    <div className="flex-1 flex flex-col bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
      <div className="p-3 border-b border-neutral-800 font-black text-neutral-300 uppercase tracking-wider text-[11px] flex items-center justify-between">
        <span>Page Section Hierarchy (Drag & Reorder)</span>
        <span className="text-[10px] text-neutral-500 font-normal">
          {selectedPage.sections.length} Sections
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {selectedPage.sections.map((secId, idx) => {
          const meta = availableSections.find((s) => s.id === secId) || { name: secId };
          return (
            <div
              key={`${secId}-${idx}`}
              className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 flex items-center justify-between gap-3 shadow-xs hover:border-amber-500/40 transition-all"
            >
              <div className="flex items-center gap-3">
                <GripVertical className="w-4 h-4 text-neutral-600 cursor-grab" />
                <span className="w-6 h-6 rounded-lg bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-xs">
                  {idx + 1}
                </span>
                <div>
                  <p className="font-bold text-neutral-200 text-xs">{meta.name}</p>
                  <p className="font-mono text-[10px] text-neutral-500">id: {secId}</p>
                </div>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => moveSection(selectedPage.id, idx, 'up')}
                  disabled={idx === 0}
                  className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-md text-neutral-300 text-xs font-bold cursor-pointer"
                >
                  ↑
                </button>
                <button
                  onClick={() => moveSection(selectedPage.id, idx, 'down')}
                  disabled={idx === selectedPage.sections.length - 1}
                  className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-md text-neutral-300 text-xs font-bold cursor-pointer"
                >
                  ↓
                </button>
                <button
                  onClick={() => removeSectionFromPage(secId)}
                  className="p-1.5 text-neutral-500 hover:text-rose-400 rounded-md hover:bg-neutral-800 transition-all ml-2 cursor-pointer"
                  title="Remove Section"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
