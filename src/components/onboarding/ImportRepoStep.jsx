import { useState } from 'react';
import { GitBranch, ArrowRight, Check, Search } from 'lucide-react';
import Button from '../common/Button';
import RepoSyncModal from './RepoSyncModal';
import { useProject } from '../../context/ProjectContext';
import { syncAndLaunchRepo } from '../../services/repoLifecycleService';

const MOCK_USER_REPOS = [
  {
    name: 'IATMSI-2027',
    fullName: 'SK8-infi/IATMSI-2027',
    description: 'IEEE International Conference on Advances in Technology, Management & Applied Science Website',
    cloneUrl: 'https://github.com/SK8-infi/IATMSI-2027.git',
    localPath: 'c:/Github/IATMSI',
    isTemplate: true,
  },
  {
    name: 'ICGST-2026',
    fullName: 'SK8-infi/ICGST-2026',
    description: 'International Conference on Global Science & Tech Website Template',
    cloneUrl: 'https://github.com/SK8-infi/ICGST-2026.git',
    localPath: 'c:/Github/ICGST-2026',
    isTemplate: true,
  },
  {
    name: 'EcoPulse',
    fullName: 'SK8-infi/EcoPulse',
    description: 'Environmental analytics dashboard',
    cloneUrl: 'https://github.com/SK8-infi/EcoPulse.git',
    localPath: 'c:/Github/EcoPulse',
    isTemplate: false,
  },
];

export default function ImportRepoStep() {
  const { importRepository, githubUser } = useProject();
  const [selectedRepo, setSelectedRepo] = useState(MOCK_USER_REPOS[0]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStep, setSyncStep] = useState(1);
  const [syncMessage, setSyncMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredRepos = MOCK_USER_REPOS.filter(
    (r) =>
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.fullName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleLaunchStudio = async () => {
    setIsSyncing(true);
    setSyncStep(1);
    setSyncMessage('Initializing pipeline...');

    const result = await syncAndLaunchRepo(selectedRepo, ({ step, message }) => {
      setSyncStep(step);
      setSyncMessage(message);
    });

    if (result.success) {
      setSyncStep(5);
      setSyncMessage('✓ Workspace Ready! Opening Weavr Studio...');
      await new Promise((r) => setTimeout(r, 1000));
      setIsSyncing(false);
      importRepository(selectedRepo);
    } else {
      setIsSyncing(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
          <div>
            <h2 className="text-lg font-black uppercase tracking-wider text-white">
              Import Website Repository
            </h2>
            <p className="text-xs text-neutral-400 font-medium">
              Select your conference website repository to open in Weavr Studio
            </p>
          </div>

          <div className="flex items-center gap-2 bg-neutral-950 px-3 py-1.5 rounded-full border border-neutral-800">
            <img
              src={githubUser.avatarUrl}
              alt={githubUser.username}
              className="w-5 h-5 rounded-full"
            />
            <span className="text-xs font-mono font-bold text-amber-300">
              @{githubUser.username}
            </span>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-xs">
              2
            </span>
            <span className="text-xs font-bold text-neutral-200">
              Select Target Conference Repository
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
            Step 2 of 2
          </span>
        </div>

        {/* Repositories List */}
        <div className="space-y-2">
          {filteredRepos.map((repo) => {
            const isSelected = selectedRepo.name === repo.name;
            return (
              <div
                key={repo.name}
                onClick={() => setSelectedRepo(repo)}
                className={`p-4 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-amber-500/10 border-amber-500 text-white shadow-md'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:bg-neutral-800/60 hover:text-neutral-200'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`p-2 rounded-xl border mt-0.5 ${
                      isSelected
                        ? 'bg-amber-500 text-neutral-950 border-amber-400'
                        : 'bg-neutral-800 border-neutral-700 text-neutral-400'
                    }`}
                  >
                    <GitBranch className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-black text-sm text-white">
                        {repo.fullName}
                      </h3>
                      {repo.isTemplate && (
                        <span className="text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-md border border-amber-500/30">
                          Automated Sync Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                      {repo.description}
                    </p>
                    <p className="text-[10px] font-mono text-neutral-500 mt-1">
                      Local Path: {repo.localPath}
                    </p>
                  </div>
                </div>

                <div
                  className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all ${
                    isSelected
                      ? 'bg-amber-500 border-amber-400 text-neutral-950'
                      : 'border-neutral-700'
                  }`}
                >
                  {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                </div>
              </div>
            );
          })}
        </div>

        {/* Launch Button */}
        <Button
          variant="primary"
          size="lg"
          icon={ArrowRight}
          onClick={handleLaunchStudio}
          disabled={isSyncing}
          className="w-full justify-center py-3 text-sm"
        >
          <span>{isSyncing ? 'Syncing & Launching Engine...' : 'Sync Repository & Launch Studio'}</span>
        </Button>

        {/* Automated Sync Pipeline Progress Modal */}
        <RepoSyncModal
          isOpen={isSyncing}
          currentStep={syncStep}
          stepMessage={syncMessage}
          repoName={selectedRepo.name}
        />
      </div>
    </div>
  );
}
