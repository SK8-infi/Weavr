import { useState, useEffect, useRef } from 'react';
import { Play, RefreshCw, AlertCircle, MousePointer, Check } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';
import { useProject } from '../../context/ProjectContext';

export default function VisualCanvas({ viewportMode, onOpenBlockDrawer }) {
  const { selectedPage } = useRegistry();
  const { selectedRepo, workspacePath, setIsDirty } = useProject();
  const [isServerOnline, setIsServerOnline] = useState(false);
  const [isCheckingServer, setIsCheckingServer] = useState(true);
  const [isStartingServer, setIsStartingServer] = useState(false);
  const [lastEditedText, setLastEditedText] = useState(null);
  const iframeRef = useRef(null);

  const targetUrl = `http://localhost:5173${selectedPage.path}`;

  // Check if localhost:5173 dev server is active
  const checkServerStatus = async () => {
    setIsCheckingServer(true);
    try {
      await fetch('http://localhost:5173/', { method: 'HEAD', mode: 'no-cors' });
      setIsServerOnline(true);
    } catch (err) {
      setIsServerOnline(false);
    } finally {
      setIsCheckingServer(false);
    }
  };

  useEffect(() => {
    checkServerStatus();
    const interval = setInterval(checkServerStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStartServer = async () => {
    setIsStartingServer(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsStartingServer(false);
    checkServerStatus();
  };

  const viewportWidths = {
    desktop: 'w-full max-w-7xl h-full',
    tablet: 'w-[768px] h-full',
    mobile: 'w-[375px] h-full',
  };

  return (
    <div className="flex-1 bg-neutral-950 overflow-hidden p-4 md:p-6 flex flex-col items-center justify-center">
      <div
        className={`transition-all duration-300 bg-white rounded-2xl shadow-2xl overflow-hidden border border-neutral-800 flex flex-col ${viewportWidths[viewportMode]}`}
      >
        {/* Workspace Connection Header Bar */}
        <div className="h-10 bg-neutral-900 px-4 border-b border-neutral-800 flex items-center justify-between flex-shrink-0 text-xs font-mono select-none">
          <div className="flex items-center gap-2 text-neutral-400 truncate">
            <span
              className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                isServerOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
              }`}
            />
            <span className="font-bold text-amber-400 truncate">
              {selectedRepo.fullName}
            </span>
            <span className="text-neutral-600">|</span>
            <span className="truncate">{targetUrl}</span>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-sans">
            {lastEditedText && (
              <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30 animate-fadeIn">
                <Check className="w-3 h-3" /> Live Edit Captured!
              </span>
            )}

            <div className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30">
              <MousePointer className="w-3 h-3" />
              <span>Click Any Text to Edit</span>
            </div>

            <button
              onClick={checkServerStatus}
              disabled={isCheckingServer}
              className="p-1 rounded-md hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all cursor-pointer"
              title="Refresh Status"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCheckingServer ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onOpenBlockDrawer}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold transition-all cursor-pointer"
            >
              + Insert Block
            </button>
          </div>
        </div>

        {/* Server Online: Render Authentic 100% Real Website Iframe */}
        {isServerOnline ? (
          <iframe
            ref={iframeRef}
            src={targetUrl}
            title={`Live Workspace: ${selectedRepo.name}`}
            className="flex-1 w-full h-full border-0 bg-white"
          />
        ) : (
          /* Server Offline Banner */
          <div className="flex-1 bg-[#FAF5EB] flex flex-col items-center justify-center p-8 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-black text-sm text-neutral-900 uppercase tracking-wider">
                Website Dev Engine Offline
              </h4>
              <p className="text-xs text-neutral-600 mt-1">
                Target repository: <span className="font-mono font-bold text-[#722332]">{workspacePath}</span>
              </p>
            </div>

            <button
              onClick={handleStartServer}
              disabled={isStartingServer}
              className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-neutral-950 font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{isStartingServer ? 'Starting Engine...' : 'Launch Website Server'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
