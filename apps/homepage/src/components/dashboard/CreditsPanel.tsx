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
      <div className="flex flex-col items-center justify-center py-20 animate-fade-up">
        <div className="w-14 h-14 rounded-2xl bg-surface border border-border flex items-center justify-center mb-5">
          <svg
            aria-hidden="true"
            className="w-7 h-7 text-text-muted/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z"
            />
          </svg>
        </div>
        <h3 className="text-base font-medium text-text-light mb-1.5">
          Not connected
        </h3>
        <p className="text-sm text-text-muted">
          Sign in with Eliza Cloud to view credits.
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-text-muted">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl animate-fade-up">
      <h2 className="text-xl font-semibold text-text-light">Credits</h2>

      {/* Balance */}
      <div className="bg-surface rounded-2xl border border-border p-6">
        <p className="text-sm text-text-muted mb-1">Balance</p>
        <p className="text-4xl font-semibold text-text-light tabular-nums tracking-tight">
          {credits ? credits.balance.toLocaleString() : "—"}
        </p>
        <p className="text-sm text-text-muted mt-1">
          {credits?.currency ?? "credits"}
        </p>
      </div>

      {/* Session */}
      {session && (
        <div className="bg-surface rounded-2xl border border-border p-6">
          <p className="text-sm text-text-muted mb-4">Current Session</p>
          <div className="grid grid-cols-3 gap-6">
            <StatItem label="Requests" value={session.requests} />
            <StatItem label="Tokens" value={session.tokens} />
            <StatItem label="Credits Used" value={session.credits} />
          </div>
        </div>
      )}
    </div>
  );
}

function StatItem({ label, value }: { label: string; value?: number }) {
  return (
    <div>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-2xl font-semibold text-text-light tabular-nums">
        {value?.toLocaleString() ?? "—"}
      </p>
    </div>
  );
}
