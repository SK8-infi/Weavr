import { Plus } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';

export default function SectionPalette() {
  const { availableSections, selectedPage, addSectionToPage } = useRegistry();

  return (
    <div className="w-80 flex flex-col bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden flex-shrink-0">
      <div className="p-3 border-b border-neutral-800 font-black text-neutral-300 uppercase tracking-wider text-[11px]">
        Available Section Palette
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {availableSections.map((sec) => {
          const isAdded = selectedPage.sections.includes(sec.id);
          return (
            <div
              key={sec.id}
              className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                isAdded
                  ? 'bg-neutral-950/60 border-neutral-800/60 opacity-50'
                  : 'bg-neutral-950 border-neutral-800 hover:border-amber-500/40'
              }`}
            >
              <div>
                <p className="font-bold text-neutral-300 text-[11px]">{sec.name}</p>
                <p className="font-mono text-[9px] text-neutral-500">{sec.id}</p>
              </div>

              <button
                onClick={() => addSectionToPage(sec.id)}
                disabled={isAdded}
                className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                  isAdded
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-neutral-950 cursor-pointer'
                }`}
                title={isAdded ? 'Already on page' : 'Add to page'}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
