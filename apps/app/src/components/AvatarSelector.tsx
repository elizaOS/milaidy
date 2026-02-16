/**
 * Reusable avatar/character VRM selector.
 *
 * Shows a single row/grid of bundled VRM avatars as thumbnail images.
 * The selected avatar gets a highlight ring. No text labels.
 */

import { useRef } from "react";
import { VRM_COUNT, getVrmPreviewUrl } from "../AppContext";

export interface AvatarSelectorProps {
  /** Currently selected index (1-N for bundled, 0 for custom) */
  selected: number;
  /** Called when a built-in avatar is selected */
  onSelect: (index: number) => void;
  /** Called when a custom VRM is uploaded */
  onUpload?: (file: File) => void;
  /** Whether to show the upload option */
  showUpload?: boolean;
  /** Expand selector to fill row width with responsive tile sizes */
  fullWidth?: boolean;
}

export function AvatarSelector({
  selected,
  onSelect,
  onUpload,
  showUpload = true,
  fullWidth = false,
}: AvatarSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateVrmFile = async (file: File): Promise<string | null> => {
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer.slice(0, 32));
      const textHeader = new TextDecoder().decode(bytes);
      if (textHeader.startsWith("version https://git-lfs.github.com/spec/v1")) {
        return "This .vrm is a Git LFS pointer, not the real model file. Export/download the actual VRM binary.";
      }
      const isGlbMagic =
        bytes.length >= 4 &&
        bytes[0] === 0x67 && // g
        bytes[1] === 0x6c && // l
        bytes[2] === 0x54 && // T
        bytes[3] === 0x46; // F
      if (!isGlbMagic) {
        return "Invalid VRM file. Please select a valid .vrm binary.";
      }
      return null;
    } catch {
      return "Could not read the selected file. Please try another .vrm.";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith(".vrm")) {
      alert("Please select a .vrm file");
      e.target.value = "";
      return;
    }
    void (async () => {
      const validationError = await validateVrmFile(file);
      if (validationError) {
        alert(validationError);
        e.target.value = "";
        return;
      }
      onUpload?.(file);
      onSelect(0); // 0 = custom
      e.target.value = "";
    })();
  };

  const avatarIndices = Array.from({ length: VRM_COUNT }, (_, i) => i + 1);
  const containerClass = fullWidth ? "grid gap-3 w-full" : "flex flex-wrap gap-3 justify-start";
  const containerStyle = fullWidth ? { gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" } : undefined;
  const avatarButtonClass = fullWidth
    ? "relative w-full aspect-square shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all"
    : "relative w-24 h-24 shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all";
  const uploadButtonClass = fullWidth
    ? "w-full aspect-square shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all"
    : "w-24 h-24 shrink-0 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer transition-all";

  return (
    <div className={fullWidth ? "w-full" : undefined}>
      <div className={containerClass} style={containerStyle}>
        {avatarIndices.map((i) => (
          <button
            key={i}
            className={`${avatarButtonClass} ${
              selected === i
                ? "ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                : "opacity-60 hover:opacity-100 hover:scale-105"
            }`}
            onClick={() => onSelect(i)}
            type="button"
          >
            <img
              src={getVrmPreviewUrl(i)}
              alt={`Avatar ${i}`}
              className="w-full h-full object-cover"
            />
          </button>
        ))}

        {/* Upload custom VRM */}
        {showUpload && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".vrm"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className={`${uploadButtonClass} ${
                selected === 0
                  ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105"
                  : "border-[var(--border)] text-[var(--muted)] opacity-60 hover:opacity-100 hover:border-[var(--accent)] hover:scale-105"
              }`}
              onClick={() => fileInputRef.current?.click()}
              title="Upload custom .vrm"
              type="button"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14m-7-7h14" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
