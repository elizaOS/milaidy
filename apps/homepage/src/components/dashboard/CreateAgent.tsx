import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CHARACTER_PRESETS } from "../../../../../src/onboarding-presets";
import { AgentProvider, useAgents } from "../../lib/AgentProvider";
import { AuthGate } from "./AuthGate";

type OnboardingStep = "select" | "customize" | "deploying" | "done";

export function CreateAgent() {
  return (
    <AuthGate>
      <AgentProvider>
        <CreateAgentInner />
      </AgentProvider>
    </AuthGate>
  );
}

function CreateAgentInner() {
  const navigate = useNavigate();
  const { createAgent } = useAgents();
  const [step, setStep] = useState<OnboardingStep>("select");
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [agentName, setAgentName] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState<string | null>(null);

  const preset = CHARACTER_PRESETS.find((p) => p.id === selectedPreset);

  const handleSelect = useCallback((presetId: string) => {
    const p = CHARACTER_PRESETS.find((c) => c.id === presetId);
    setSelectedPreset(presetId);
    setAgentName(p?.name ?? "");
    setBio(p?.description ?? "");
    setStep("customize");
  }, []);

  const handleDeploy = useCallback(async () => {
    if (!agentName.trim()) {
      setError("Agent name is required.");
      return;
    }
    setError(null);
    setStep("deploying");
    try {
      await createAgent({
        name: agentName.trim(),
        config: {
          preset: selectedPreset,
          bio: bio.trim(),
        },
      });
      setStep("done");
    } catch (err) {
      setError(`Failed to create agent: ${err}`);
      setStep("customize");
    }
  }, [agentName, bio, selectedPreset, createAgent]);

  return (
    <div className="min-h-screen bg-dark text-text-light">
      <div className="pt-[100px] max-w-3xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button
            type="button"
            onClick={() =>
              step === "select" || step === "done"
                ? navigate("/dashboard")
                : setStep("select")
            }
            className="text-text-muted hover:text-text-light font-mono text-xs uppercase tracking-widest transition-colors"
          >
            {"\u2190"} Back
          </button>
          <h1 className="text-lg font-medium">Create Agent</h1>
        </div>

        {/* Step: Select character preset */}
        {step === "select" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted mb-1">
                Choose a personality
              </h2>
              <p className="text-text-muted/60 text-xs font-mono">
                Pick a character preset to start with. You can customize
                everything in the next step.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CHARACTER_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleSelect(p.id)}
                  className="border border-white/10 rounded p-4 text-left hover:border-brand/50 hover:bg-brand/5 transition-all duration-200 group"
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-text-light group-hover:text-brand transition-colors">
                      {p.name}
                    </span>
                    <span className="text-text-muted/40 font-mono text-xs italic">
                      &ldquo;{p.catchphrase}&rdquo;
                    </span>
                  </div>
                  <p className="text-text-muted/60 text-xs font-mono">
                    {p.description}
                  </p>
                </button>
              ))}

              {/* Custom option */}
              <button
                type="button"
                onClick={() => {
                  setSelectedPreset(null);
                  setAgentName("");
                  setBio("");
                  setStep("customize");
                }}
                className="border border-dashed border-white/10 rounded p-4 text-left hover:border-brand/50 hover:bg-brand/5 transition-all duration-200 group"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text-muted group-hover:text-brand transition-colors">
                    Custom
                  </span>
                  <span className="text-text-muted/40 font-mono text-xs">
                    +
                  </span>
                </div>
                <p className="text-text-muted/60 text-xs font-mono">
                  Start from scratch with your own personality
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Step: Customize */}
        {step === "customize" && (
          <div className="space-y-6">
            <div>
              <h2 className="text-sm font-mono uppercase tracking-widest text-text-muted mb-1">
                Customize your agent
              </h2>
              {preset && (
                <p className="text-text-muted/60 text-xs font-mono">
                  Starting from {preset.name} preset — customize as needed.
                </p>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="agent-name"
                  className="block text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1.5"
                >
                  Agent Name
                </label>
                <input
                  id="agent-name"
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="Enter agent name"
                  className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-sm text-text-light font-mono placeholder:text-text-muted/30 focus:border-brand/50 focus:outline-none transition-colors"
                />
              </div>

              <div>
                <label
                  htmlFor="agent-bio"
                  className="block text-[10px] font-mono uppercase tracking-widest text-text-muted mb-1.5"
                >
                  Bio / Description
                </label>
                <textarea
                  id="agent-bio"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Describe your agent's personality and purpose"
                  rows={4}
                  className="w-full bg-transparent border border-white/10 rounded px-3 py-2 text-sm text-text-light font-mono placeholder:text-text-muted/30 focus:border-brand/50 focus:outline-none transition-colors resize-none"
                />
              </div>
            </div>

            {error && (
              <div className="text-red-500 font-mono text-xs">{error}</div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("select")}
                className="px-4 py-2 border border-white/10 text-text-muted font-mono text-xs uppercase tracking-widest rounded hover:border-white/30 transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleDeploy}
                className="px-6 py-2 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
              >
                Deploy to Cloud
              </button>
            </div>
          </div>
        )}

        {/* Step: Deploying */}
        {step === "deploying" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="text-brand font-mono text-sm animate-pulse">
              Deploying {agentName} to Eliza Cloud...
            </div>
            <p className="text-text-muted/50 text-xs font-mono">
              This may take a minute. Your agent is being provisioned.
            </p>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-20 space-y-4">
            <div className="text-green-500 text-3xl">{"\u2713"}</div>
            <div className="text-text-light font-mono text-sm">
              {agentName} is live!
            </div>
            <p className="text-text-muted/50 text-xs font-mono text-center max-w-md">
              Your agent has been deployed to Eliza Cloud. It may take a moment
              to finish provisioning.
            </p>
            <button
              type="button"
              onClick={() => navigate("/dashboard")}
              className="mt-2 px-6 py-2.5 bg-brand text-dark font-mono text-xs uppercase tracking-widest rounded hover:bg-brand-hover transition-colors"
            >
              View Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
