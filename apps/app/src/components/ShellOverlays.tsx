/**
 * Shared overlay layer rendered once regardless of shell mode.
 *
 * Extracts CommandPalette, EmotePicker, RestartBanner, MemoryDebugPanel,
 * BugReportModal, and the ActionNotice toast that were previously duplicated
 * in both the companion-shell and native-shell branches of App.tsx.
 */

import { BugReportModal } from "./BugReportModal";
import { CommandPalette } from "./CommandPalette";
import { EmotePicker } from "./EmotePicker";
import { MemoryDebugPanel } from "./MemoryDebugPanel";
import { RestartBanner } from "./RestartBanner";
import { ShortcutsOverlay } from "./ShortcutsOverlay";

export interface ActionNotice {
  text: string;
  tone?: "error" | "success" | "info";
}

export function ShellOverlays({
  actionNotice,
}: {
  actionNotice: ActionNotice | null;
}) {
  return (
    <>
      <CommandPalette />
      <EmotePicker />
      <RestartBanner />
      <MemoryDebugPanel />
      <BugReportModal />
      <ShortcutsOverlay />
      {actionNotice && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 px-5 py-2 rounded-lg text-[13px] font-medium z-[10000] text-white ${
            actionNotice.tone === "error"
              ? "bg-danger"
              : actionNotice.tone === "success"
                ? "bg-ok"
                : "bg-accent"
          }`}
        >
          {actionNotice.text}
        </div>
      )}
    </>
  );
}
