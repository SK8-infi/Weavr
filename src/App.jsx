import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { ProjectProvider } from './context/ProjectContext';
import { RegistryProvider, useRegistry } from './context/RegistryContext';

import HeaderBar from './components/layout/HeaderBar';
import PageRegistrySidebar from './components/registry/PageRegistrySidebar';
import AddPageModal from './components/registry/AddPageModal';
import SectionStackCanvas from './components/canvas/SectionStackCanvas';
import SectionPalette from './components/canvas/SectionPalette';
import ContentInspector from './components/inspector/ContentInspector';
import SandboxPreviewFrame from './components/preview/SandboxPreviewFrame';

import './App.css';

function MainEditorShell() {
  const { selectedPage } = useRegistry();
  const [activeTab, setActiveTab] = useState('sections'); // 'sections' | 'content' | 'preview'
  const [isAddPageOpen, setIsAddPageOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans text-xs">
      {/* 1. Header Bar */}
      <HeaderBar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* 2. Main Body Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Page Registry Sidebar */}
        <PageRegistrySidebar onOpenAddModal={() => setIsAddPageOpen(true)} />

        {/* Center Main Workspace Canvas */}
        <main className="flex-1 flex flex-col bg-neutral-950 overflow-hidden">
          {/* Active Route Title Bar */}
          <div className="p-4 bg-neutral-900/60 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold">
                  {selectedPage.path}
                </span>
                <h2 className="text-base font-black text-white">
                  {selectedPage.title}
                </h2>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Active Sections: {selectedPage.sections.length} block(s) loaded
              </p>
            </div>

            <a
              href={`http://localhost:5173${selectedPage.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:underline font-semibold bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-700"
            >
              <span>Open Route in Browser</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Active Tab View Rendering */}
          {activeTab === 'sections' && (
            <div className="flex-1 flex overflow-hidden p-4 gap-6">
              <SectionStackCanvas />
              <SectionPalette />
            </div>
          )}

          {activeTab === 'content' && <ContentInspector />}

          {activeTab === 'preview' && <SandboxPreviewFrame />}
        </main>
      </div>

      {/* Modals */}
      <AddPageModal
        isOpen={isAddPageOpen}
        onClose={() => setIsAddPageOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <RegistryProvider>
        <MainEditorShell />
      </RegistryProvider>
    </ProjectProvider>
  );
}
