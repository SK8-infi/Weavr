# Weavr

A desktop app for editing IATMSI-style conference websites without touching code.

Sign in with GitHub, pick a repository, and Weavr clones it, sets it up, and opens
your live site in a preview window. Click any text to change it, or use the side
panel. Press **Publish** and the change is committed and pushed — your host
(Vercel) redeploys from there.

Nothing else needs installing. Git and Node are bundled; the person using it never
sees a terminal.

## For site owners

1. Install Weavr.
2. Sign in with GitHub (a code appears; enter it in the browser tab that opens).
3. Pick your conference site.
4. Wait once while it sets up, then edit.

Each person signs in with their own GitHub account, and their access token is kept
in their own machine's credential store. There is no Weavr server and no shared
account.

## What can be edited

Weavr reads the site's `src/data/*.js` files, which is where the template keeps all
its copy. Text that appears exactly once resolves to a single field and can be
clicked directly on the preview. Text that repeats across the site — a committee
affiliation shared by several members, say — is edited from the side panel instead,
where you choose which one you mean rather than Weavr guessing.

Section ids, routes, and icon data are treated as wiring and are deliberately not
editable: changing them breaks the site rather than rewording it.

## Requirements for a site

Weavr checks a repository before opening it and expects:

- `src/data/pageRegistry.js`
- `src/utils/sectionResolver.jsx`
- a `package.json` with React and Vite

Content must live in `src/data/*.js` as plain static literals — no imports,
computed values, or template interpolation. That constraint is what makes safe,
surgical edits possible. See the template's own `.agents/AGENTS.md`.

## Development

```bash
npm install
npm run fetch:node   # downloads the bundled Node runtime (~100 MB, gitignored)
npm run tauri dev
```

`fetch:node` is required before the first `dev` or `build`: the runtime is a large
binary, so it isn't committed and is pulled at a pinned version instead.

```bash
cd src-tauri && cargo test    # parser, index, writer, and publish tests
npm run tauri build           # Windows .msi
```

To check the content parser against a real site:

```bash
WEAVR_TEST_PROJECT=C:/Github/IATMSI cargo test reports_coverage -- --nocapture
```

## How it works

| Piece | What it does |
|---|---|
| `auth/` | GitHub device flow; token stored in the OS credential store, never on disk in plaintext |
| `github/`, `git/` | Repo listing, shallow clone, and publish — all via `git2`, so no system git |
| `nodejs/` | Bundled Node runtime, `npm install` with a shared cache, and the preview dev server |
| `content/` | tree-sitter parsing of data files, the text→field index, and surgical write-back |
| `edit_bridge.rs` | Applies edits made by clicking on the preview |

A few decisions worth knowing:

**The preview runs the site's own Vite.** `resources/weavr-preview-server.mjs` loads
the cloned project's installed Vite and drives its JS API, so the preview uses that
project's real config and plugins and looks exactly like the deployed site.

**Edits are byte-splices, not regenerated files.** A change rewrites only the text
inside one string literal, so the diff is a single line and files stay formatted the
way their author left them. The file is re-parsed before and after every write, and
the save is refused if the edit didn't land where expected.

**Publish stages an allowlist.** Only files Weavr wrote are committed. If the remote
has changes Weavr didn't make, publishing stops rather than merging — a 3-way merge
of a data file isn't something the editor can reason about safely.

**The preview window has almost no privileges.** It renders the user's site from a
localhost dev server and is granted event emission only — no filesystem, git, or
GitHub access (`capabilities/preview.json`).

## Limits

- Windows only for now. Paths and process handling are written so macOS and Linux
  are a packaging job rather than a rewrite.
- The installer is large (~100–150 MB) because Node ships inside it. That's the
  cost of the user not installing anything themselves.
- Signing out clears the local token. A secret-free device-flow app can't revoke
  server-side; to fully revoke, use github.com/settings/applications.
- Editing page structure, theme colours, and images is not implemented yet.
