export default function OnboardingFlow() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold text-canvas-900">Weavr</h1>
        <p className="text-canvas-800/70">
          Sign in with GitHub to edit your conference site.
        </p>
      </div>
      <button
        type="button"
        disabled
        className="rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white shadow-panel disabled:opacity-50"
      >
        Sign in with GitHub
      </button>
    </div>
  );
}
