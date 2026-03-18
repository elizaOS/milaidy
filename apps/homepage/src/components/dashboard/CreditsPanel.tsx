import { useEffect, useState } from "react";
import { getToken, isAuthenticated } from "../../lib/auth";
import { CloudClient, type CreditBalance } from "../../lib/cloud-api";

export function CreditsPanel() {
  const [credits, setCredits] = useState<CreditBalance | null>(null);
  const [session, setSession] = useState<{
    credits?: number;
    requests?: number;
    tokens?: number;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;
    setLoading(true);
    const cc = new CloudClient(getToken() ?? "");
    Promise.all([
      cc.getCreditsBalance().catch(() => null),
      cc.getCurrentSession().catch(() => null),
    ])
      .then(([creds, sess]) => {
        if (creds) setCredits(creds);
        if (sess) setSession(sess);
        if (!creds && !sess) setError("Could not load credit data");
      })
      .finally(() => setLoading(false));
  }, []);

  if (!isAuthenticated()) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C7"}</div>
        <div className="text-text-muted font-mono text-sm">
          Not connected to cloud
        </div>
        <div className="text-text-muted/50 font-mono text-xs">
          Log in with Eliza Cloud to view your credits.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="text-brand font-mono text-sm animate-pulse">
          Loading credits...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-3">
        <div className="text-text-muted/30 text-4xl">{"\u25C7"}</div>
        <div className="text-text-muted font-mono text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h3 className="font-mono text-xs uppercase tracking-widest text-brand">
        Credits
      </h3>

      {/* Balance card */}
      <div className="bg-dark border border-white/10 rounded p-6">
        <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider mb-2">
          Balance
        </div>
        <div className="text-text-light font-mono text-3xl">
          {credits ? credits.balance.toLocaleString() : "\u2014"}
        </div>
        <div className="text-text-muted font-mono text-xs mt-1">
          {credits?.currency ?? "credits"}
        </div>
      </div>

      {/* Session usage */}
      {session && (
        <div className="bg-dark border border-white/10 rounded p-6 space-y-4">
          <div className="text-text-muted font-mono text-[10px] uppercase tracking-wider">
            Current Session Usage
          </div>
          <div className="grid grid-cols-3 gap-6">
            <div>
              <div className="text-text-muted font-mono text-[10px] uppercase">
                Requests
              </div>
              <div className="text-text-light font-mono text-2xl mt-1">
                {session.requests?.toLocaleString() ?? "\u2014"}
              </div>
            </div>
            <div>
              <div className="text-text-muted font-mono text-[10px] uppercase">
                Tokens
              </div>
              <div className="text-text-light font-mono text-2xl mt-1">
                {session.tokens?.toLocaleString() ?? "\u2014"}
              </div>
            </div>
            <div>
              <div className="text-text-muted font-mono text-[10px] uppercase">
                Credits Used
              </div>
              <div className="text-text-light font-mono text-2xl mt-1">
                {session.credits?.toLocaleString() ?? "\u2014"}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
