import { useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { getToken, isAuthenticated } from "../../lib/auth";
import { CloudClient } from "../../lib/cloud-api";

export function BillingPanel() {
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");
  const [billingSettings, setBillingSettings] = useState<object | null>(null);
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
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-text-muted">
          Sign in with Eliza Cloud to view billing.
        </p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 rounded-full border-2 border-brand/30 border-t-brand animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-up">
      <h2 className="text-xl font-semibold text-text-light">Billing</h2>

      <div className="bg-surface rounded-2xl border border-border p-6">
        <p className="text-sm text-text-muted mb-1">Cloud Agents</p>
        <p className="text-2xl font-semibold text-text-light">
          {cloudAgents.length} active
        </p>
      </div>

      {error && <p className="text-sm text-text-muted">{error}</p>}

      {billingSettings && (
        <div className="bg-surface rounded-2xl border border-border p-6">
          <p className="text-sm text-text-muted mb-3">Settings</p>
          <pre className="font-mono text-xs text-text-muted/70 overflow-auto">
            {JSON.stringify(billingSettings, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
