import { useState } from 'react';
import { ProjectProvider } from './context/ProjectContext';
import { RegistryProvider } from './context/RegistryContext';

import VisualToolbar from './components/editor/VisualToolbar';
import VisualCanvas from './components/editor/VisualCanvas';
import BlockDrawer from './components/editor/BlockDrawer';

import './App.css';

function WordPressEditorShell() {
  const [viewportMode, setViewportMode] = useState('desktop'); // 'desktop' | 'tablet' | 'mobile'
  const [isBlockDrawerOpen, setIsBlockDrawerOpen] = useState(false);

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans text-xs select-none">
      {/* 1. WordPress Top Floating Admin Bar */}
      <VisualToolbar
        viewportMode={viewportMode}
        setViewportMode={setViewportMode}
        onOpenBlockDrawer={() => setIsBlockDrawerOpen(true)}
      />

      {/* 2. Main Full-Screen Visual WYSIWYG Canvas */}
      <div className="flex-1 flex overflow-hidden relative">
        <VisualCanvas
          viewportMode={viewportMode}
          onOpenBlockDrawer={() => setIsBlockDrawerOpen(true)}
        />

        {/* 3. Elementor Block Side Drawer */}
        <BlockDrawer
          isOpen={isBlockDrawerOpen}
          onClose={() => setIsBlockDrawerOpen(false)}
        />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ProjectProvider>
      <RegistryProvider>
        <WordPressEditorShell />
      </RegistryProvider>
    </ProjectProvider>
  );
}
