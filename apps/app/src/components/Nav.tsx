import { useApp } from "../AppContext.js";
import { TAB_GROUPS } from "../navigation";

export function Nav() {
  const { tab, setTab } = useApp();

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
            {group.label}
          </button>
        );
      })}
    </nav>
  );
}
