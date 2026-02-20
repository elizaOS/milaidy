import { useApp } from "../AppContext.js";
import { TAB_GROUPS } from "../navigation";
import { createTranslator } from "../i18n";

export function Nav() {
  const { tab, setTab, uiLanguage } = useApp();
  const t = createTranslator(uiLanguage);

  const labelForGroup = (
    primaryTab: (typeof TAB_GROUPS)[number]["tabs"][number],
    fallbackLabel: string,
  ): string => {
    if (primaryTab === "chat") return t("nav.chat");
    if (primaryTab === "companion") return t("nav.companion");
    if (primaryTab === "character") return t("nav.character");
    if (primaryTab === "wallets") return t("nav.wallets");
    if (primaryTab === "knowledge") return t("nav.knowledge");
    if (primaryTab === "connectors") return t("nav.social");
    if (primaryTab === "apps") return t("nav.apps");
    if (primaryTab === "settings") return t("nav.settings");
    if (primaryTab === "advanced") return t("nav.advanced");
    return fallbackLabel;
  };

  return (
    <nav className="border-b border-border py-2 px-5 flex gap-1 overflow-x-auto">
      {TAB_GROUPS.map((group: (typeof TAB_GROUPS)[number]) => {
        const primaryTab = group.tabs[0];
        const isActive = group.tabs.includes(tab);
        return (
          <button
            key={group.label}
            className={`inline-block px-3 py-1.5 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
              isActive
                ? "text-accent font-medium border-b-accent"
                : "text-muted border-b-transparent hover:text-txt"
            }`}
            onClick={() => setTab(primaryTab)}
          >
            {labelForGroup(primaryTab, group.label)}
          </button>
        );
      })}
    </nav>
  );
}
