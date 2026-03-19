import { useEffect, useMemo, useState } from "react";
import { useAgents } from "../../lib/AgentProvider";
import { getToken, isAuthenticated } from "../../lib/auth";
import { CloudClient } from "../../lib/cloud-api";

interface BillingSettingsResponse {
  success?: boolean;
  settings?: {
    autoTopUp?: {
      enabled?: boolean;
      amount?: number;
      threshold?: number;
      hasPaymentMethod?: boolean;
    };
    limits?: {
      minAmount?: number;
      maxAmount?: number;
      minThreshold?: number;
      maxThreshold?: number;
    };
  };
}

interface CreditsSummaryResponse {
  success?: boolean;
  organization?: {
    creditBalance?: number;
    autoTopUpEnabled?: boolean;
    autoTopUpThreshold?: number | null;
    autoTopUpAmount?: number | null;
    hasPaymentMethod?: boolean;
  };
  agentsSummary?: {
    total?: number;
    withBudget?: number;
    paused?: number;
    totalAllocated?: number;
    totalSpent?: number;
    totalAvailable?: number;
  };
  pricing?: {
    creditsPerDollar?: number;
    minimumTopUp?: number;
  };
}

export function BillingPanel() {
  const { agents } = useAgents();
  const cloudAgents = agents.filter((a) => a.source === "cloud");
  const [billingSettings, setBillingSettings] =
    useState<BillingSettingsResponse | null>(null);
  const [creditsSummary, setCreditsSummary] =
    useState<CreditsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) return;
    setLoading(true);
    setError(null);
    const cc = new CloudClient(getToken() ?? "");
    Promise.all([
      cc.getBillingSettings().catch(() => null),
      cc.getCreditsSummary().catch(() => null),
    ])
      .then(([settings, summary]) => {
        if (settings) {
          setBillingSettings(settings as BillingSettingsResponse);
        }
        if (summary) {
          setCreditsSummary(summary as CreditsSummaryResponse);
        }
        if (!settings && !summary) {
          setError("Could not load billing data");
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const totalHourly = useMemo(
    () =>
      cloudAgents.reduce(
        (sum, agent) => sum + (agent.billing?.costPerHour ?? 0),
        0,
      ),
    [cloudAgents],
  );

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
              d="M12 6v12m-3-9h6m4.5 9.75h-15a2.25 2.25 0 01-2.25-2.25v-9a2.25 2.25 0 012.25-2.25h15a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25z"
            />
          </svg>
        </div>
        <h3 className="text-base font-medium text-text-light mb-1.5">
          Not connected
        </h3>
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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-text-muted">{error}</p>
      </div>
    );
  }

  const autoTopUp = billingSettings?.settings?.autoTopUp;
  const org = creditsSummary?.organization;
  const agentSummary = creditsSummary?.agentsSummary;
  const pricing = creditsSummary?.pricing;

  return (
    <div className="space-y-6 max-w-5xl animate-fade-up">
      <div>
        <h2 className="text-xl font-semibold text-text-light">Billing</h2>
        <p className="text-sm text-text-muted mt-1">
          Credits, agent spend, and auto top-up settings from dev Eliza Cloud.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Org Balance"
          value={formatNumber(org?.creditBalance)}
          hint="credits"
        />
        <StatCard
          label="Cloud Agents"
          value={String(cloudAgents.length)}
          hint={
            totalHourly > 0 ? `$${totalHourly.toFixed(2)}/hr combined` : "no active hourly rate"
          }
        />
        <StatCard
          label="Allocated Budget"
          value={formatMoney(agentSummary?.totalAllocated)}
          hint={`${agentSummary?.withBudget ?? 0} agents with budgets`}
        />
        <StatCard
          label="Available Budget"
          value={formatMoney(agentSummary?.totalAvailable)}
          hint={`${agentSummary?.paused ?? 0} paused`}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr]">
        <section className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex items-start justify-between gap-4 mb-5">
            <div>
              <p className="text-sm text-text-muted">Auto top-up</p>
              <h3 className="text-lg font-semibold text-text-light mt-1">
                {autoTopUp?.enabled || org?.autoTopUpEnabled
                  ? "Enabled"
                  : "Disabled"}
              </h3>
            </div>
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs border ${
                autoTopUp?.hasPaymentMethod || org?.hasPaymentMethod
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-border text-text-muted"
              }`}
            >
              {autoTopUp?.hasPaymentMethod || org?.hasPaymentMethod
                ? "payment method on file"
                : "no payment method"}
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <MiniStat
              label="Trigger Threshold"
              value={formatMoney(
                autoTopUp?.threshold ?? org?.autoTopUpThreshold ?? undefined,
              )}
            />
            <MiniStat
              label="Top-up Amount"
              value={formatMoney(
                autoTopUp?.amount ?? org?.autoTopUpAmount ?? undefined,
              )}
            />
            <MiniStat
              label="Minimum Top-up"
              value={formatMoney(pricing?.minimumTopUp)}
            />
          </div>

          {billingSettings?.settings?.limits && (
            <p className="text-xs text-text-muted mt-4">
              Allowed top-up range: {formatMoney(billingSettings.settings.limits.minAmount)} to{" "}
              {formatMoney(billingSettings.settings.limits.maxAmount)}
            </p>
          )}
        </section>

        <section className="bg-surface rounded-2xl border border-border p-6">
          <p className="text-sm text-text-muted mb-4">Usage summary</p>
          <div className="space-y-4">
            <MiniStat
              label="Total Spent"
              value={formatMoney(agentSummary?.totalSpent)}
            />
            <MiniStat
              label="Credits / USD"
              value={
                pricing?.creditsPerDollar != null
                  ? `${pricing.creditsPerDollar}`
                  : "—"
              }
            />
            <MiniStat
              label="Tracked Agents"
              value={String(agentSummary?.total ?? cloudAgents.length)}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="bg-surface rounded-2xl border border-border p-5">
      <p className="text-sm text-text-muted mb-1">{label}</p>
      <p className="text-3xl font-semibold text-text-light tabular-nums tracking-tight">
        {value}
      </p>
      {hint && <p className="text-xs text-text-muted mt-2">{hint}</p>}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-text-muted mb-1">{label}</p>
      <p className="text-base font-medium text-text-light tabular-nums">{value}</p>
    </div>
  );
}

function formatMoney(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `$${value.toFixed(2)}`;
}

function formatNumber(value?: number | null): string {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString();
}
