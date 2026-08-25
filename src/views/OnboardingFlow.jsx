import { useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { invoke } from "../lib/tauri";
import Button from "../components/ui/Button";
import Icon from "../components/ui/Icon";
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
    <div className="flex h-full items-center justify-center px-8">
      <div className="w-full max-w-[360px] animate-fade-up text-center">
        <div className="relative mx-auto mb-7 h-14 w-14">
          {/* A soft bloom behind the mark gives the screen a focal point. */}
          <div
            aria-hidden="true"
            className="absolute -inset-4 rounded-full bg-brand-400/25 blur-2xl"
          />
          <WeavrMark className="relative h-14 w-14 drop-shadow-[0_6px_16px_rgba(90,69,224,0.3)]" />
        </div>

        <h1 className="text-[26px] font-semibold leading-tight tracking-[-0.03em] text-canvas-900">
          Welcome to <span className="text-brand-gradient">Weavr</span>
        </h1>
        <p className="mx-auto mt-2 max-w-[300px] text-[13px] leading-relaxed text-canvas-500">
          Edit your conference website visually. No code, no setup, nothing else
          to install.
        </p>

        {!waiting && (
          <>
            <Button
              variant="primary"
              size="lg"
              onClick={signIn}
              className="mt-7 w-full"
            >
              <Icon name="github" className="h-4 w-4" />
              Continue with GitHub
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-canvas-400">
              <Icon name="lock" className="h-3 w-3" />
              Stays on this computer
            </p>
          </>
        )}

        {waiting && !deviceCode && (
          <div className="mt-7 flex items-center justify-center gap-2 text-[13px] text-canvas-400">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-brand-400 border-t-transparent" />
            Connecting to GitHub…
          </div>
        )}

        {waiting && deviceCode && (
          <div className="mt-7 animate-pop rounded-2xl bg-canvas-0 p-5 shadow-float">
            <p className="text-[12px] leading-relaxed text-canvas-500">
              Enter this code in the browser tab that just opened.
            </p>

            <button
              type="button"
              onClick={copyCode}
              title="Copy code"
              className="group mt-3 w-full rounded-xl bg-canvas-50 py-4 transition-colors duration-200 hover:bg-brand-50"
            >
              <span className="font-mono text-[28px] font-semibold tracking-[0.2em] text-canvas-900">
                {deviceCode.user_code}
              </span>
              <span className="mt-1.5 flex items-center justify-center gap-1 text-[10px] font-medium uppercase tracking-wider text-canvas-400 transition-colors group-hover:text-brand-600">
                {copied ? (
                  <>
                    <Icon name="check" className="h-3 w-3" />
                    Copied
                  </>
                ) : (
                  "Click to copy"
                )}
              </span>
            </button>

            <p className="mt-3.5 flex items-center justify-center gap-2 text-[11px] text-canvas-400">
              <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-brand-500" />
              Waiting for approval
            </p>
          </div>
        )}

        {status === STATUS.ERROR && (
          <div className="mt-5 flex animate-pop items-start gap-2 rounded-xl bg-critical-50 px-4 py-3 text-left">
            <Icon name="alert" className="mt-px h-3.5 w-3.5 text-critical-600" />
            <p className="text-[12px] leading-relaxed text-critical-700">
              {errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
