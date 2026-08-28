import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";

const POLL_MS = 30000;

/**
 * Shows how this copy stands against the shared repository, and pulls in what
 * others have published.
 *
 * Several people edit the same site from their own machines, so a copy drifts
 * behind as soon as a colleague publishes. Surfacing that continuously means
 * they find out while it's cheap to act on, rather than at the moment their
 * own publish is refused.
 */
export default function SyncBar() {
  const [status, setStatus] = useState(null);
  const [pulling, setPulling] = useState(false);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(() => {
    invoke("sync_status")
      .then(setStatus)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, POLL_MS);
    // Publishing changes where this copy stands, so re-check straight after.
    const sub = listen("weavr://content-changed", refresh);
    return () => {
      clearInterval(timer);
      sub.then((unlisten) => unlisten());
    };
  }, [refresh]);

  async function pull() {
    setPulling(true);
    setNotice(null);
    try {
      const outcome = await invoke("sync_pull");
      if (outcome.status === "updated") {
        setNotice({
          tone: "good",
          text: `Updated — ${outcome.commits} ${outcome.commits === 1 ? "change" : "changes"} from your team.`,
        });
      } else if (outcome.status === "already_up_to_date") {
        setNotice({ tone: "muted", text: "Already up to date." });
      } else {
        setNotice({ tone: "warn", text: outcome.message });
      }
      refresh();
    } catch (err) {
      setNotice({ tone: "bad", text: String(err) });
    } finally {
      setPulling(false);
    }
  }

  const behind = status?.behind ?? 0;

  return (
    <div className="shrink-0 px-3 pt-3">
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-canvas-500">
          {behind > 0 ? (
            <>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-caution-600" />
              <span className="truncate">
                {behind} {behind === 1 ? "update" : "updates"} from your team
              </span>
            </>
          ) : (
            <>
              <Icon name="check" className="h-3 w-3 shrink-0 text-positive-600" />
              <span className="truncate">Up to date with your team</span>
            </>
          )}
        </span>

        <Button
          variant={behind > 0 ? "primary" : "secondary"}
          size="sm"
          onClick={pull}
          loading={pulling}
          title="Fetch the latest version from GitHub"
        >
          {!pulling && <Icon name="download" className="h-3 w-3" />}
          {pulling ? "Getting" : "Get latest"}
        </Button>
      </div>

      {notice && (
        <p
          className={`mt-2 animate-pop rounded-lg px-2.5 py-2 text-[11px] leading-relaxed ${
            {
              good: "bg-positive-50 text-positive-700",
              warn: "bg-caution-50 text-caution-700",
              bad: "bg-critical-50 text-critical-700",
              muted: "bg-canvas-100 text-canvas-500",
            }[notice.tone]
          }`}
        >
          {notice.text}
        </p>
      )}
    </div>
  );
}
