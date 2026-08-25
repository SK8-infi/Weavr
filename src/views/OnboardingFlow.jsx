import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import WeavrMark from "../components/ui/WeavrMark";

const STATUS = { IDLE: "idle", WAITING: "waiting", ERROR: "error" };

export default function OnboardingFlow({ onAuthenticated }) {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [deviceCode, setDeviceCode] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [copied, setCopied] = useState(false);

  async function signIn() {
    setStatus(STATUS.WAITING);
    setErrorMessage("");
    setDeviceCode(null);

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
        setErrorMessage(
          payload.status === "denied"
            ? "Sign-in was declined on GitHub."
            : payload.status === "expired"
              ? "That code expired before it was approved."
              : payload.message || "Something went wrong signing in.",
        );
      });
    } catch (err) {
      setStatus(STATUS.ERROR);
      setErrorMessage(String(err));
    }
  }

  async function copyCode() {
    if (!deviceCode) return;
    try {
      await navigator.clipboard.writeText(deviceCode.user_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* Clipboard access can be refused; the code is on screen regardless. */
    }
  }

  const waiting = status === STATUS.WAITING;

  return (
    <div className="flex h-full items-center justify-center bg-canvas-50 px-8">
      <div className="w-full max-w-[340px] animate-fade-up text-center">
        <WeavrMark className="mx-auto mb-6 h-11 w-11" />

        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-canvas-900">
          Weavr
        </h1>
        <p className="mt-1.5 text-[13px] leading-relaxed text-canvas-500">
          Edit your conference website — no code, no setup.
        </p>

        {!waiting && (
          <Button
            variant="primary"
            size="lg"
            onClick={signIn}
            className="mt-7 w-full"
          >
            Continue with GitHub
          </Button>
        )}

        {waiting && !deviceCode && (
          <p className="mt-7 text-[13px] text-canvas-400">Connecting…</p>
        )}

        {waiting && deviceCode && (
          <div className="mt-7 animate-fade-up rounded-2xl bg-canvas-0 p-5 shadow-raised">
            <p className="text-[12px] leading-relaxed text-canvas-500">
              Enter this code in the browser tab that just opened.
            </p>

            <button
              type="button"
              onClick={copyCode}
              title="Copy code"
              className="group mt-3 w-full rounded-xl bg-canvas-100 py-3 transition-colors hover:bg-canvas-200"
            >
              <span className="font-mono text-[26px] font-semibold tracking-[0.18em] text-canvas-900">
                {deviceCode.user_code}
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-wider text-canvas-400">
                {copied ? "Copied" : "Click to copy"}
              </span>
            </button>

            <p className="mt-3 flex items-center justify-center gap-2 text-[11px] text-canvas-400">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-500" />
              Waiting for approval
            </p>
          </div>
        )}

        {status === STATUS.ERROR && (
          <div className="mt-5 animate-fade-up rounded-xl bg-critical-50 px-4 py-3 text-left">
            <p className="text-[12px] leading-relaxed text-critical-700">
              {errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
