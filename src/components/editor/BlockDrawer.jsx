import { X, Plus, Layers, Search } from 'lucide-react';
import { useState } from 'react';
import { useRegistry } from '../../context/RegistryContext';

export default function BlockDrawer({ isOpen, onClose }) {
  const { availableSections, selectedPage, addSectionToPage } = useRegistry();
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredSections = availableSections.filter(
    (s) =>
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-y-0 right-0 w-96 bg-neutral-900 border-l border-neutral-800 shadow-2xl z-50 flex flex-col animate-slideIn">
      {/* Drawer Header */}
      <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
            <Plus className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white uppercase tracking-wider">
              Elementor Block Library
            </h3>
            <p className="text-[10px] text-neutral-400">
              Add section blocks to {selectedPage.title}
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Search Input */}
      <div className="p-3 border-b border-neutral-800">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search section blocks..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:border-amber-500"
          />
        </div>
      </div>

      {/* Available Blocks List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredSections.map((sec) => {
          const isAdded = selectedPage.sections.includes(sec.id);
          return (
            <div
              key={sec.id}
              className={`p-3.5 rounded-xl border flex items-center justify-between transition-all ${
                isAdded
                  ? 'bg-neutral-950/60 border-neutral-800/60 opacity-50'
                  : 'bg-neutral-950 border-neutral-800 hover:border-amber-500/50 hover:shadow-md'
              }`}
            >
              <div className="space-y-1">
                <p className="font-bold text-neutral-200 text-xs">{sec.name}</p>
                <p className="font-mono text-[10px] text-neutral-500">id: {sec.id}</p>
              </div>

              <button
                onClick={() => addSectionToPage(sec.id)}
                disabled={isAdded}
                className={`px-3 py-1.5 rounded-lg border font-bold text-xs flex items-center gap-1.5 transition-all ${
                  isAdded
                    ? 'bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-neutral-950 border-amber-400 shadow-xs cursor-pointer'
                }`}
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAdded ? 'Added' : 'Insert'}</span>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
