import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import { cn } from "../utils/cn";

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
    <div className="animate-pop rounded-2xl bg-canvas-0/60 backdrop-blur-2xl backdrop-saturate-150 p-6 shadow-float">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          invoke("preview_stop", { projectPath: info.local_path }).catch(() => {});
          onBack();
        }}
        className="-ml-2 mb-4"
      >
        <Icon name="back" className="h-3.5 w-3.5" />
        Back
      </Button>

      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-400">
          <Icon name="sparkle" className="h-5 w-5" />
        </span>
        <span>
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-canvas-900">
            {repo.name}
          </h2>
          <p className="text-[12px] text-canvas-400">
            Setting things up — only takes a while the first time.
          </p>
        </span>
      </div>

      <ol className="mt-6 flex flex-col gap-3">
        {STEPS.map((step, index) => {
          const done = !failed && activeIndex > index;
          const active = !failed && activeIndex === index;
          return (
            <li key={step.id} className="flex items-center gap-2.5">
              <StepDot
                done={done}
                active={active}
                failed={failed && activeIndex === index}
              />
              <span
                className={cn(
                  "text-[13px] transition-colors",
                  active
                    ? "font-medium text-canvas-900"
                    : done
                      ? "text-canvas-400"
                      : "text-canvas-400",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {failed && (
        <div className="mt-5 flex items-start gap-2 rounded-xl bg-critical-50 px-4 py-3">
          <Icon name="alert" className="mt-px h-3.5 w-3.5 text-critical-600" />
          <p className="text-[12px] leading-relaxed text-critical-700">
            {errorMessage}
          </p>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShowLog((v) => !v)}
        className="mt-5 flex items-center gap-1 text-[11px] text-canvas-400 transition-colors hover:text-canvas-700"
      >
        <Icon
          name="chevronRight"
          className={cn("h-3 w-3 transition-transform", showLog && "rotate-90")}
        />
        {showLog ? "Hide details" : "Show details"}
      </button>

      {showLog && (
        <pre className="mt-2 max-h-56 animate-fade-up overflow-y-auto rounded-xl bg-canvas-950 p-3.5 font-mono text-[11px] leading-relaxed text-canvas-300">
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
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-critical-600 text-white">
        <Icon name="close" className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  }
  if (done) {
    return (
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-positive-600 text-white">
        <Icon name="check" className="h-3 w-3" strokeWidth={2.5} />
      </span>
    );
  }
  if (active) {
    return (
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <span className="absolute inset-0 animate-pulse-soft rounded-full bg-brand-200/50" />
        <span className="relative h-4 w-4 animate-spin rounded-full border-[1.5px] border-brand-500 border-t-transparent" />
      </span>
    );
  }
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-canvas-200" />
    </span>
  );
}
