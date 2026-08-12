import { createContext, useContext, useState } from 'react';
import { publishProjectChanges } from '../services/gitService';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  const [workspacePath, setWorkspacePath] = useState('c:/Github/IATMSI');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null); // { type: 'success'|'error', msg: string }

  const saveLocal = async () => {
    setIsSaving(true);
    // Simulate FS write delay
    await new Promise((resolve) => setTimeout(resolve, 500));
    setIsDirty(false);
    setIsSaving(false);
  };

  const publishGit = async () => {
    setIsPublishing(true);
    setPublishStatus(null);
    const result = await publishProjectChanges(workspacePath);
    setIsPublishing(false);
    if (result.success) {
      setPublishStatus({ type: 'success', msg: result.message });
      setIsDirty(false);
    } else {
      setPublishStatus({ type: 'error', msg: result.message });
    }
  };

  return (
    <ProjectContext.Provider
      value={{
        workspacePath,
        setWorkspacePath,
        isDirty,
        setIsDirty,
        isSaving,
        saveLocal,
        isPublishing,
        publishGit,
        publishStatus,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const context = useContext(ProjectContext);
  if (!context) throw new Error('useProject must be used within ProjectProvider');
  return context;
}
