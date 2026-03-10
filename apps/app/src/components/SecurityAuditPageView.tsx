import { SecurityAuditView } from "./SecurityAuditView";
import { useApp } from "../AppContext";

export function SecurityAuditPageView() {
    const { t } = useApp();
  return (
    <div className="flex flex-col h-full">
      <h2 className="text-lg font-bold mb-1">{t("securityauditpageview.Security")}</h2>
      <p className="text-[13px] text-[var(--muted)] mb-4">
        
                      {t("securityauditpageview.SandboxPolicyAnd")}
                    </p>
      <div className="flex-1 min-h-0">
        <SecurityAuditView />
      </div>
    </div>
  );
}
