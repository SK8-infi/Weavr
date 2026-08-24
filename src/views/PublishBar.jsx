import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";

export default function PublishBar() {
  const [pending, setPending] = useState([]);
  const [state, setState] = useState("idle");
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(() => {
    invoke("publish_pending")
      .then((result) => setPending(result.files))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const pendingListen = listen("weavr://content-changed", refresh);
    return () => {
      pendingListen.then((unlisten) => unlisten());
    };
  }, [refresh]);

  async function publish() {
    setState("publishing");
    setNotice(null);
    try {
      const outcome = await invoke("publish_now");
      setState("idle");
      refresh();

      if (outcome.status === "published") {
        setNotice({
          tone: "good",
          text: `Published. Your site will update in a minute or two.`,
        });
      } else if (outcome.status === "nothing_to_do") {
        setNotice({ tone: "muted", text: "Nothing new to publish." });
      } else if (outcome.status === "remote_diverged") {
        setNotice({ tone: "warn", text: outcome.message });
      }
    } catch (err) {
      setState("idle");
      setNotice({ tone: "bad", text: String(err) });
    }
  }

  const hasChanges = pending.length > 0;

  const toneClass = {
    good: "text-green-700",
    warn: "text-amber-700",
    bad: "text-red-600",
    muted: "text-canvas-800/50",
  };

  return (
    <div className="border-t border-canvas-200 bg-white px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-canvas-800/60">
          {hasChanges
            ? `${pending.length} ${pending.length === 1 ? "section" : "sections"} changed`
            : "No unpublished changes"}
        </span>
        <button
          type="button"
          onClick={publish}
          disabled={!hasChanges || state === "publishing"}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-panel transition hover:bg-brand-700 disabled:opacity-40"
        >
          {state === "publishing" ? "Publishing…" : "Publish to my site"}
        </button>
      </div>

      {notice && (
        <p className={`mt-2 text-xs ${toneClass[notice.tone]}`}>{notice.text}</p>
      )}
    </div>
  );
}
