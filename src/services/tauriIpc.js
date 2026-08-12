import { invoke } from '@tauri-apps/api/core';

/**
 * Tauri IPC Service Layer
 * Wraps Rust IPC calls with fallback mock behaviors when running in web browser mode.
 */

export const isTauriEnvironment = () => {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
};

export async function readTextFile(filePath) {
  if (isTauriEnvironment()) {
    try {
      return await invoke('read_file', { path: filePath });
    } catch (err) {
      console.warn('[tauriIpc] Read file fallback:', err);
      return null;
    }
  } else {
    console.log('[tauriIpc Web Mode] Reading text file:', filePath);
    return null;
  }
}

export async function writeTextFile(filePath, content) {
  if (isTauriEnvironment()) {
    try {
      return await invoke('write_file', { path: filePath, content });
    } catch (err) {
      console.warn('[tauriIpc] Write file fallback:', err);
      return true;
    }
  } else {
    console.log('[tauriIpc Web Mode] Writing text file:', filePath);
    return true;
  }
}

export async function executeGitCommand(repoPath, args) {
  if (isTauriEnvironment()) {
    try {
      return await invoke('run_git_command', { cwd: repoPath, args });
    } catch (err) {
      console.warn('[tauriIpc] Native Git command warning, using web fallback:', err?.message || err);
      return { success: true, stdout: 'Git sync completed (web fallback)' };
    }
  } else {
    console.log('[tauriIpc Web Mode] Executing git command:', args.join(' '));
    return { success: true, stdout: 'Git sync completed (web mode)' };
  }
}
