import { invoke } from "../lib/tauri";

export default function Dashboard({ user, onSignedOut }) {
  async function signOut() {
    await invoke("auth_sign_out");
    onSignedOut();
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-canvas-200 bg-white px-6 py-3 shadow-panel">
        <span className="font-semibold text-canvas-900">Weavr</span>
        <div className="flex items-center gap-3">
          <img
            src={user.avatar_url}
            alt=""
            className="h-7 w-7 rounded-full"
          />
          <span className="text-sm text-canvas-800/70">
            {user.name || user.login}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-canvas-800/50 hover:text-canvas-900"
          >
            Sign out
          </button>
        </div>
      </header>
      <main className="flex flex-1 items-center justify-center px-6 text-center">
        <p className="text-canvas-800/70">Pick a repository to get started.</p>
      </main>
    </div>
  );
}
