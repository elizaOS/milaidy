/**
 * Media Gallery — browse photos, videos, and audio stored in agent databases.
 *
 * Queries known tables for records containing media URLs (image/video/audio
 * file extensions or data URIs). All data flows through the generic database
 * APIs (getDatabaseTables, executeDatabaseQuery).
 */

import { useState, useEffect, useCallback } from "react";
import { client, type QueryResult } from "../api-client";

type MediaType = "all" | "image" | "video" | "audio";

interface MediaItem {
  url: string;
  type: "image" | "video" | "audio";
  filename: string;
  source: string;
  createdAt: string;
}

const IMAGE_EXTS = /\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)(\?|$)/i;
const VIDEO_EXTS = /\.(mp4|webm|mov|avi|mkv|ogv)(\?|$)/i;
const AUDIO_EXTS = /\.(mp3|wav|ogg|flac|aac|m4a|opus)(\?|$)/i;
const DATA_URI_IMG = /^data:image\//i;
const DATA_URI_VID = /^data:video\//i;
const DATA_URI_AUD = /^data:audio\//i;

function classifyUrl(url: string): "image" | "video" | "audio" | null {
  if (IMAGE_EXTS.test(url) || DATA_URI_IMG.test(url)) return "image";
  if (VIDEO_EXTS.test(url) || DATA_URI_VID.test(url)) return "video";
  if (AUDIO_EXTS.test(url) || DATA_URI_AUD.test(url)) return "audio";
  return null;
}

function filenameFromUrl(url: string): string {
  try {
    const path = new URL(url, "https://placeholder").pathname;
    const segments = path.split("/").filter(Boolean);
    return segments[segments.length - 1] || "media";
  } catch {
    return "media";
  }
}

const FILTER_CHIPS: { id: MediaType; label: string }[] = [
  { id: "all", label: "All" },
  { id: "image", label: "Images" },
  { id: "video", label: "Video" },
  { id: "audio", label: "Audio" },
];

/** Extract media URLs from arbitrary row data by scanning all string values. */
function extractMediaFromRows(rows: Record<string, unknown>[], tableName: string): MediaItem[] {
  const items: MediaItem[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const createdAt = String(row.createdAt ?? row.created_at ?? row.timestamp ?? "");
    for (const val of Object.values(row)) {
      if (typeof val !== "string") continue;

      // Try parsing as JSON content field (ElizaOS memories store JSON in content)
      const urls = extractUrlsFromValue(val);
      for (const url of urls) {
        const mediaType = classifyUrl(url);
        if (mediaType && !seen.has(url)) {
          seen.add(url);
          items.push({
            url,
            type: mediaType,
            filename: filenameFromUrl(url),
            source: tableName,
            createdAt,
          });
        }
      }
    }
  }
  return items;
}

