import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "../lib/tauri";
import { cn } from "../utils/cn";

/** "src/data/committeeData.js" -> "Committee" */
function friendlyFileName(file) {
  const base = file.split("/").pop()?.replace(/\.js$/, "") ?? file;
  const withoutSuffix = base.replace(/Data$/, "");
  const spaced = withoutSuffix.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** "documents[0].title" -> "Documents 1 › title" */
function friendlyPath(jsonPath) {
  if (!jsonPath) return "value";
  return jsonPath
    .replace(/\[(\d+)\]/g, (_, i) => ` ${Number(i) + 1}`)
    .split(".")
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, "$1 $2"))
    .join(" › ");
}

export default function ContentPanel({ projectPath }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [openFile, setOpenFile] = useState(null);

  async function reload() {
    try {
      const next = await invoke("content_load", { projectPath });
      setSummary(next);
      setError("");
    } catch (err) {
      setError(String(err));
    }
  }

  useEffect(() => {
    reload();

    // An in-place edit on the preview changes the same data the forms show,
    // so pull the new values in rather than letting the panel drift.
    const pending = [
      listen("weavr://content-changed", reload),
      listen("weavr://edit-failed", (event) => setError(String(event.payload))),
    ];
    return () => {
      pending.forEach((p) => p.then((unlisten) => unlisten()));
    };
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
          (field) =>
            field.value.toLowerCase().includes(term) ||
            field.json_path.toLowerCase().includes(term),
        ),
      }))
      .filter((group) => group.fields.length > 0);
  }, [summary, search]);

  if (error && !summary) {
    return <p className="p-6 text-sm text-red-600">{error}</p>;
  }

  if (!summary) {
    return <p className="p-6 text-sm text-canvas-800/50">Reading your site's content…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-canvas-200 px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search all text on your site…"
          className="w-full rounded-lg border border-canvas-200 px-3 py-2 text-sm outline-none focus:border-brand-500"
        />
        <p className="mt-2 text-xs text-canvas-800/50">
          {summary.clickable_count} items can be edited by clicking them in the preview.
          {summary.forms_only_count > 0 &&
            ` ${summary.forms_only_count} repeat elsewhere on the site, so edit those here.`}
        </p>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
      </div>

      <div className="flex-1 overflow-y-auto">
        {groups.length === 0 && (
          <p className="p-4 text-sm text-canvas-800/50">Nothing matches that search.</p>
        )}
        {groups.map((group) => (
          <FileGroup
            key={group.file}
            group={group}
            isOpen={openFile === group.file || Boolean(search.trim())}
            onToggle={() => setOpenFile(openFile === group.file ? null : group.file)}
            onSaved={reload}
            onError={setError}
          />
        ))}
      </div>
    </div>
  );
}

function FileGroup({ group, isOpen, onToggle, onSaved, onError }) {
  return (
    <section className="border-b border-canvas-200">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-canvas-100"
      >
        <span className="text-sm font-medium text-canvas-900">
          {friendlyFileName(group.file)}
        </span>
        <span className="text-xs text-canvas-800/40">{group.fields.length}</span>
      </button>

      {isOpen && (
        <div className="flex flex-col gap-3 bg-canvas-50 px-4 pb-4">
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
  const [status, setStatus] = useState("idle");

  // A click-to-edit change on the preview updates this same field, so track
  // the incoming value unless the user is mid-edit.
  useEffect(() => {
    if (status === "idle") setDraft(field.value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.value]);

  const isDirty = draft !== field.value;
  const isLong = field.value.length > 80;

  async function save() {
    if (!isDirty) return;
    setStatus("saving");
    try {
      await invoke("content_update", { fieldId: field.id, newValue: draft });
      setStatus("idle");
      onSaved();
    } catch (err) {
      setStatus("idle");
      setDraft(field.value);
      onError(String(err));
    }
  }

  const InputTag = isLong ? "textarea" : "input";

  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-canvas-800/50">{friendlyPath(field.json_path)}</span>
      <InputTag
        value={draft}
        rows={isLong ? 3 : undefined}
        disabled={status === "saving"}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !isLong) {
            e.preventDefault();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") setDraft(field.value);
        }}
        className={cn(
          "rounded-lg border bg-white px-3 py-2 text-sm outline-none",
          isDirty ? "border-brand-500" : "border-canvas-200",
          status === "saving" && "opacity-60",
        )}
      />
    </label>
  );
}
