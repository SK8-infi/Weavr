import { useEffect, useMemo, useState } from "react";
import { invoke } from "../lib/tauri";
import ProjectSetup from "./ProjectSetup";
import EditorView from "./EditorView";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import WeavrMark from "../components/ui/WeavrMark";
import { SearchInput } from "../components/ui/Field";
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
    <div className="flex h-full flex-col">
      <TitleBar user={user} onSignedOut={onSignedOut} />

      <main className="mx-auto w-full max-w-xl flex-1 overflow-y-auto px-8 py-10">
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
            <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-canvas-900">
              Your websites
            </h1>
            <p className="mt-1 text-[13px] text-canvas-500">
              Pick the repository holding your conference site.
            </p>

            {repos && repos.length > 6 && (
              <div className="mt-5">
                <SearchInput
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search repositories"
                />
              </div>
            )}

            {loadError && (
              <div className="mt-5 flex items-start gap-2 rounded-xl bg-critical-50 px-4 py-3">
                <Icon name="alert" className="mt-px h-3.5 w-3.5 text-critical-600" />
                <p className="text-[12px] leading-relaxed text-critical-700">
                  {loadError}
                </p>
              </div>
            )}

            {!repos && !loadError && <RepoSkeleton />}

            {filtered?.length === 0 && (
              <p className="mt-8 text-center text-[13px] text-canvas-400">
                {search ? "No repositories match that." : "No repositories found."}
              </p>
            )}

            <ul className="mt-5 flex flex-col gap-2">
              {filtered?.map((repo, index) => (
                <li
                  key={repo.id}
                  className="animate-fade-up"
                  style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
                >
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
    <header className="bg-canvas-0/70 backdrop-blur-xl sticky top-0 z-10 flex shrink-0 items-center justify-between px-4 py-2.5 shadow-panel">
      <span className="flex items-center gap-2">
        <WeavrMark className="h-[22px] w-[22px]" />
        <span className="text-[13px] font-semibold tracking-[-0.01em] text-canvas-900">
          Weavr
        </span>
      </span>

      <span className="flex items-center gap-2">
        <img
          src={user.avatar_url}
          alt=""
          className="h-6 w-6 rounded-full ring-1 ring-canvas-300"
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
        "group flex w-full items-center gap-3 rounded-2xl bg-canvas-0 px-3.5 py-3 text-left",
        "shadow-panel transition-all duration-200 ease-[var(--ease-out-soft)]",
        "hover:-translate-y-px hover:shadow-float",
        "active:translate-y-0 active:scale-[0.995]",
        disabled && !busy && "pointer-events-none opacity-40",
      )}
    >
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors duration-200",
          "bg-canvas-100 text-canvas-500",
          "group-hover:bg-brand-50 group-hover:text-brand-600",
        )}
      >
        <Icon name={repo.private ? "lock" : "folder"} className="h-4 w-4" />
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-canvas-900">
          {repo.name}
        </span>
        <span className="mt-0.5 block truncate text-[11px] text-canvas-400">
          {repo.owner.login}
          {repo.private && " · Private"}
        </span>
      </span>

      {busy ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-brand-600">
          <span className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
          Opening
        </span>
      ) : (
        <Icon
          name="chevronRight"
          className="shrink-0 text-canvas-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand-500"
        />
      )}
    </button>
  );
}

function RepoSkeleton() {
  return (
    <ul className="mt-5 flex flex-col gap-2" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-2xl bg-canvas-0 px-3.5 py-3 shadow-panel"
        >
          <span className="h-9 w-9 shrink-0 animate-shimmer rounded-xl" />
          <span className="flex-1">
            <span
              className="block h-3 animate-shimmer rounded"
              style={{ width: `${52 - i * 6}%` }}
            />
            <span className="mt-2 block h-2.5 w-1/4 animate-shimmer rounded" />
          </span>
        </li>
      ))}
    </ul>
  );
}

function InvalidProject({ project, onBack }) {
  const { repo, info } = project;
  return (
    <div className="animate-pop rounded-2xl bg-canvas-0 p-6 shadow-float">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2 mb-3">
        <Icon name="back" className="h-3.5 w-3.5" />
        Back
      </Button>

      <h2 className="text-[15px] font-semibold text-canvas-900">
        {repo.full_name}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-canvas-600">
        Weavr couldn't recognise this as a conference site, so it can't be
        edited safely. These are missing:
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {info.missing.map((item) => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-lg bg-caution-50 px-3 py-2 font-mono text-[11px] text-caution-700"
          >
            <Icon name="alert" className="h-3 w-3 shrink-0" />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
