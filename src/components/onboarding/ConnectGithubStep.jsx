import { useState } from 'react';
import { Sparkles, GitBranch, ArrowRight, ShieldCheck, Key } from 'lucide-react';
import Button from '../common/Button';
import Input from '../common/Input';
import { useProject } from '../../context/ProjectContext';

export default function ConnectGithubStep() {
  const { connectGithub, githubUser } = useProject();
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    connectGithub(token);
    setLoading(false);
  };

  return (
    <div className="h-screen w-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-3xl p-8 shadow-2xl space-y-6 animate-fadeIn">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-700 mx-auto flex items-center justify-center text-white shadow-lg mb-4">
            <Sparkles className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-black uppercase tracking-widest bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
            Welcome to WEAVR
          </h1>
          <p className="text-xs text-neutral-400 font-medium">
            Visual Studio & No-Code CMS for Academic Conference Sites
          </p>
        </div>

        {/* Step 1 Progress Pill */}
        <div className="bg-neutral-950 p-3 rounded-2xl border border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-neutral-950 flex items-center justify-center font-black text-xs">
              1
            </span>
            <span className="text-xs font-bold text-neutral-200">
              Connect GitHub Account
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/30">
            Step 1 of 2
          </span>
        </div>

        {/* Connected Account Card */}
        {githubUser?.isAuthenticated ? (
          <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <img
                  src={githubUser.avatarUrl}
                  alt={githubUser.username}
                  className="w-10 h-10 rounded-full border-2 border-amber-500"
                />
                <div>
                  <h4 className="text-xs font-black text-white flex items-center gap-1.5">
                    <span>{githubUser.username}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  </h4>
                  <p className="text-[10px] text-neutral-400 font-mono">
                    Authenticated via GitHub CLI / OAuth
                  </p>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>

            <Button
              variant="primary"
              size="lg"
              icon={ArrowRight}
              onClick={handleConnect}
              disabled={loading}
              className="w-full justify-between"
            >
              <span>{loading ? 'Connecting...' : 'Continue to Import Repository'}</span>
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <Input
              label="GitHub Personal Access Token"
              placeholder="ghp_************************************"
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
            <Button
              variant="primary"
              size="lg"
              icon={GitBranch}
              onClick={handleConnect}
              disabled={loading}
              className="w-full justify-center"
            >
              <span>Connect GitHub</span>
            </Button>
          </div>
        )}

        <p className="text-[10px] text-neutral-500 text-center leading-relaxed">
          Weavr uses your GitHub connection to read repository structure and push your visual edits live.
        </p>
      </div>
    </div>
  );
}
