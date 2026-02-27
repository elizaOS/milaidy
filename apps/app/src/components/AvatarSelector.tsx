/**
 * Reusable avatar/character VRM selector.
 *
 * Shows a single row of the 8 built-in milady VRMs as thumbnail images.
 * The selected avatar gets a highlight ring. No text labels.
 * Supports drag-and-drop for custom VRM uploads.
 */

import { useCallback, useRef, useState } from "react";
import { getVrmPreviewUrl, VRM_COUNT } from "../AppContext";

export interface AvatarSelectorProps {
  /** Currently selected index (1-8 for built-in, 0 for custom) */
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

function isVrmFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".vrm");
}

export function AvatarSelector({
  selected,
  onSelect,
  onUpload,
  showUpload = true,
  fullWidth = false,
}: AvatarSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleVrmFile = useCallback(
    (file: File) => {
      if (!isVrmFile(file)) {
        alert("Please select a .vrm file");
        return;
      }
      onUpload?.(file);
      onSelect(0);
    },
    [onUpload, onSelect],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleVrmFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleVrmFile(file);
    },
    [handleVrmFile],
  );

  const avatarIndices = Array.from({ length: VRM_COUNT }, (_, i) => i + 1);
  const containerClass = fullWidth
    ? "grid gap-3 w-full"
    : "flex flex-wrap gap-3 justify-start";
  const containerStyle = fullWidth
    ? { gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))" }
    : undefined;
  const avatarButtonClass = fullWidth
    ? "relative w-full aspect-square shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all"
    : "relative w-24 h-24 shrink-0 rounded-lg overflow-hidden cursor-pointer transition-all";
  const uploadButtonClass = fullWidth
    ? "w-full aspect-square shrink-0 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer transition-all"
    : "w-24 h-24 shrink-0 rounded-lg border-2 flex flex-col items-center justify-center cursor-pointer transition-all";

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

        {/* Upload custom VRM — click or drag-and-drop */}
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
                dragOver
                  ? "border-[var(--accent)] bg-[var(--accent)]/20 text-[var(--accent)] scale-105 border-solid"
                  : selected === 0
                    ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)] ring-2 ring-[var(--accent)] ring-offset-2 ring-offset-[var(--card)] scale-105 border-solid"
                    : "border-[var(--border)] text-[var(--muted)] opacity-60 hover:opacity-100 hover:border-[var(--accent)] hover:scale-105 border-dashed"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              title="Upload custom .vrm (click or drag)"
              type="button"
            >
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-label="Upload VRM"
              >
                <title>Upload VRM</title>
                {dragOver ? (
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5-5 5 5M12 5v10" />
                ) : (
                  <path d="M12 5v14m-7-7h14" />
                )}
              </svg>
              {dragOver && (
                <span className="text-[10px] mt-1 font-medium">drop .vrm</span>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
