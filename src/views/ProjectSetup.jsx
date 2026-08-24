import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";

const PHASE = {
  INSTALLING: "installing",
  READY: "ready",
  FAILED: "failed",
};

export default function ProjectSetup({ project, onBack }) {
  const { repo, info } = project;
  const [phase, setPhase] = useState(PHASE.INSTALLING);
  const [log, setLog] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const logEndRef = useRef(null);

  useEffect(() => {
    let unlisten;
    let cancelled = false;

    listen("install://progress", (event) => {
      if (event.payload.project_path !== info.local_path) return;
      setLog((prev) => [...prev.slice(-200), event.payload.line]);
    }).then((fn) => {
      unlisten = fn;
    });

    invoke("project_install", { projectPath: info.local_path })
      .then(() => {
        if (!cancelled) setPhase(PHASE.READY);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase(PHASE.FAILED);
        setErrorMessage(String(err));
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [info.local_path]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log]);

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

      {phase === PHASE.INSTALLING && (
        <p className="mb-4 text-sm text-canvas-800/60">
          Setting up your website — this only takes a while the first time.
        </p>
      )}
      {phase === PHASE.READY && (
        <p className="mb-4 text-sm text-green-700">
          Setup complete. Live preview is next.
        </p>
      )}
      {phase === PHASE.FAILED && (
        <p className="mb-4 text-sm text-red-600">{errorMessage}</p>
      )}

      <pre className="max-h-64 overflow-y-auto rounded-lg bg-canvas-950 p-4 text-xs leading-relaxed text-canvas-100">
        {log.length === 0 ? "Starting…" : log.join("\n")}
        <span ref={logEndRef} />
      </pre>
    </div>
  );
}
