import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "../../lib/auth";
import { CloudClient, type JobStatus } from "../../lib/cloud-api";
import { useCloudLogin } from "./useCloudLogin";

interface CreateAgentFormProps {
  onAuthenticated?: () => void;
  onCreated: () => void;
  onCancel: () => void;
}

type CreateStep = "form" | "creating" | "provisioning" | "done" | "error";

const PROGRESS_MESSAGES: Record<string, string> = {
  pending: "Queued for provisioning…",
  in_progress: "Spinning up your agent…",
  completed: "Agent is live!",
  failed: "Provisioning failed.",
};

export function CreateAgentForm({
  onAuthenticated,
  onCreated,
  onCancel,
}: CreateAgentFormProps) {
  const [name, setName] = useState("");
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [showEnvVars, setShowEnvVars] = useState(false);
  const [step, setStep] = useState<CreateStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<JobStatus | null>(null);
  const [_createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout>>();
  const {
    error: loginError,
    isAuthenticated: authenticated,
    manualLoginUrl,
    signIn,
    state: loginState,
  } = useCloudLogin({ onAuthenticated });

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const pollJob = useCallback(
    async (cc: CloudClient, jobId: string, attempt = 0) => {
      const MAX_ATTEMPTS = 60; // ~2.5 min at 2.5s intervals
      if (attempt >= MAX_ATTEMPTS) {
        setStep("error");
        setError("Provisioning timed out. Please check the dashboard.");
        return;
      }
      try {
        const status = await cc.getJobStatus(jobId);
        setJobStatus(status);
        if (status.status === "completed") {
          setStep("done");
          setTimeout(() => onCreated(), 1500);
        } else if (status.status === "failed") {
          setStep("error");
          setError(status.error ?? "Provisioning failed.");
        } else {
          pollRef.current = setTimeout(
            () => pollJob(cc, jobId, attempt + 1),
            2500,
          );
        }
      } catch {
        // Network error during polling, retry with backoff
        pollRef.current = setTimeout(
          () => pollJob(cc, jobId, attempt + 1),
          5000,
        );
      }
    },
    [onCreated],
  );

  const handleCreate = useCallback(async () => {
    if (!name.trim()) return;
    if (!authenticated) {
      setError("You need to sign in with Eliza Cloud first.");
      return;
    }

    setStep("creating");
    setError(null);

    try {
      const cc = new CloudClient(getToken() ?? "");

      // Build environment vars object
      const environmentVars: Record<string, string> = {};
      for (const ev of envVars) {
        if (ev.key.trim()) {
          environmentVars[ev.key.trim()] = ev.value;
        }
      }

      const result = await cc.createAgent({
        name: name.trim(),
        environmentVars:
          Object.keys(environmentVars).length > 0 ? environmentVars : undefined,
      });

      setCreatedAgentId(result.id);

      // Try to provision
      if (result.id) {
        setStep("provisioning");
        try {
          const provResult = await cc.provisionAgent(result.id);
          if (provResult.jobId) {
            // Poll job status
            pollJob(cc, provResult.jobId);
          } else {
            // No job ID, provisioning was synchronous or auto
            setStep("done");
            setTimeout(() => onCreated(), 1500);
          }
        } catch {
          // Provisioning endpoint failed, agent was still created
          setStep("done");
          setTimeout(() => onCreated(), 1500);
        }
      } else {
        setStep("done");
        setTimeout(() => onCreated(), 1500);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep("error");
      if (msg.includes("401") || msg.includes("403")) {
        setError("Authentication failed. Please sign in again.");
      } else {
        setError(`Failed to create agent: ${msg}`);
      }
    }
  }, [authenticated, name, envVars, onCreated, pollJob]);

  const addEnvVar = () => setEnvVars([...envVars, { key: "", value: "" }]);
  const removeEnvVar = (i: number) =>
    setEnvVars(envVars.filter((_, idx) => idx !== i));
  const updateEnvVar = (i: number, field: "key" | "value", val: string) => {
    const updated = [...envVars];
    updated[i] = { ...updated[i], [field]: val };
    setEnvVars(updated);
  };

  // Provisioning / creating state
  if (step === "creating" || step === "provisioning" || step === "done") {
    return (
      <div className="rounded-2xl bg-surface border border-border p-6 animate-fade-up">
        <div className="flex flex-col items-center py-8">
          {step === "done" ? (
            <>
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4">
                <svg
                  aria-hidden="true"
                  className="w-7 h-7 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-text-light mb-1">
                Agent Created!
              </h3>
              <p className="text-sm text-text-muted">
                {name} is now live. Redirecting…
              </p>
            </>
          ) : (
            <>
              <div className="w-14 h-14 rounded-full bg-brand/10 flex items-center justify-center mb-4">
                <div className="w-7 h-7 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
              </div>
              <h3 className="text-lg font-medium text-text-light mb-1">
                {step === "creating" ? "Creating Agent…" : "Provisioning…"}
              </h3>
              <p className="text-sm text-text-muted">
                {jobStatus
                  ? (PROGRESS_MESSAGES[jobStatus.status] ?? "Working…")
                  : step === "creating"
                    ? "Setting up your agent on Eliza Cloud…"
                    : "Spinning up the sandbox environment…"}
              </p>

              {/* Progress bar */}
              <div className="w-64 mt-6">
                <div className="h-1.5 bg-dark rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand rounded-full transition-all duration-700 ease-out"
                    style={{
                      width:
                        step === "creating"
                          ? "30%"
                          : jobStatus?.status === "pending"
                            ? "50%"
                            : jobStatus?.status === "in_progress"
                              ? "75%"
                              : "45%",
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-surface border border-border p-6 animate-fade-up">
      <h3 className="text-lg font-medium text-text-light mb-1">
        Create a new Milady agent
      </h3>
      <p className="text-sm text-text-muted mb-5">
        {authenticated
          ? "Configure and launch your agent on Eliza Cloud."
          : "Sign in with Eliza Cloud to create and host agents."}
      </p>

      {!authenticated ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-brand/5 border border-brand/20 rounded-xl">
            <svg
              aria-hidden="true"
              className="w-5 h-5 text-brand flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-text-muted">
                Sign in to Eliza Cloud to create and manage hosted agents.
              </p>
              {loginError && (
                <p className="text-xs text-red-400 mt-1">{loginError}</p>
              )}
              {manualLoginUrl && (
                <a
                  href={manualLoginUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex mt-2 text-xs text-brand hover:underline"
                >
                  Open sign-in page
                </a>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={signIn}
              disabled={loginState === "polling"}
              className="px-5 py-2.5 bg-brand text-dark font-medium text-sm rounded-xl
                hover:bg-brand-hover active:scale-[0.98] transition-all duration-150
                disabled:opacity-70 disabled:cursor-wait
                flex items-center gap-2 shadow-[0_0_16px_rgba(240,185,11,0.12)]"
            >
              {loginState === "polling" ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-dark/20 border-t-dark animate-spin" />
                  Waiting for Sign In…
                </>
              ) : (
                "Sign In"
              )}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-text-muted text-sm rounded-xl
                hover:text-text-light hover:bg-dark transition-all duration-150"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Agent name */}
          <div>
            <label
              htmlFor="agent-name-input"
              className="block text-xs text-text-muted mb-1.5"
            >
              Agent Name
            </label>
            <input
              id="agent-name-input"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && !showEnvVars && handleCreate()
              }
              placeholder="e.g. my-milady-agent"
              className="w-full px-4 py-2.5 bg-dark border border-border rounded-xl text-[15px]
                text-text-light placeholder:text-text-muted/50
                focus:border-brand/50 focus:outline-none focus:ring-1 focus:ring-brand/20
                transition-all duration-150"
            />
          </div>

          {/* Environment Variables (collapsible) */}
          <div>
            <button
              type="button"
              onClick={() => setShowEnvVars(!showEnvVars)}
              className="flex items-center gap-2 text-xs text-text-muted hover:text-text-light transition-colors"
            >
              <svg
                aria-hidden="true"
                className={`w-3 h-3 transition-transform ${showEnvVars ? "rotate-90" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              Environment Variables
              {envVars.length > 0 && (
                <span className="px-1.5 py-0.5 bg-brand/10 text-brand rounded-md text-[10px]">
                  {envVars.length}
                </span>
              )}
            </button>

            {showEnvVars && (
              <div className="mt-3 space-y-2">
                {envVars.map((ev, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: env vars have no stable ID
                  <div key={i} className="flex gap-2">
                    <input
                      type="text"
                      value={ev.key}
                      onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                      placeholder="KEY"
                      className="flex-1 px-3 py-2 bg-dark border border-border rounded-lg text-xs
                        text-text-light placeholder:text-text-muted/50 font-mono
                        focus:border-brand/50 focus:outline-none"
                    />
                    <input
                      type="text"
                      value={ev.value}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      placeholder="value"
                      className="flex-[2] px-3 py-2 bg-dark border border-border rounded-lg text-xs
                        text-text-light placeholder:text-text-muted/50 font-mono
                        focus:border-brand/50 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(i)}
                      className="px-2 text-text-muted hover:text-red-400 transition-colors"
                    >
                      <svg
                        aria-hidden="true"
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="text-xs text-brand hover:text-brand-hover transition-colors"
                >
                  + Add variable
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!name.trim()}
              className="px-5 py-2.5 bg-brand text-dark font-medium text-sm rounded-xl
                hover:bg-brand-hover active:scale-[0.98] transition-all duration-150
                disabled:opacity-30 disabled:cursor-not-allowed
                flex items-center gap-2 shadow-[0_0_16px_rgba(240,185,11,0.12)]"
            >
              <svg
                aria-hidden="true"
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Create &amp; Deploy
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-text-muted text-sm rounded-xl
                hover:text-text-light hover:bg-dark transition-all duration-150"
            >
              Cancel
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="px-4 py-2.5 bg-red-500/8 border border-red-500/20 rounded-xl text-red-400 text-sm">
              {error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
