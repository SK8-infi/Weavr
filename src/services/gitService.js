import { executeGitCommand } from './tauriIpc';

/**
 * Git Automation Service for Weavr
 * Manages staging, committing, and pushing content edits to the remote GitHub repository.
 */

export async function publishProjectChanges(repoPath, commitMessage = 'content(weavr): update page content and sections') {
  try {
    // 1. Stage changes
    await executeGitCommand(repoPath, ['add', '.']);

    // 2. Commit
    await executeGitCommand(repoPath, ['commit', '-m', commitMessage]);

    // 3. Push to remote
    const result = await executeGitCommand(repoPath, ['push', 'origin', 'main']);

    return {
      success: true,
      message: 'Successfully committed & pushed changes to GitHub!',
      details: result,
    };
  } catch (error) {
    console.error('[gitService] Publish failed:', error);
    return {
      success: false,
      message: error.message || 'Git publish operation failed',
    };
  }
}
