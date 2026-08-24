// Downloads a pinned, portable Node.js distribution into
// src-tauri/resources/node/<platform-triple>/ so Weavr can bundle it and run
// `npm install` / drive Vite's JS API on a professor's machine without them
// installing Node themselves. Not committed to git (large binary) — run this
// once before `npm run tauri dev` / `npm run tauri build`.

import { createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const NODE_VERSION = "22.16.0";
const PLATFORM_TRIPLE = "win32-x64";
const ARCHIVE_NAME = `node-v${NODE_VERSION}-win-x64`;
const DOWNLOAD_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${ARCHIVE_NAME}.zip`;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resourcesDir = path.join(__dirname, "..", "src-tauri", "resources", "node", PLATFORM_TRIPLE);
const markerPath = path.join(resourcesDir, ".version");

function alreadyUpToDate() {
  if (!existsSync(markerPath)) return false;
  return readFileSync(markerPath, "utf8").trim() === NODE_VERSION;
}

async function main() {
  if (alreadyUpToDate()) {
    console.log(`Node ${NODE_VERSION} runtime already present at ${resourcesDir}`);
    return;
  }

  const tmpDir = path.join(__dirname, "..", ".tmp-node-fetch");
  rmSync(tmpDir, { recursive: true, force: true });
  mkdirSync(tmpDir, { recursive: true });
  const zipPath = path.join(tmpDir, `${ARCHIVE_NAME}.zip`);

  console.log(`Downloading Node ${NODE_VERSION} for ${PLATFORM_TRIPLE}...`);
  const response = await fetch(DOWNLOAD_URL);
  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`);
  }
  await pipeline(response.body, createWriteStream(zipPath));

  console.log("Extracting...");
  execFileSync("powershell", [
    "-NoProfile",
    "-Command",
    `Expand-Archive -Path "${zipPath}" -DestinationPath "${tmpDir}" -Force`,
  ]);

  rmSync(resourcesDir, { recursive: true, force: true });
  mkdirSync(path.dirname(resourcesDir), { recursive: true });
  renameSync(path.join(tmpDir, ARCHIVE_NAME), resourcesDir);
  writeFileSync(markerPath, NODE_VERSION);

  rmSync(tmpDir, { recursive: true, force: true });

  console.log(`Node ${NODE_VERSION} runtime ready at ${resourcesDir}`);
}

await main();
