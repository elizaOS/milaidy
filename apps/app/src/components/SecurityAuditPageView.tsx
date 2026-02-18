import { SecurityAuditView } from "./SecurityAuditView";

export function SecurityAuditPageView() {
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">Security</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">
        Sandbox, policy, and signing audit events with real-time streaming.
      </p>
      <div className="flex-1 min-h-0">
        <SecurityAuditView />
      </div>
    </div>
  );
}
