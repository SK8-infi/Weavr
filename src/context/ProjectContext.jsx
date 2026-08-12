import { createContext, useContext, useState, useEffect } from 'react';
import { publishProjectChanges } from '../services/gitService';
import { executeGitCommand } from '../services/tauriIpc';

const ProjectContext = createContext(null);

export function ProjectProvider({ children }) {
  // Step 1: 'connect_github' | Step 2: 'import_repo' | Step 3: 'editor'
  const [setupStep, setSetupStep] = useState('connect_github');
  const [githubUser, setGithubUser] = useState({
    username: 'SK8-infi',
    avatarUrl: 'https://github.com/SK8-infi.png',
    isAuthenticated: true,
  });
  const [selectedRepo, setSelectedRepo] = useState({
    name: 'IATMSI-2027',
    fullName: 'SK8-infi/IATMSI-2027',
    cloneUrl: 'https://github.com/SK8-infi/IATMSI-2027.git',
    localPath: 'c:/Github/IATMSI',
  });

  const [workspacePath, setWorkspacePath] = useState('c:/Github/IATMSI');
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState(null);

  const connectGithub = async (tokenOrAuth) => {
    // Authenticate GitHub account
    setGithubUser({
      username: 'SK8-infi',
      avatarUrl: 'https://github.com/SK8-infi.png',
      isAuthenticated: true,
    });
    setSetupStep('import_repo');
  };

  const importRepository = async (repo) => {
    setSelectedRepo(repo);
    setWorkspacePath(repo.localPath || 'c:/Github/IATMSI');
    setSetupStep('editor');
  };

  const saveLocal = async () => {
    setIsSaving(true);
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
        setupStep,
        setSetupStep,
        githubUser,
        connectGithub,
        selectedRepo,
        importRepository,
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
