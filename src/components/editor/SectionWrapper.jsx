import { useState } from 'react';
import { ArrowUp, ArrowDown, Plus, Trash2, GripVertical, Settings } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';

export default function SectionWrapper({
  sectionId,
  index,
  totalSections,
  children,
  onOpenPalette,
}) {
  const { selectedPage, moveSection, removeSectionFromPage, availableSections } = useRegistry();
  const [isHovered, setIsHovered] = useState(false);

  const sectionMeta = availableSections.find((s) => s.id === sectionId) || {
    name: sectionId,
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative group transition-all duration-200 ${
        isHovered
          ? 'ring-2 ring-amber-500 ring-offset-2 ring-offset-neutral-950 rounded-2xl shadow-xl'
          : 'border border-transparent'
      }`}
    >
      {/* Floating WordPress / Elementor Action Bar */}
      {isHovered && (
        <div className="absolute -top-4 left-6 z-40 bg-neutral-900 border border-amber-500/80 rounded-xl shadow-2xl px-3 py-1 flex items-center gap-2 text-xs text-white animate-fadeIn">
          <div className="flex items-center gap-1.5 font-black text-[11px] text-amber-300 pr-2 border-r border-neutral-700 uppercase tracking-wider">
            <GripVertical className="w-3.5 h-3.5 text-neutral-500" />
            <span>{sectionMeta.name}</span>
          </div>

          {/* Section Action Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveSection(selectedPage.id, index, 'up')}
              disabled={index === 0}
              className="p-1 hover:bg-neutral-800 disabled:opacity-30 rounded text-neutral-300 hover:text-amber-400 transition-all cursor-pointer"
              title="Move Section Up"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => moveSection(selectedPage.id, index, 'down')}
              disabled={index === totalSections - 1}
              className="p-1 hover:bg-neutral-800 disabled:opacity-30 rounded text-neutral-300 hover:text-amber-400 transition-all cursor-pointer"
              title="Move Section Down"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={onOpenPalette}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-300 hover:text-amber-400 transition-all cursor-pointer"
              title="Add Block Here"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={() => removeSectionFromPage(sectionId)}
              className="p-1 hover:bg-neutral-800 rounded text-neutral-300 hover:text-rose-400 transition-all ml-1 cursor-pointer"
              title="Delete Section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Rendered Section Content */}
      <div className="w-full">{children}</div>
    </div>
  );
}
