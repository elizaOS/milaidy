import { useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { getToken, isAuthenticated } from "../../lib/auth";
import { CloudClient } from "../../lib/cloud-api";

export function BillingPanel() {
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");
  const [billingSettings, setBillingSettings] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;
    setLoading(true);
    const cc = new CloudClient(getToken() ?? "");
    cc.getBillingSettings()
      .then(setBillingSettings)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (!isAuthenticated()) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C8"}</div>
        <div className="text-text-muted font-mono text-sm">
          Not connected to cloud
        </div>
        <div className="text-text-muted/50 font-mono text-xs">
          Log in with Eliza Cloud to view billing settings.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">
          Loading billing...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C8"}</div>
        <div className="text-text-muted font-mono text-sm">
          Billing data unavailable
        </div>
        <div className="text-text-muted/50 font-mono text-xs">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h3 className="font-mono text-xs uppercase tracking-widest text-brand">
        Billing & Usage
      </h3>

      {/* Cloud Agents Summary */}
      <div className="bg-dark border border-white/10 rounded p-4">
        <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">
          Cloud Agents
        </div>
        <div className="text-text-light font-mono text-lg mt-1">
          {cloudAgents.length} active
        </div>
      </div>

      {/* Billing Settings */}
      {billingSettings && (
        <div className="bg-dark border border-white/10 rounded p-4">
          <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider mb-2">
            Settings
          </div>
          <pre className="font-mono text-xs text-text-muted overflow-auto">
            {JSON.stringify(billingSettings, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
