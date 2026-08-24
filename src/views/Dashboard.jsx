import { useEffect, useState } from "react";
import { invoke } from "../lib/tauri";
import ProjectSetup from "./ProjectSetup";
import EditorView from "./EditorView";

export default function Dashboard({ user, onSignedOut }) {
  const [repos, setRepos] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [cloningId, setCloningId] = useState(null);
  const [project, setProject] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");

  useEffect(() => {
    invoke("repo_list")
      .then(setRepos)
      .catch((err) => setLoadError(String(err)));
  }, []);

  async function signOut() {
    await invoke("auth_sign_out");
    onSignedOut();
  }

  function closeProject() {
    setProject(null);
    setPreviewUrl("");
  }

  async function selectRepo(repo) {
    setCloningId(repo.id);
    setProject(null);
    setPreviewUrl("");
    setLoadError("");
    try {
      const info = await invoke("repo_clone", { repo });
      setProject({ repo, info });
    } catch (err) {
      setLoadError(String(err));
    } finally {
      setCloningId(null);
    }
  }

  // Once the preview is up, the editor takes over the whole window.
  if (project?.info.is_valid && previewUrl) {
    return (
      <EditorView project={project} previewUrl={previewUrl} onBack={closeProject} />
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-canvas-200 bg-white px-6 py-3 shadow-panel">
        <span className="font-semibold text-canvas-900">Weavr</span>
        <div className="flex items-center gap-3">
          <img src={user.avatar_url} alt="" className="h-7 w-7 rounded-full" />
          <span className="text-sm text-canvas-800/70">{user.name || user.login}</span>
          <button
            type="button"
            onClick={signOut}
            className="text-sm text-canvas-800/50 hover:text-canvas-900"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        {project ? (
          project.info.is_valid ? (
            <ProjectSetup
              project={project}
              onBack={closeProject}
              onReady={setPreviewUrl}
            />
          ) : (
            <InvalidProject project={project} onBack={closeProject} />
          )
        ) : (
          <>
            <h1 className="mb-1 text-lg font-semibold text-canvas-900">Your repositories</h1>
            <p className="mb-6 text-sm text-canvas-800/60">
              Pick the conference site you want to edit.
            </p>

            {loadError && <p className="mb-4 text-sm text-red-600">{loadError}</p>}

            {!repos && !loadError && (
              <p className="text-sm text-canvas-800/50">Loading your repositories…</p>
            )}

            {repos && repos.length === 0 && (
              <p className="text-sm text-canvas-800/50">No repositories found.</p>
            )}

            <ul className="flex flex-col gap-2">
              {repos?.map((repo) => (
                <li key={repo.id}>
                  <button
                    type="button"
                    onClick={() => selectRepo(repo)}
                    disabled={cloningId !== null}
                    className="flex w-full items-center justify-between rounded-lg border border-canvas-200 bg-white px-4 py-3 text-left shadow-panel transition hover:border-brand-500 disabled:opacity-50"
                  >
                    <span>
                      <span className="font-medium text-canvas-900">{repo.full_name}</span>
                      {repo.private && (
                        <span className="ml-2 rounded bg-canvas-100 px-1.5 py-0.5 text-xs text-canvas-800/60">
                          private
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-canvas-800/50">
                      {cloningId === repo.id ? "Cloning…" : "Select"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </main>
    </div>
  );
}

function InvalidProject({ project, onBack }) {
  const { repo, info } = project;
  return (
    <div className="rounded-xl border border-canvas-200 bg-white p-6 shadow-panel">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 text-sm text-canvas-800/50 hover:text-canvas-900"
      >
        ← Back to repositories
      </button>
      <h2 className="mb-1 text-lg font-semibold text-canvas-900">{repo.full_name}</h2>
      <p className="mb-4 text-xs text-canvas-800/50">{info.local_path}</p>

      <div className="text-sm text-amber-700">
        <p className="mb-2">
          This repo doesn't match the expected structure yet, so Weavr can't edit it:
        </p>
        <ul className="list-inside list-disc">
          {info.missing.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
