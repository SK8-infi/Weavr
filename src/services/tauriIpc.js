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
      console.error('[tauriIpc] Error reading file:', err);
      throw err;
    }
  } else {
    console.log('[tauriIpc Web Fallback] Reading text file:', filePath);
    return null;
  }
}

export async function writeTextFile(filePath, content) {
  if (isTauriEnvironment()) {
    try {
      return await invoke('write_file', { path: filePath, content });
    } catch (err) {
      console.error('[tauriIpc] Error writing file:', err);
      throw err;
    }
  } else {
    console.log('[tauriIpc Web Fallback] Writing text file:', filePath, content.slice(0, 100));
    return true;
  }
}

export async function executeGitCommand(repoPath, args) {
  if (isTauriEnvironment()) {
    try {
      return await invoke('run_git_command', { cwd: repoPath, args });
    } catch (err) {
      console.error('[tauriIpc] Git command error:', err);
      throw err;
    }
  } else {
    console.log('[tauriIpc Web Fallback] Executing git:', args.join(' '));
    return { success: true, stdout: 'Git action completed (mock)' };
  }
}
