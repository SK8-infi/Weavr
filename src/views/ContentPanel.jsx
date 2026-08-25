import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import { fieldClasses, FieldLabel } from "../components/ui/Field";
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
  const [choice, setChoice] = useState(null);

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
      // Clicking text on the site that several fields could have produced.
      listen("weavr://choose-field", (e) => setChoice(e.payload)),
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
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all text on your site"
          className="w-full rounded-lg bg-canvas-0 px-3 py-2 text-[13px] shadow-panel outline-none transition placeholder:text-canvas-400 focus:shadow-[0_0_0_1px_var(--color-brand-500),0_0_0_4px_var(--color-brand-100)]"
        />
        {error && (
          <p className="mt-2 rounded-lg bg-critical-50 px-3 py-2 text-[11px] leading-relaxed text-critical-700">
            {error}
          </p>
        )}
      </div>

      {choice && (
        <FieldChooser
          choice={choice}
          groups={summary.groups}
          onDismiss={() => setChoice(null)}
          onSaved={() => {
            setChoice(null);
            reload();
          }}
          onError={setError}
        />
      )}

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

/**
 * Shown when text clicked on the site is backed by more than one field.
 *
 * The alternative would be picking one and hoping — which quietly rewrites an
 * unrelated part of the site when it guesses wrong. Asking costs one click and
 * is always correct.
 */
function FieldChooser({ choice, groups, onDismiss, onSaved, onError }) {
  const [savingId, setSavingId] = useState(null);

  const options = useMemo(() => {
    const wanted = new Set(choice.fieldIds || []);
    return groups
      .flatMap((g) => g.fields)
      .filter((f) => wanted.has(f.id));
  }, [choice, groups]);

  async function choose(field) {
    const next = window.prompt(`New text for ${friendlyPath(field.json_path)}`, field.value);
    if (next === null || next === field.value) return;
    setSavingId(field.id);
    try {
      await invoke("content_update", { fieldId: field.id, newValue: next });
      onSaved();
    } catch (err) {
      onError(String(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-3 mt-2 animate-fade-up rounded-xl bg-caution-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] leading-relaxed text-caution-700">
          “{choice.text}” appears in {options.length} places. Which one did you
          mean?
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-[11px] text-caution-700/60 hover:text-caution-700"
        >
          ✕
        </button>
      </div>

      <div className="mt-2 flex flex-col gap-1">
        {options.map((field) => (
          <button
            key={field.id}
            type="button"
            disabled={savingId !== null}
            onClick={() => choose(field)}
            className="rounded-lg bg-canvas-0 px-2.5 py-1.5 text-left text-[11px] text-canvas-700 shadow-panel transition hover:bg-canvas-50 disabled:opacity-50"
          >
            <span className="block truncate font-medium">
              {friendlyFileName(field.file)}
            </span>
            <span className="block truncate text-canvas-400">
              {friendlyPath(field.json_path)}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function FileGroup({ group, isOpen, onToggle, onSaved, onError }) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl transition-colors",
        isOpen ? "bg-canvas-0 shadow-panel" : "hover:bg-canvas-100",
      )}
    >
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span
          className={cn(
            "text-[10px] text-canvas-400 transition-transform duration-200",
            isOpen && "rotate-90",
          )}
        >
          ▶
        </span>
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
