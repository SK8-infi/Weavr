// Weavr preview launcher.
//
// Runs INSIDE a cloned conference project, using that project's own installed
// Vite (and therefore its own vite.config.js, plugins, and Tailwind setup) so
// the preview renders pixel-identically to the real deployed site.
//
// Driving Vite's JS API directly — rather than shelling out to `npm run dev` —
// means Weavr supervises exactly one node process instead of an
// npm -> node -> vite chain, which makes shutdown reliable (especially on
// Windows) and lets us report readiness over stdout as JSON instead of
// scraping Vite's banner.
//
// Protocol: one JSON object per line on stdout.
//   {"type":"ready","url":"http://127.0.0.1:5173"}
//   {"type":"error","message":"..."}
//   {"type":"log","message":"..."}

import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const projectRoot = process.argv[2];
const port = Number(process.argv[3]);

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

if (!projectRoot || !Number.isInteger(port)) {
  emit({ type: "error", message: "usage: weavr-preview-server.mjs <projectRoot> <port>" });
  process.exit(1);
}

async function loadProjectVite() {
  // Resolve Vite from the PROJECT's node_modules, not Weavr's own.
  const require = createRequire(pathToFileURL(`${projectRoot}/package.json`));
  const vitePath = require.resolve("vite");
  return import(pathToFileURL(vitePath).href);
}

let server;

async function start() {
  const vite = await loadProjectVite();

  server = await vite.createServer({
    root: projectRoot,
    configFile: undefined, // let Vite discover the project's own config
    server: {
      port,
      strictPort: true,
      host: "127.0.0.1",
    },
    clearScreen: false,
    logLevel: "warn",
  });

  await server.listen();

  emit({ type: "ready", url: `http://127.0.0.1:${port}` });
}

async function shutdown() {
  try {
    await server?.close();
  } finally {
    process.exit(0);
  }
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
// Parent (Weavr) closing our stdin is the normal shutdown signal on Windows,
// where there's no reliable SIGTERM equivalent for a child process.
process.stdin.on("close", shutdown);
process.stdin.resume();

start().catch((err) => {
  emit({ type: "error", message: err?.stack || String(err) });
  process.exit(1);
});
