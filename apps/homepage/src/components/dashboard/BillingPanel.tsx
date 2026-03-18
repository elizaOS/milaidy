import { useEffect, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { isAuthenticated, getToken } from "../../lib/auth";
import { CloudClient } from "../../lib/cloud-api";
import type { CreditBalance } from "../../lib/cloud-api";

export function BillingPanel() {
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [session, setSession] = useState<{ credits?: number; requests?: number; tokens?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) return;
    setLoading(true);
    const cc = new CloudClient(getToken()!);
    Promise.all([
      cc.getCreditsBalance().catch(() => null),
      cc.getCurrentSession().catch(() => null),
    ]).then(([creds, sess]) => {
      if (creds) setCredits(creds);
      if (sess) setSession(sess);
      if (!creds && !sess) setError("Could not load billing data");
    }).finally(() => setLoading(false));
  }, []);

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

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">Loading billing...</div>
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

  return (
    <div className="space-y-6">
      <h3 className="font-mono text-xs uppercase tracking-widest text-brand">Billing</h3>

      {/* Credits Balance */}
      <div className="bg-dark border border-white/10 rounded p-4 space-y-2">
        <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Credit Balance</div>
        <div className="text-text-light font-mono text-2xl">
          {credits ? `${credits.balance.toLocaleString()} ${credits.currency ?? "credits"}` : "\u2014"}
        </div>
      </div>

      {/* Session Usage */}
      {session && (
        <div className="bg-dark border border-white/10 rounded p-4 space-y-3">
          <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Current Session</div>
          <div className="grid grid-cols-3 gap-4">
            {session.requests !== undefined && (
              <div>
                <div className="text-text-muted font-mono text-[10px] uppercase">Requests</div>
                <div className="text-text-light font-mono text-lg">{session.requests.toLocaleString()}</div>
              </div>
            )}
            {session.tokens !== undefined && (
              <div>
                <div className="text-text-muted font-mono text-[10px] uppercase">Tokens</div>
                <div className="text-text-light font-mono text-lg">{session.tokens.toLocaleString()}</div>
              </div>
            )}
            {session.credits !== undefined && (
              <div>
                <div className="text-text-muted font-mono text-[10px] uppercase">Credits Used</div>
                <div className="text-text-light font-mono text-lg">{session.credits.toLocaleString()}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cloud Agent Count */}
      <div className="bg-dark border border-white/10 rounded p-4">
        <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">Cloud Agents</div>
        <div className="text-text-light font-mono text-lg mt-1">{cloudAgents.length}</div>
      </div>
    </div>
  );
}
