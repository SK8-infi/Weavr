import { Check, RefreshCw, GitBranch, Terminal, Sparkles } from 'lucide-react';
import Modal from '../common/Modal';

export default function RepoSyncModal({ isOpen, currentStep, stepMessage, repoName }) {
  if (!isOpen) return null;

  const steps = [
    { id: 1, label: 'Clone / Local Sync Check' },
    { id: 2, label: 'Pull Latest Commits (git pull origin main)' },
    { id: 3, label: 'Install Dependencies (npm install)' },
    { id: 4, label: 'Launch Website Server (localhost:5173)' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={() => {}} title={`Syncing Repository: ${repoName}`}>
      <div className="space-y-6 py-2">
        <div className="text-center space-y-1">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 mx-auto flex items-center justify-center font-bold mb-2">
            <Sparkles className="w-5 h-5 animate-pulse" />
          </div>
          <h4 className="text-xs font-black text-white uppercase tracking-wider">
            Preparing Workspace Engine
          </h4>
          <p className="text-[11px] text-neutral-400 font-mono">
            {stepMessage || 'Initializing pipeline...'}
          </p>
        </div>

        {/* Step-by-Step Progress Timeline */}
        <div className="space-y-3 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
          {steps.map((s) => {
            const isCompleted = currentStep > s.id;
            const isCurrent = currentStep === s.id;

            return (
              <div
                key={s.id}
                className={`flex items-center justify-between p-2.5 rounded-xl border text-xs font-semibold transition-all ${
                  isCompleted
                    ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'
                    : isCurrent
                    ? 'bg-amber-500/10 border-amber-500/60 text-amber-300 shadow-xs'
                    : 'bg-neutral-900/60 border-neutral-800 text-neutral-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-[10px] font-black ${
                      isCompleted
                        ? 'bg-emerald-500 text-neutral-950'
                        : isCurrent
                        ? 'bg-amber-500 text-neutral-950 animate-bounce'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5 stroke-[3]" /> : s.id}
                  </span>
                  <span>{s.label}</span>
                </div>

                {isCurrent && (
                  <RefreshCw className="w-3.5 h-3.5 text-amber-400 animate-spin flex-shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
