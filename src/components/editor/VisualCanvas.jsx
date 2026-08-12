import { useState, useEffect, useRef } from 'react';
import { Play, RefreshCw, AlertCircle, Sparkles, MousePointer, Check } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';
import { useProject } from '../../context/ProjectContext';
import EditableText from './EditableText';
import SectionWrapper from './SectionWrapper';

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

  // Inject Live WYSIWYG Editable Script into Website Iframe
  const handleIframeLoad = () => {
    try {
      const iframe = iframeRef.current;
      if (!iframe) return;
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) return;

      // Inject Outline & Focus Styles
      const existingStyle = doc.getElementById('weavr-editor-styles');
      if (!existingStyle) {
        const style = doc.createElement('style');
        style.id = 'weavr-editor-styles';
        style.innerHTML = `
          [contenteditable="true"] {
            outline: 2px dashed #d4a244 !important;
            outline-offset: 3px !important;
            transition: all 0.15s ease !important;
            cursor: text !important;
          }
          [contenteditable="true"]:hover {
            outline: 2px solid #722332 !important;
            background-color: rgba(212, 162, 68, 0.1) !important;
          }
          [contenteditable="true"]:focus {
            outline: 2px solid #d4a244 !important;
            background-color: rgba(212, 162, 68, 0.15) !important;
            box-shadow: 0 4px 12px rgba(114, 35, 50, 0.15) !important;
          }
        `;
        doc.head.appendChild(style);
      }

      // Attach ContentEditable to all text elements in the live site
      const targets = doc.querySelectorAll(
        'h1, h2, h3, h4, h5, h6, p, button, a, span.font-black, span.font-bold, li, td, th'
      );

      targets.forEach((el) => {
        // Skip links that navigate away
        if (el.tagName === 'A') {
          el.addEventListener('click', (e) => e.preventDefault());
        }

        el.setAttribute('contenteditable', 'true');
        el.setAttribute('spellcheck', 'false');

        el.addEventListener('blur', () => {
          const text = el.innerText.trim();
          if (text) {
            setLastEditedText(text);
            setIsDirty(true);
            setTimeout(() => setLastEditedText(null), 2500);
          }
        });
      });
    } catch (err) {
      console.warn('[Weavr] Iframe WYSIWYG injection notice:', err);
    }
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

        {/* Server Online: Render Interactive WYSIWYG Website Iframe */}
        {isServerOnline ? (
          <iframe
            ref={iframeRef}
            src={targetUrl}
            onLoad={handleIframeLoad}
            title={`Live Workspace: ${selectedRepo.name}`}
            className="flex-1 w-full h-full border-0 bg-white"
          />
        ) : (
          /* Server Offline: Render Helpful Launch Banner & Embedded Visual Editor */
          <div className="flex-1 bg-[#FAF5EB] overflow-y-auto flex flex-col">
            <div className="bg-neutral-900 text-neutral-200 p-4 border-b-2 border-amber-500 flex flex-col md:flex-row items-center justify-between gap-4 px-6 shadow-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold flex-shrink-0">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-black text-xs text-white uppercase tracking-wider">
                    Website Dev Engine Offline
                  </h4>
                  <p className="text-[11px] text-neutral-400 font-medium">
                    Target repo: <span className="font-mono text-amber-300">{workspacePath}</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleStartServer}
                  disabled={isStartingServer}
                  className="px-4 py-2 bg-gradient-to-r from-amber-500 to-rose-600 hover:from-amber-400 hover:to-rose-500 text-neutral-950 font-black text-xs rounded-xl shadow-md flex items-center gap-2 transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isStartingServer ? 'Starting Engine...' : 'Launch Website Server'}</span>
                </button>
              </div>
            </div>

            <div className="p-6 md:p-8 space-y-8 flex-1">
              <div className="bg-gradient-to-b from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-6 rounded-2xl border-2 border-[#C59B27]/40 text-center space-y-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full inline-block">
                  IATMSI 2027 Route: {selectedPage.path}
                </span>
                <h2 className="text-2xl md:text-3xl font-black text-[#4A121A] font-heading uppercase">
                  <EditableText value={selectedPage.title} />
                </h2>
              </div>

              {selectedPage.sections.map((secId, idx) => (
                <SectionWrapper
                  key={`${secId}-${idx}`}
                  sectionId={secId}
                  index={idx}
                  totalSections={selectedPage.sections.length}
                  onOpenPalette={onOpenBlockDrawer}
                >
                  <div className="bg-white p-6 rounded-2xl border-2 border-[#C59B27]/40 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-[#C59B27]/30 pb-3">
                      <span className="text-xs font-black uppercase tracking-wider text-[#722332]">
                        Section Block: {secId}
                      </span>
                      <span className="text-[10px] font-mono text-neutral-500">
                        src/components/sections/{secId}.jsx
                      </span>
                    </div>

                    <p className="text-xs md:text-sm text-neutral-800 font-medium leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value={`Click to edit content for section ${secId} in target project ${selectedRepo.fullName}`}
                      />
                    </p>
                  </div>
                </SectionWrapper>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
