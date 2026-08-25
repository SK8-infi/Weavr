import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
import { SearchInput } from "../components/ui/Field";
import { cn } from "../utils/cn";

/** "src/data/committeeData.js" + "documents" -> "Committee › Documents" */
function listTitle(list) {
  const file = list.file.split("/").pop()?.replace(/(Data)?\.js$/, "") ?? list.file;
  const nice = (s) =>
    s.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
  const where = list.array_path
    ? list.array_path.replace(/\[\d+\]/g, "").split(".").filter(Boolean).map(nice).join(" › ")
    : nice(list.export_name);
  return `${nice(file)}${where ? ` › ${where}` : ""}`;
}

export default function StructurePanel() {
  const [lists, setLists] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(() => {
    invoke("structure_lists")
      .then(setLists)
      .catch((err) => setError(String(err)));
  }, []);

  useEffect(() => {
    reload();
    const sub = listen("weavr://content-changed", reload);
    return () => sub.then((unlisten) => unlisten());
  }, [reload]);

  async function run(command, args) {
    setBusy(true);
    setError("");
    try {
      await invoke(command, args);
      reload();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const visible = useMemo(() => {
    if (!lists) return [];
    const term = search.trim().toLowerCase();
    if (!term) return lists;
    return lists.filter(
      (l) =>
        listTitle(l).toLowerCase().includes(term) ||
        l.items.some((i) => i.toLowerCase().includes(term)),
    );
  }, [lists, search]);

  if (!lists) {
    return (
      <div className="flex flex-col gap-1.5 p-3" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-10 animate-shimmer rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lists"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-canvas-500">
          Add, remove or reorder entries. A new entry starts as a copy of the
          one above it — change its wording on the site afterwards.
        </p>
        {error && (
          <p className="mt-2 rounded-lg bg-critical-50 px-3 py-2 text-[11px] leading-relaxed text-critical-700">
            {error}
          </p>
        )}
      </div>

      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {visible.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-canvas-400">
            Nothing matches that.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {visible.map((list) => (
            <ListGroup
              key={list.id}
              list={list}
              isOpen={openId === list.id}
              busy={busy}
              onToggle={() => setOpenId(openId === list.id ? null : list.id)}
              onRun={run}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ListGroup({ list, isOpen, busy, onToggle, onRun }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl transition-all duration-200",
        isOpen ? "bg-canvas-0/60 backdrop-blur-2xl backdrop-saturate-150 shadow-raised" : "hover:bg-canvas-0/60",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <Icon
          name="chevronRight"
          className={cn(
            "h-3.5 w-3.5 text-canvas-400 transition-transform duration-200",
            isOpen && "rotate-90",
          )}
        />
        <span className="flex-1 truncate text-[13px] font-medium text-canvas-800">
          {listTitle(list)}
        </span>
        <span className="shrink-0 rounded-full bg-canvas-100 px-1.5 py-px text-[10px] text-canvas-500">
          {list.items.length}
        </span>
      </button>

      {isOpen && (
        <ol className="flex animate-fade-up flex-col gap-1 px-3 pb-3">
          {list.items.map((label, index) => (
            <li
              key={index}
              className="flex items-center gap-1 rounded-xl bg-canvas-50 py-1 pl-2.5 pr-1 transition-colors hover:bg-canvas-100"
            >
              <span className="min-w-0 flex-1 truncate text-[11px] text-canvas-700">
                {label || <em className="text-canvas-400">Entry {index + 1}</em>}
              </span>

              <RowButton
                icon="arrowUp"
                title="Move up"
                disabled={busy || index === 0}
                onClick={() =>
                  onRun("structure_move", { listId: list.id, from: index, to: index - 1 })
                }
              />
              <RowButton
                icon="arrowDown"
                title="Move down"
                disabled={busy || index === list.items.length - 1}
                onClick={() =>
                  onRun("structure_move", { listId: list.id, from: index, to: index + 1 })
                }
              />
              <RowButton
                icon="plus"
                title="Add a copy below"
                disabled={busy}
                onClick={() => onRun("structure_duplicate", { listId: list.id, index })}
              />
              <RowButton
                icon="close"
                title="Remove"
                danger
                disabled={busy || list.items.length <= 1}
                onClick={() => onRun("structure_remove", { listId: list.id, index })}
              />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function RowButton({ icon, title, onClick, disabled, danger }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("h-6 w-6", danger && "hover:bg-critical-50 hover:text-critical-600")}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
    </Button>
  );
}
