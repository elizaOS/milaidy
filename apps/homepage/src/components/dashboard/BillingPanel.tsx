import { useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { isAuthenticated, getToken } from "../../lib/auth";

const CLOUD_BASE = "https://www.elizacloud.ai";

export function BillingPanel() {
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");
  const [billing, setBilling] = useState<object | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated() || cloudAgents.length === 0) return;
    setLoading(true);
    const token = getToken();
    fetch(`${CLOUD_BASE}/api/v1/milady/billing`, {
      headers: { "X-Api-Key": token! },
    })
      .then((r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "Billing API not available yet" : `Error ${r.status}`);
        return r.json();
      })
      .then(setBilling)
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [cloudAgents.length]);

  if (!isAuthenticated()) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C8"}</div>
        <div className="text-text-muted font-mono text-sm">Not connected to cloud</div>
        <div className="text-text-muted/50 font-mono text-xs">
          Log in with Eliza Cloud to view billing information.
        </div>
      </div>
    );
  }

  if (cloudAgents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C8"}</div>
        <div className="text-text-muted font-mono text-sm">No cloud agents</div>
        <div className="text-text-muted/50 font-mono text-xs">
          Deploy an agent to Eliza Cloud to view billing.
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C8"}</div>
        <div className="text-text-muted font-mono text-sm">{error}</div>
        <div className="text-text-muted/50 font-mono text-xs">
          Billing data will be available once the API is live.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">Loading billing...</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-mono text-xs uppercase tracking-widest text-brand">Billing</h3>
      <pre className="bg-dark border border-white/10 rounded p-4 font-mono text-xs text-text-muted overflow-auto">
        {billing ? JSON.stringify(billing, null, 2) : "No billing data"}
      </pre>
    </div>
  );
}
