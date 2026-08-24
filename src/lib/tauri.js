import { invoke } from "@tauri-apps/api/core";

// Thin, typed-by-convention wrappers around Tauri commands live here as each
// backend command is implemented (auth, repos, preview, content, publish).
// The frontend never talks to GitHub or touches the stored token directly —
// every network/git/filesystem operation is invoked through Rust.
export { invoke };
