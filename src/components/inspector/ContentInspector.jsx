import { Edit3 } from 'lucide-react';
import Input from '../common/Input';
import { useRegistry } from '../../context/RegistryContext';

export default function ContentInspector() {
  const { selectedPage, updatePageMeta } = useRegistry();

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
        <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider border-b border-neutral-800 pb-3 flex items-center gap-2">
          <Edit3 className="w-4 h-4" />
          Edit Page Metadata & Header Config
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Input
            label="Page Title"
            value={selectedPage.title}
            onChange={(e) => updatePageMeta(selectedPage.id, { title: e.target.value })}
          />

          <Input
            label="Route Path"
            value={selectedPage.path}
            onChange={(e) => updatePageMeta(selectedPage.id, { path: e.target.value })}
          />
        </div>
      </div>

      {/* Data Modules Reference Box */}
      <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-3">
        <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider border-b border-neutral-800 pb-3">
          Bound Data Modules (`src/data/`)
        </h3>
        <p className="text-xs text-neutral-400 font-medium leading-relaxed">
          Weavr reads and updates named exports directly inside the target repository:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            conferenceData.js
          </div>
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            committeeData.js
          </div>
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            registrationData.js
          </div>
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            sponsorshipData.js
          </div>
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            fellowshipsData.js
          </div>
          <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
            hardnovateData.js
          </div>
        </div>
      </div>
    </div>
  );
}
