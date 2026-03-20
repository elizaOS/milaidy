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

interface DeployStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done" | "error";
}

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
  const [createdName, setCreatedName] = useState("");
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
          setTimeout(() => onCreated(), 1200);
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
      setError("Authentication required.");
      return;
    }

    setCreatedName(name.trim());
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
            setTimeout(() => onCreated(), 1200);
          }
        } catch {
          // Provisioning endpoint failed, agent was still created
          setStep("done");
          setTimeout(() => onCreated(), 1200);
        }
      } else {
        setStep("done");
        setTimeout(() => onCreated(), 1200);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setStep("error");
      if (msg.includes("401") || msg.includes("403")) {
        setError("Authentication failed. Please sign in again.");
      } else {
        setError(msg);
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

  // Build deploy steps for terminal output
  const getDeploySteps = (): DeployStep[] => {
    const isProvisioning = step === "provisioning";
    const isDone = step === "done";
    const jobPending = jobStatus?.status === "pending";
    const jobInProgress = jobStatus?.status === "in_progress";

    return [
      {
        id: "create",
        label: "Agent created",
        status: step === "creating" ? "active" : "done",
      },
      {
        id: "provision",
        label: "Provisioning container",
        status: isDone
          ? "done"
          : isProvisioning && jobPending
            ? "active"
            : isProvisioning
              ? "done"
              : "pending",
      },
      {
        id: "runtime",
        label: "Starting runtime",
        status: isDone ? "done" : isProvisioning && jobInProgress ? "active" : "pending",
      },
    ];
  };

  // Provisioning / creating / done states — terminal deploy log
  if (step === "creating" || step === "provisioning" || step === "done") {
    const deploySteps = getDeploySteps();

    return (
      <div className="border border-border bg-surface animate-fade-up">
        {/* Terminal header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <div className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${step === "done" ? "bg-emerald-500" : "bg-brand status-pulse"}`} />
          </div>
          <span className="font-mono text-xs text-text-muted">
            {step === "done" ? "deploy complete" : "deploying..."}
          </span>
        </div>

        {/* Deploy log output */}
        <div className="p-5 font-mono text-sm">
          <div className="text-text-muted mb-4">
            <span className="text-brand">$</span> milady deploy --name {createdName || name}
          </div>

          <div className="space-y-2.5">
            {deploySteps.map((s) => (
              <div key={s.id} className="flex items-center gap-3">
                {s.status === "done" && (
                  <span className="text-emerald-400 w-4 text-center">✓</span>
                )}
                {s.status === "active" && (
                  <span className="text-brand w-4 text-center animate-pulse">◌</span>
                )}
                {s.status === "pending" && (
                  <span className="text-text-subtle w-4 text-center">○</span>
                )}
                {s.status === "error" && (
                  <span className="text-red-400 w-4 text-center">✗</span>
                )}
                <span
                  className={
                    s.status === "done"
                      ? "text-text-light"
                      : s.status === "active"
                        ? "text-brand"
                        : "text-text-subtle"
                  }
                >
                  {s.label}
                  {s.status === "active" && "..."}
                </span>
              </div>
            ))}
          </div>

          {/* Done state — brief flash */}
          {step === "done" && (
            <div className="mt-6 pt-4 border-t border-border-subtle">
              <div className="flex items-center gap-2 text-emerald-400">
                <span>→</span>
                <span className="text-text-light">{createdName}</span>
                <span className="text-text-subtle">is live</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Error state — terminal error output
  if (step === "error") {
    return (
      <div className="border border-border bg-surface animate-fade-up">
        {/* Terminal header bar */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
          <span className="font-mono text-xs text-text-muted">deploy failed</span>
        </div>

        {/* Error output */}
        <div className="p-5 font-mono text-sm">
          <div className="text-text-muted mb-4">
            <span className="text-brand">$</span> milady deploy --name {createdName || name}
          </div>

          <div className="text-red-400 mb-6">
            <span className="text-red-500">ERROR:</span> {error}
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setStep("form");
                setError(null);
              }}
              className="px-4 py-2.5 bg-surface-elevated border border-border font-mono text-xs text-text-light
                hover:border-brand/50 transition-colors"
            >
              RETRY
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 font-mono text-xs text-text-muted hover:text-text-light transition-colors"
            >
              CANCEL
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Form state — unauthenticated
  if (!authenticated) {
    return (
      <div className="border border-border bg-surface animate-fade-up">
        {/* Terminal header */}
        <div className="flex items-center gap-3 px-4 py-2.5 bg-dark-secondary border-b border-border">
          <span className="w-2.5 h-2.5 rounded-full bg-text-muted/40" />
          <span className="font-mono text-xs text-text-muted">new agent</span>
        </div>

        <div className="p-5">
          {/* Terminal prompt */}
          <div className="font-mono text-sm mb-6">
            <span className="text-brand">$</span>{" "}
            <span className="text-text-light">milady deploy</span>{" "}
            <span className="text-text-muted">--new</span>
            <span className="inline-block w-2 h-4 bg-brand/70 ml-1 cursor-blink" />
          </div>

          {/* Auth required message */}
          <div className="border-l-2 border-brand/40 pl-4 mb-6">
            <p className="font-mono text-xs text-text-subtle tracking-wide mb-1">
              AUTHENTICATION REQUIRED
            </p>
            <p className="text-sm text-text-muted">
              Sign in to Eliza Cloud to deploy agents.
            </p>
            {loginError && (
              <p className="font-mono text-xs text-red-400 mt-2">{loginError}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {loginState === "polling" ? (
              <div className="flex items-center gap-3 font-mono text-sm">
                <span className="text-brand animate-pulse">◌</span>
                <span className="text-text-muted">Waiting for browser auth...</span>
                {manualLoginUrl && (
                  <a
                    href={manualLoginUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand hover:text-brand-hover transition-colors"
                  >
                    [open]
                  </a>
                )}
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={signIn}
                  className="px-5 py-2.5 bg-brand text-dark font-mono text-xs font-semibold tracking-wide
                    hover:bg-brand-hover active:scale-[0.98] transition-all duration-150"
                >
                  SIGN IN
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2.5 font-mono text-xs text-text-muted hover:text-text-light transition-colors"
                >
                  CANCEL
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Form state — authenticated
  return (
    <div className="border border-border bg-surface animate-fade-up">
      {/* Terminal header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-dark-secondary border-b border-border">
        <div className="flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
          <span className="font-mono text-xs text-text-muted">new agent</span>
        </div>
        <span className="font-mono text-[10px] text-text-subtle tracking-wide">
          CLOUD CONNECTED
        </span>
      </div>

      <div className="p-5">
        {/* Command preview */}
        <div className="font-mono text-sm text-text-muted mb-5">
          <span className="text-brand">$</span> milady deploy --name{" "}
          <span className={name ? "text-text-light" : "text-text-subtle"}>
            {name || "agent-name"}
          </span>
        </div>

        {/* Agent name input */}
        <div className="mb-5">
          <label
            htmlFor="agent-name-input"
            className="block font-mono text-[10px] font-medium tracking-wider text-text-subtle mb-2"
          >
            NAME
          </label>
          <input
            id="agent-name-input"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) =>
              e.key === "Enter" && !showEnvVars && name.trim() && handleCreate()
            }
            placeholder="agent-name"
            autoFocus
            className="w-full px-4 py-3 bg-dark border border-border font-mono text-sm
              text-text-light placeholder:text-text-subtle
              focus:border-brand/50 focus:outline-none
              transition-colors"
          />
        </div>

        {/* Environment Variables — config editor style */}
        <div className="mb-5">
          <button
            type="button"
            onClick={() => setShowEnvVars(!showEnvVars)}
            className="flex items-center gap-2 font-mono text-[10px] tracking-wider text-text-subtle 
              hover:text-text-muted transition-colors"
          >
            <span className={`transition-transform ${showEnvVars ? "rotate-90" : ""}`}>
              ▸
            </span>
            ENV
            {envVars.length > 0 && (
              <span className="px-1.5 py-0.5 bg-brand/10 text-brand text-[9px]">
                {envVars.length}
              </span>
            )}
          </button>

          {showEnvVars && (
            <div className="mt-3 border border-border-subtle bg-dark">
              {/* Config file header */}
              <div className="px-3 py-2 border-b border-border-subtle bg-dark-secondary">
                <span className="font-mono text-[10px] text-text-subtle"># environment variables</span>
              </div>

              <div className="p-3 space-y-2">
                {envVars.length === 0 && (
                  <p className="font-mono text-xs text-text-subtle py-2">
                    # no variables defined
                  </p>
                )}
                {envVars.map((ev, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: env vars have no stable ID
                  <div key={i} className="flex items-center gap-1 font-mono text-sm">
                    <input
                      type="text"
                      value={ev.key}
                      onChange={(e) => updateEnvVar(i, "key", e.target.value)}
                      placeholder="KEY"
                      className="w-32 px-2 py-1.5 bg-transparent text-brand placeholder:text-text-subtle/50
                        focus:outline-none uppercase"
                    />
                    <span className="text-text-subtle">=</span>
                    <input
                      type="text"
                      value={ev.value}
                      onChange={(e) => updateEnvVar(i, "value", e.target.value)}
                      placeholder="value"
                      className="flex-1 px-2 py-1.5 bg-transparent text-text-light placeholder:text-text-subtle/50
                        focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => removeEnvVar(i)}
                      className="px-2 py-1 text-text-subtle hover:text-red-400 transition-colors"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEnvVar}
                  className="flex items-center gap-1 font-mono text-xs text-text-subtle hover:text-brand transition-colors pt-1"
                >
                  <span>+</span> add
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-5 font-mono text-sm text-red-400">
            <span className="text-red-500">ERROR:</span> {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={handleCreate}
            disabled={!name.trim()}
            className="px-6 py-3 bg-brand text-dark font-mono text-xs font-semibold tracking-wide
              hover:bg-brand-hover active:scale-[0.98] transition-all duration-150
              disabled:opacity-30 disabled:cursor-not-allowed
              flex items-center gap-2"
          >
            <svg
              aria-hidden="true"
              className="w-3.5 h-3.5"
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
            DEPLOY
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 font-mono text-xs text-text-muted hover:text-text-light transition-colors"
          >
            CANCEL
          </button>
        </div>
      </div>
    </div>
  );
}
