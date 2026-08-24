import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "../lib/tauri";

const STATUS = {
  IDLE: "idle",
  WAITING: "waiting",
  ERROR: "error",
};

export default function OnboardingFlow({ onAuthenticated }) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [deviceCode, setDeviceCode] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  async function signIn() {
    setStatus(STATUS.WAITING);
    setErrorMessage("");

    try {
      const code = await invoke("auth_start");
      setDeviceCode(code);
      openUrl(code.verification_uri).catch(() => {});

      const unlisten = await listen("auth://complete", (event) => {
        unlisten();
        const payload = event.payload;
        if (payload.status === "success") {
          onAuthenticated(payload.user);
          return;
        }
        setStatus(STATUS.ERROR);
        setDeviceCode(null);
        if (payload.status === "denied") {
          setErrorMessage("Sign-in was denied on GitHub.");
        } else if (payload.status === "expired") {
          setErrorMessage("That code expired before it was approved. Try again.");
        } else {
          setErrorMessage(payload.message || "Something went wrong signing in.");
        }
      });
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrorMessage(String(err));
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-canvas-900">Weavr</h1>
        <p className="text-canvas-800/70">
          Sign in with GitHub to edit your conference site.
        </p>
      </div>

      {status !== STATUS.WAITING && (
        <button
          type="button"
          onClick={signIn}
          className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white shadow-panel transition hover:bg-brand-700"
        >
          Sign in with GitHub
        </button>
      )}

      {status === STATUS.WAITING && deviceCode && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-canvas-200 bg-white px-8 py-6 shadow-panel">
          <p className="text-sm text-canvas-800/70">
            A browser tab has opened. Enter this code to approve:
          </p>
          <p className="font-mono text-3xl font-semibold tracking-widest text-brand-700">
            {deviceCode.user_code}
          </p>
          <p className="text-xs text-canvas-800/50">Waiting for approval…</p>
        </div>
      )}

      {status === STATUS.WAITING && !deviceCode && (
        <p className="text-sm text-canvas-800/50">Connecting to GitHub…</p>
      )}

      {status === STATUS.ERROR && (
        <p className="max-w-sm text-sm text-red-600">{errorMessage}</p>
      )}
    </div>
  );
}
