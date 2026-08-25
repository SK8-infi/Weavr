import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";

const TONE = {
  good: "bg-positive-50 text-positive-700",
  warn: "bg-caution-50 text-caution-700",
  bad: "bg-critical-50 text-critical-700",
  muted: "bg-canvas-100 text-canvas-500",
};

export default function PublishBar() {
  const [pending, setPending] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(() => {
    invoke("publish_pending")
      .then((result) => setPending(result.files))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const sub = listen("weavr://content-changed", () => {
      refresh();
      // A fresh edit makes an older outcome message misleading.
      setNotice(null);
    });
    return () => {
      sub.then((unlisten) => unlisten());
    };
  }, [refresh]);

  async function publish() {
    setPublishing(true);
    setNotice(null);
    try {
      const outcome = await invoke("publish_now");
      refresh();
      if (outcome.status === "published") {
        setNotice({
          tone: "good",
          text: "Published. Your site updates in a minute or two.",
        });
      } else if (outcome.status === "nothing_to_do") {
        setNotice({ tone: "muted", text: "Nothing new to publish." });
      } else if (outcome.status === "remote_diverged") {
        setNotice({ tone: "warn", text: outcome.message });
      }
    } catch (err) {
      setNotice({ tone: "bad", text: String(err) });
    } finally {
      setPublishing(false);
    }
  }

  const count = pending.length;

  return (
    <div className="shrink-0 border-t border-canvas-200/70 bg-canvas-0/80 px-4 py-3 backdrop-blur">
      {notice && (
        <p
          className={`mb-2.5 animate-fade-up rounded-lg px-3 py-2 text-[11px] leading-relaxed ${TONE[notice.tone]}`}
        >
          {notice.text}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] text-canvas-500">
          {count > 0 && (
            <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
          )}
          {count > 0
            ? `${count} unpublished ${count === 1 ? "change" : "changes"}`
            : "Everything published"}
        </span>

        <Button
          variant="primary"
          onClick={publish}
          disabled={count === 0}
          loading={publishing}
        >
          {publishing ? "Publishing" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
