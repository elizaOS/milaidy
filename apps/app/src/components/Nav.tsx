import { useApp } from "../AppContext.js";
import { TAB_GROUPS, titleForTab, type Tab } from "../navigation";

export function Nav() {
  const { tab, setTab } = useApp();
  const validTabs: Tab[] = ["chat", "apps", "game", "agent", "plugins", "config", "database", "settings", "logs"];

  return (
    <nav className="border-b border-border py-2 px-5 flex gap-1 overflow-x-auto">
      {TAB_GROUPS.map((group: (typeof TAB_GROUPS)[number]) =>
        group.tabs
          .filter((t: Tab): t is Tab => validTabs.includes(t))
          .map((t: Tab) => (
            <button key={t}
              className={`inline-block px-3 py-1.5 text-[13px] bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
                tab === t
                  ? "text-accent font-medium border-b-accent"
                  : "text-muted border-b-transparent hover:text-txt"
              }`}
              onClick={() => setTab(t)}>
              {titleForTab(t)}
            </button>
          ))
      )}
    </nav>
  );
}
