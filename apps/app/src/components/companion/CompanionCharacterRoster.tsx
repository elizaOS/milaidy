import type { RefObject } from "react";
import type { AppState } from "../../AppContext";
import type { TranslatorFn } from "./walletUtils";

export type RosterItem = {
  index: number;
  previewUrl: string;
  title: string;
};

export function CompanionCharacterRoster({
  rosterItems,
  selectedVrmIndex,
  safeSelectedVrmIndex,
  characterRosterOpen,
  setState,
  handleRosterVrmUpload,
  handleBgUpload,
  vrmFileInputRef,
  bgFileInputRef,
  t,
}: {
  rosterItems: RosterItem[];
  selectedVrmIndex: number;
  safeSelectedVrmIndex: number;
  characterRosterOpen: boolean;
  setState: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
  handleRosterVrmUpload: (file: File) => void;
  handleBgUpload: (file: File) => void;
  vrmFileInputRef: RefObject<HTMLInputElement | null>;
  bgFileInputRef: RefObject<HTMLInputElement | null>;
  t: TranslatorFn;
}) {
  return (
    <div
      id="anime-character-roster"
      className={`anime-character-panel-shell ${characterRosterOpen ? "is-open" : ""}`}
    >
      <div className="anime-roster anime-comp-character-panel glass-panel">
        {selectedVrmIndex === 0 && (
          <div className="text-xs text-accent mt-1 mb-2">
            {t("companion.customVrmActive")}
          </div>
        )}
        <div className="anime-roster-list">
          {rosterItems.map((item) => {
            const active =
              selectedVrmIndex !== 0 && item.index === safeSelectedVrmIndex;
            return (
              <button
                key={item.index}
                type="button"
                className={`anime-roster-item ${active ? "is-active" : ""}`}
                onClick={() => setState("selectedVrmIndex", item.index)}
              >
                <img
                  src={item.previewUrl}
                  alt={item.title}
                  className="anime-roster-img"
                />
                <div className="anime-roster-meta">
                  <span className="anime-roster-name">{item.title}</span>
                </div>
              </button>
            );
          })}
          {/* Upload custom VRM */}
          <input
            ref={vrmFileInputRef}
            type="file"
            accept=".vrm"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleRosterVrmUpload(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            className={`anime-roster-item ${selectedVrmIndex === 0 ? "is-active" : ""}`}
            onClick={() => vrmFileInputRef.current?.click()}
            title="Upload custom .vrm"
          >
            <div
              className="anime-roster-img"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Upload VRM</title>
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </div>
            <div className="anime-roster-meta">
              <span className="anime-roster-name">Custom</span>
            </div>
          </button>
        </div>
        {/* Upload custom background */}
        <input
          ref={bgFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleBgUpload(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          className="text-xs text-muted hover:text-accent mt-2 flex items-center gap-1"
          onClick={() => bgFileInputRef.current?.click()}
          title="Upload custom background image"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <title>Upload Background</title>
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <path d="M21 15l-5-5L5 21" />
          </svg>
          Change Background
        </button>
      </div>
    </div>
  );
}
