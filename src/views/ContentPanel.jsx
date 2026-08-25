import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import { fieldClasses, FieldLabel, SearchInput } from "../components/ui/Field";
import Icon from "../components/ui/Icon";
import { cn } from "../utils/cn";

/** "src/data/committeeData.js" -> "Committee" */
function friendlyFileName(file) {
  const base = file.split("/").pop()?.replace(/\.js$/, "") ?? file;
  const spaced = base.replace(/Data$/, "").replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "documents[0].title" -> "Documents 1 › Title" */
function friendlyPath(jsonPath) {
  if (!jsonPath) return "Value";
  return jsonPath
    .replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`)
    .split(".")
    .map((part) => {
      const words = part.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
      return words.charAt(0).toUpperCase() + words.slice(1);
    })
    .join(" › ");
}

export default function ContentPanel({ projectPath }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openFile, setOpenFile] = useState(null);

  async function reload() {
    try {
      setSummary(await invoke("content_load", { projectPath }));
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    reload();
    // An in-place edit changes the same data these forms show, so pull the new
    // values in rather than letting the panel drift out of date.
    const subs = [
      listen("weavr://content-changed", reload),
      listen("weavr://edit-failed", (e) => setError(String(e.payload))),
    ];
    return () => subs.forEach((s) => s.then((unlisten) => unlisten()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const groups = useMemo(() => {
    if (!summary) return [];
    const term = search.trim().toLowerCase();
    if (!term) return summary.groups;
    return summary.groups
      .map((group) => ({
        ...group,
        fields: group.fields.filter(
          (f) =>
            f.value.toLowerCase().includes(term) ||
            f.json_path.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  }, [summary, search]);

  if (!summary) {
    return (
      <div className="p-4">
        {error ? (
          <p className="rounded-xl bg-critical-50 px-4 py-3 text-[12px] text-critical-700">
            {error}
          </p>
        ) : (
          <div className="flex flex-col gap-1.5" aria-hidden="true">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 animate-shimmer rounded-lg" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const searching = Boolean(search.trim());

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 px-3 pt-3">
        <SearchInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all text on your site"
        />
        {error && (
          <p className="mt-2 rounded-lg bg-critical-50 px-3 py-2 text-[11px] leading-relaxed text-critical-700">
            {error}
          </p>
        )}
      </div>


      <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {groups.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-canvas-400">
            Nothing matches that.
          </p>
        )}

        <div className="flex flex-col gap-1">
          {groups.map((group) => (
            <FileGroup
              key={group.file}
              group={group}
              isOpen={openFile === group.file || searching}
              onToggle={() =>
                setOpenFile(openFile === group.file ? null : group.file)
              }
              onSaved={reload}
              onError={setError}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FileGroup({ group, isOpen, onToggle, onSaved, onError }) {
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
          {friendlyFileName(group.file)}
        </span>
        <span className="shrink-0 rounded-full bg-canvas-100 px-1.5 py-px text-[10px] text-canvas-500">
          {group.fields.length}
        </span>
      </button>

      {isOpen && (
        <div className="flex animate-fade-up flex-col gap-3 px-3 pb-3.5">
          {group.fields.map((field) => (
            <FieldEditor
              key={field.id}
              field={field}
              onSaved={onSaved}
              onError={onError}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function FieldEditor({ field, onSaved, onError }) {
  const [draft, setDraft] = useState(field.value);
  const [busy, setBusy] = useState(false);

  // A click-to-edit change on the site updates this same field, so follow the
  // incoming value unless the user is mid-edit.
  useEffect(() => {
    if (!busy) setDraft(field.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value]);

  const isDirty = draft !== field.value;
  const isLong = field.value.length > 70;

  async function save() {
    if (!isDirty) return;
    setBusy(true);
    try {
      await invoke("content_update", { fieldId: field.id, newValue: draft });
      onSaved();
    } catch (err) {
      setDraft(field.value);
      onError(String(err));
    } finally {
      setBusy(false);
    }
  }

  const Tag = isLong ? "textarea" : "input";

  return (
    <label className="flex flex-col gap-1">
      <FieldLabel hint={isDirty ? "Unsaved" : undefined}>
        {friendlyPath(field.json_path)}
      </FieldLabel>
      <Tag
        value={draft}
        rows={isLong ? 3 : undefined}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isLong) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") setDraft(field.value);
        }}
        className={fieldClasses(isDirty, busy)}
      />
    </label>
  );
}
