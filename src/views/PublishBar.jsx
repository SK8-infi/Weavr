import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";

const TONE = {
  good: { cls: "bg-positive-50 text-positive-700", icon: "check" },
  warn: { cls: "bg-caution-50 text-caution-700", icon: "alert" },
  bad: { cls: "bg-critical-50 text-critical-700", icon: "alert" },
  muted: { cls: "bg-canvas-100 text-canvas-500", icon: "check" },
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
    return () => sub.then((unlisten) => unlisten());
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
  const tone = notice ? TONE[notice.tone] : null;

  return (
    <div className="bg-canvas-50/70 backdrop-blur-2xl backdrop-saturate-150 shrink-0 px-3 py-3 shadow-[0_-1px_2px_rgba(13,15,19,0.04)]">
      {notice && (
        <div
          className={`mb-2.5 flex animate-pop items-start gap-1.5 rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${tone.cls}`}
        >
          <Icon name={tone.icon} className="mt-px h-3 w-3 shrink-0" />
          <span>{notice.text}</span>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] text-canvas-500">
          {count > 0 ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
              {count} unpublished {count === 1 ? "change" : "changes"}
            </>
          ) : (
            <>
              <Icon name="check" className="h-3 w-3 text-positive-600" />
              All published
            </>
          )}
        </span>

        <Button
          variant="primary"
          onClick={publish}
          disabled={count === 0}
          loading={publishing}
        >
          {!publishing && <Icon name="upload" className="h-3.5 w-3.5" />}
          {publishing ? "Publishing" : "Publish"}
        </Button>
      </div>
    </div>
  );
}
