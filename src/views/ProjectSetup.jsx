import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";

const PHASE = {
  INSTALLING: "installing",
  STARTING_PREVIEW: "starting-preview",
  READY: "ready",
  FAILED: "failed",
};

const STEPS = [
  { id: PHASE.INSTALLING, label: "Preparing your website" },
  { id: PHASE.STARTING_PREVIEW, label: "Opening the preview" },
];

export default function ProjectSetup({ project, onBack, onReady }) {
  const { repo, info } = project;
  const [phase, setPhase] = useState(PHASE.INSTALLING);
  const [log, setLog] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [showLog, setShowLog] = useState(false);
  const logEndRef = useRef(null);

  useEffect(() => {
    let unlisten;
    let cancelled = false;

    listen("install://progress", (event) => {
      if (event.payload.project_path !== info.local_path) return;
      setLog((prev) => [...prev.slice(-300), event.payload.line]);
    }).then((fn) => {
      unlisten = fn;
    });

    invoke("project_install", { projectPath: info.local_path })
      .then(() => {
        if (cancelled) return;
        setPhase(PHASE.STARTING_PREVIEW);
        return invoke("preview_start", { projectPath: info.local_path });
      })
      .then((url) => {
        if (cancelled || !url) return;
        setPhase(PHASE.READY);
        onReady(url);
      })
      .catch((err) => {
        if (cancelled) return;
        setPhase(PHASE.FAILED);
        setErrorMessage(String(err));
        setShowLog(true);
      });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [info.local_path]);

  useEffect(() => {
    if (showLog) logEndRef.current?.scrollIntoView({ block: "end" });
  }, [log, showLog]);

  const failed = phase === PHASE.FAILED;
  const activeIndex = STEPS.findIndex((s) => s.id === phase);

  return (
    <div className="animate-fade-up rounded-2xl bg-canvas-0 p-6 shadow-raised">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
          onBack();
        }}
        className="-ml-2 mb-3"
      >
        ← Back
      </Button>

      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-canvas-900">
        {repo.name}
      </h2>
      <p className="mt-1 text-[12px] text-canvas-400">
        This takes a few minutes the first time only.
      </p>

      <ol className="mt-5 flex flex-col gap-2.5">
        {STEPS.map((step, index) => {
          const done = !failed && activeIndex > index;
          const active = !failed && activeIndex === index;
          return (
            <li key={step.id} className="flex items-center gap-2.5">
              <StepDot done={done} active={active} failed={failed && activeIndex === index} />
              <span
                className={
                  done
                    ? "text-[13px] text-canvas-400"
                    : active
                      ? "text-[13px] font-medium text-canvas-900"
                      : "text-[13px] text-canvas-400"
                }
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <p className="mt-5 rounded-xl bg-critical-50 px-4 py-3 text-[12px] leading-relaxed text-critical-700">
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowLog((v) => !v)}
        className="mt-4 text-[11px] text-canvas-400 transition-colors hover:text-canvas-700"
      >
        {showLog ? "Hide details" : "Show details"}
      </button>

      {showLog && (
        <pre className="mt-2 max-h-56 overflow-y-auto rounded-xl bg-canvas-950 p-3.5 font-mono text-[11px] leading-relaxed text-canvas-300">
          {log.length === 0 ? "Starting…" : log.join("\n")}
          <span ref={logEndRef} />
        </pre>
      )}
    </div>
  );
}

function StepDot({ done, active, failed }) {
  if (failed) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-critical-600 text-[10px] font-bold text-white">
        !
      </span>
    );
  }
  if (done) {
    return (
      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-positive-600 text-[9px] font-bold text-white">
        ✓
      </span>
    );
  }
  if (active) {
    return (
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-[1.5px] border-brand-500 border-t-transparent" />
    );
  }
  return <span className="h-4 w-4 shrink-0 rounded-full bg-canvas-200" />;
}
