import {
  CloudDashboard,
  ConnectionFailedBanner,
  LoadingScreen,
  StartupFailureView,
  SystemWarningBanner,
} from "@miladyai/app-core/components";
import { useApp } from "@miladyai/app-core/state";

export function App() {
  const { startupError, startupPhase, retryStartup } = useApp();

  if (startupError) {
    return <StartupFailureView error={startupError} onRetry={retryStartup} />;
  }

  if (startupPhase !== "ready") {
    return <LoadingScreen phase={startupPhase} />;
  }

  return (
    <div className="min-h-screen bg-bg text-txt">
      <ConnectionFailedBanner />
      <SystemWarningBanner />
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 px-6 py-10">
        <section className="rounded-3xl border border-border/50 bg-card/60 px-6 py-8 shadow-[0_20px_80px_rgba(0,0,0,0.35)]">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-accent">
              Eliza Cloud
            </p>
            <h1 className="text-4xl font-semibold tracking-tight text-txt-strong">
              Minimal cloud shell
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-muted">
              This app runs the same backend and account flow without companion,
              VRM, or scene features. It is the target shape for a thin,
              white-label shell over shared app-core and cloud APIs.
            </p>
          </div>
        </section>

        <CloudDashboard />
      </main>
    </div>
  );
}