/** Pull URLs out of a string value — handles plain URLs and JSON blobs. */
function extractUrlsFromValue(val: string): string[] {
  const urls: string[] = [];

  // If it looks like JSON, parse it and search recursively
  if (val.startsWith("{") || val.startsWith("[")) {
    try {
      const parsed = JSON.parse(val);
      collectStrings(parsed, urls);
      return urls;
    } catch {
      // not JSON, fall through to regex
    }
  }

  // Plain URL match
  const urlRegex = /https?:\/\/[^\s"'<>]+/gi;
  const matches = val.match(urlRegex);
  if (matches) urls.push(...matches);

  // Data URI match
  if (val.startsWith("data:")) urls.push(val);

  return urls;
}

function collectStrings(obj: unknown, out: string[]) {
  if (typeof obj === "string") {
    if (obj.startsWith("http") || obj.startsWith("data:")) out.push(obj);
    return;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectStrings(item, out);
    return;
  }
  if (obj && typeof obj === "object") {
    for (const v of Object.values(obj)) collectStrings(v, out);
  }
}

export function MediaGalleryView() {
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<MediaType>("all");
  const [search, setSearch] = useState("");
  const [lightboxItem, setLightboxItem] = useState<MediaItem | null>(null);

  const loadMedia = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      // Discover tables
      const { tables } = await client.getDatabaseTables();
      const allMedia: MediaItem[] = [];

      // Scan tables likely to contain media: memories, messages, media, attachments, files
      const mediaTableNames = tables
        .map((t) => t.name)
        .filter((name) => {
          const n = name.toLowerCase();
          return (
            n.includes("memor") ||
            n.includes("message") ||
            n.includes("media") ||
            n.includes("attach") ||
            n.includes("file") ||
            n.includes("asset") ||
            n.includes("document")
          );
        });

      // If no likely tables found, scan all tables with modest limits
      const tablesToScan = mediaTableNames.length > 0 ? mediaTableNames : tables.map((t) => t.name);
      const scanLimit = mediaTableNames.length > 0 ? 500 : 100;

      for (const tableName of tablesToScan.slice(0, 10)) {
        try {
          const result: QueryResult = await client.executeDatabaseQuery(
            `SELECT * FROM "${tableName}" LIMIT ${scanLimit}`,
          );
          const items = extractMediaFromRows(result.rows, tableName);
          allMedia.push(...items);
        } catch {
          // skip tables that fail
        }
      }

      // Sort by date descending
      allMedia.sort((a, b) => {
        if (!a.createdAt && !b.createdAt) return 0;
        if (!a.createdAt) return 1;
        if (!b.createdAt) return -1;
        return b.createdAt.localeCompare(a.createdAt);
      });

      setMedia(allMedia);
    } catch (err) {
      setError(`Failed to load media: ${err instanceof Error ? err.message : "error"}`);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadMedia();
  }, [loadMedia]);

  const filtered = media.filter((m) => {
    if (filter !== "all" && m.type !== filter) return false;
    if (search && !m.filename.toLowerCase().includes(search.toLowerCase()) && !m.url.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <input
          type="text"
          placeholder="Search media..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-xs w-[200px]"
        />
        <div className="flex gap-1">
          {FILTER_CHIPS.map((chip) => (
            <button
              key={chip.id}
              className={`px-3 py-1 text-xs cursor-pointer border transition-colors ${
                filter === chip.id
                  ? "bg-[var(--accent)] text-[var(--accent-foreground)] border-[var(--accent)]"
                  : "bg-transparent text-[var(--muted)] border-[var(--border)] hover:text-[var(--txt)]"
              }`}
              onClick={() => setFilter(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <span className="text-[11px] text-[var(--muted)] ml-auto">
          {filtered.length} item{filtered.length !== 1 ? "s" : ""}
        </span>
      </div>

      {error && (
        <div className="p-2.5 border border-[var(--danger)] text-[var(--danger)] text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[var(--muted)] text-sm italic">Scanning for media...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-[var(--muted)] text-sm mb-2">No media found</div>
          <div className="text-[var(--muted)] text-xs">
            {media.length === 0
              ? "No images, videos, or audio files were detected in the database."
              : "No items match the current filter."}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {filtered.map((item, i) => (
            <button
              key={`${item.url}-${i}`}
              className="bg-[var(--card)] border border-[var(--border)] p-0 cursor-pointer text-left hover:border-[var(--accent)] transition-colors group"
              onClick={() => setLightboxItem(item)}
            >
              {/* Thumbnail area */}
              <div className="w-full aspect-square bg-[var(--bg)] flex items-center justify-center overflow-hidden">
                {item.type === "image" ? (
                  <img
                    src={item.url}
                    alt={item.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                      (e.target as HTMLImageElement).parentElement!.innerHTML =
                        '<span style="font-size:24px">🖼</span>';
                    }}
                  />
                ) : item.type === "video" ? (
                  <span className="text-2xl opacity-50">🎬</span>
                ) : (
                  <span className="text-2xl opacity-50">🎵</span>
                )}
              </div>
              {/* Info */}
              <div className="p-2">
                <div className="text-[11px] text-[var(--txt)] truncate">{item.filename}</div>
                <div className="flex items-center gap-1 mt-1">
                  <span className={`text-[9px] px-1.5 py-0.5 uppercase font-bold ${
                    item.type === "image"
                      ? "bg-blue-500/20 text-blue-400"
                      : item.type === "video"
                        ? "bg-purple-500/20 text-purple-400"
                        : "bg-green-500/20 text-green-400"
                  }`}>
                    {item.type}
                  </span>
                  <span className="text-[9px] text-[var(--muted)] truncate">{item.source}</span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox modal */}
      {lightboxItem && (
        <div
          className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-8"
          onClick={() => setLightboxItem(null)}
        >
          <div
            className="bg-[var(--card)] border border-[var(--border)] max-w-[90vw] max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
              <div className="text-xs text-[var(--txt)] font-medium truncate mr-4">
                {lightboxItem.filename}
              </div>
              <button
                className="text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border-0 cursor-pointer text-lg px-2"
                onClick={() => setLightboxItem(null)}
              >
                ×
              </button>
            </div>
            {/* Content */}
            <div className="p-4 flex items-center justify-center min-h-[200px]">
              {lightboxItem.type === "image" ? (
                <img
                  src={lightboxItem.url}
                  alt={lightboxItem.filename}
                  className="max-w-full max-h-[70vh] object-contain"
                />
              ) : lightboxItem.type === "video" ? (
                <video
                  src={lightboxItem.url}
                  controls
                  className="max-w-full max-h-[70vh]"
                >
                  <track kind="captions" />
                </video>
              ) : (
                <audio src={lightboxItem.url} controls className="w-full max-w-[400px]">
                  <track kind="captions" />
                </audio>
              )}
            </div>
            {/* Footer info */}
            <div className="p-3 border-t border-[var(--border)] text-[11px] text-[var(--muted)] flex gap-4">
              <span>Type: {lightboxItem.type}</span>
              <span>Source: {lightboxItem.source}</span>
              {lightboxItem.createdAt && <span>Date: {lightboxItem.createdAt}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
