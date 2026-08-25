import { useEffect, useMemo, useState } from "react";
import { invoke } from "../lib/tauri";
import ProjectSetup from "./ProjectSetup";
import EditorView from "./EditorView";
import Button from "../components/ui/Button";
import WeavrMark from "../components/ui/WeavrMark";
import { cn } from "../utils/cn";

export default function Dashboard({ user, onSignedOut }) {
  const [repos, setRepos] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [cloningId, setCloningId] = useState(null);
  const [project, setProject] = useState(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    invoke("repo_list")
      .then(setRepos)
      .catch((err) => setLoadError(String(err)));
  }, []);

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

  const filtered = useMemo(() => {
    if (!repos) return null;
    const term = search.trim().toLowerCase();
    if (!term) return repos;
    return repos.filter((r) => r.full_name.toLowerCase().includes(term));
  }, [repos, search]);

  // Once the preview is docked, this webview becomes the editing panel.
  if (project?.info.is_valid && previewUrl) {
    return <EditorView project={project} onBack={closeProject} />;
  }

  return (
    <div className="flex h-full flex-col bg-canvas-50">
      <TitleBar user={user} onSignedOut={onSignedOut} />

      <main className="mx-auto w-full max-w-lg flex-1 overflow-y-auto px-8 py-10">
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
          <div className="animate-fade-up">
            <h1 className="text-[19px] font-semibold tracking-[-0.01em] text-canvas-900">
              Choose a website
            </h1>
            <p className="mt-1 text-[13px] text-canvas-500">
              Pick the repository holding your conference site.
            </p>

            {repos && repos.length > 6 && (
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search repositories"
                className="mt-5 w-full rounded-lg bg-canvas-0 px-3 py-2 text-[13px] shadow-panel outline-none transition placeholder:text-canvas-400 focus:shadow-[0_0_0_1px_var(--color-brand-500),0_0_0_4px_var(--color-brand-100)]"
              />
            )}

            {loadError && (
              <p className="mt-5 rounded-xl bg-critical-50 px-4 py-3 text-[12px] leading-relaxed text-critical-700">
                {loadError}
              </p>
            )}

            {!repos && !loadError && <RepoSkeleton />}

            {filtered?.length === 0 && (
              <p className="mt-6 text-[13px] text-canvas-400">
                {search ? "No repositories match that." : "No repositories found."}
              </p>
            )}

            <ul className="mt-5 flex flex-col gap-1.5">
              {filtered?.map((repo) => (
                <li key={repo.id}>
                  <RepoRow
                    repo={repo}
                    busy={cloningId === repo.id}
                    disabled={cloningId !== null}
                    onSelect={() => selectRepo(repo)}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}

function TitleBar({ user, onSignedOut }) {
  async function signOut() {
    await invoke("auth_sign_out");
    onSignedOut();
  }

  return (
    <header className="flex shrink-0 items-center justify-between border-b border-canvas-200/70 bg-canvas-0/80 px-4 py-2.5 backdrop-blur">
      <span className="flex items-center gap-2">
        <WeavrMark className="h-5 w-5" />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-canvas-900">
          Weavr
        </span>
      </span>

      <span className="flex items-center gap-2.5">
        <img
          src={user.avatar_url}
          alt=""
          className="h-6 w-6 rounded-full ring-1 ring-canvas-200"
        />
        <span className="max-w-[140px] truncate text-[12px] text-canvas-500">
          {user.name || user.login}
        </span>
        <Button variant="ghost" size="sm" onClick={signOut}>
          Sign out
        </Button>
      </span>
    </header>
  );
}

function RepoRow({ repo, busy, disabled, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className={cn(
        "group flex w-full items-center gap-3 rounded-xl bg-canvas-0 px-3.5 py-3 text-left",
        "shadow-panel transition-all duration-150 ease-out",
        "hover:shadow-raised active:scale-[0.995]",
        disabled && !busy && "pointer-events-none opacity-40",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[13px] font-medium text-canvas-900">
            {repo.name}
          </span>
          {repo.private && (
            <span className="shrink-0 rounded bg-canvas-100 px-1.5 py-px text-[10px] text-canvas-500">
              Private
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-canvas-400">
          {repo.owner.login}
        </span>
      </span>

      <span className="shrink-0 text-[11px] text-canvas-400">
        {busy ? (
          <span className="flex items-center gap-1.5 text-brand-600">
            <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
            Opening
          </span>
        ) : (
          <span className="opacity-0 transition-opacity group-hover:opacity-100">
            Open →
          </span>
        )}
      </span>
    </button>
  );
}

function RepoSkeleton() {
  return (
    <ul className="mt-5 flex flex-col gap-1.5" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="h-[58px] animate-shimmer rounded-xl"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </ul>
  );
}

function InvalidProject({ project, onBack }) {
  const { repo, info } = project;
  return (
    <div className="animate-fade-up rounded-2xl bg-canvas-0 p-6 shadow-raised">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3">
        ← Back
      </Button>

      <h2 className="text-[15px] font-semibold text-canvas-900">
        {repo.full_name}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-canvas-600">
        Weavr couldn't recognise this as a conference site, so it can't be
        edited safely. These are missing:
      </p>

      <ul className="mt-3 flex flex-col gap-1">
        {info.missing.map((item) => (
          <li
            key={item}
            className="rounded-lg bg-caution-50 px-3 py-2 font-mono text-[11px] text-caution-700"
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
