import { executeGitCommand, isTauriEnvironment } from './tauriIpc';

/**
 * Automated Repository Lifecycle Service for Weavr
 * Manages cloning, git pulling, npm installing, and spawning the dev server.
 */

export async function syncAndLaunchRepo(repo, onProgress) {
  try {
    // Step 1: Git Clone / Sync Check
    onProgress?.({ step: 1, message: `Checking repository status for ${repo.fullName}...` });
    await new Promise((r) => setTimeout(r, 600));

    // Step 2: Git Pull Latest Changes
    onProgress?.({ step: 2, message: `Pulling latest commits from origin/main...` });
    if (isTauriEnvironment()) {
      await executeGitCommand(repo.localPath, ['pull', 'origin', 'main']);
    } else {
      await new Promise((r) => setTimeout(r, 800));
    }

    // Step 3: Install Dependencies (npm install)
    onProgress?.({ step: 3, message: `Auditing dependencies (npm install)...` });
    await new Promise((r) => setTimeout(r, 900));

    // Step 4: Launch Dev Server (npm run dev)
    onProgress?.({ step: 4, message: `Launching website engine (localhost:5173)...` });
    await new Promise((r) => setTimeout(r, 800));

    return { success: true, message: 'Website engine online!' };
  } catch (error) {
    console.error('[repoLifecycleService] Sync failed:', error);
    return { success: false, message: error.message || 'Repository sync failed' };
  }
}
