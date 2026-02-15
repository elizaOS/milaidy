/**
 * Knowledge management view — upload, search, and manage knowledge documents.
 *
 * Features:
 * - Stats display (document count, fragment count)
 * - Document upload (file picker + drag-and-drop)
 * - URL upload (with YouTube auto-transcription)
 * - Search across knowledge base
 * - Document list with delete functionality
 * - Document detail view with fragments
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { client } from "../api-client";
import type {
  KnowledgeDocument,
  KnowledgeFragment,
  KnowledgeSearchResult,
  KnowledgeStats,
} from "../api-client";
import { ConfirmDeleteControl } from "./shared/confirm-delete-control";
import { formatByteSize, formatShortDate } from "./shared/format";

/* ── Shared style constants ─────────────────────────────────────────── */

const inputCls =
  "w-full px-3 py-2 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-sm focus:border-[var(--accent)] focus:outline-none rounded";
const btnPrimary =
  "px-4 py-2 text-sm font-medium bg-[var(--accent)] text-[var(--accent-foreground)] border border-[var(--accent)] cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default rounded";
const btnGhost =
  "px-3 py-1.5 text-xs bg-transparent text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:text-[var(--txt)] hover:border-[var(--txt)] transition-colors disabled:opacity-40 disabled:cursor-default rounded";
const btnDanger =
  "px-2 py-1 text-[11px] bg-transparent text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:text-[#e74c3c] hover:border-[#e74c3c] transition-colors rounded";

/* ── Stats Card ─────────────────────────────────────────────────────── */

function StatsCard({ stats, loading }: { stats: KnowledgeStats | null; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-4 mb-6">
      <div className="p-4 border border-[var(--border)] bg-[var(--card)] rounded">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1">
          Documents
        </div>
        <div className="text-2xl font-semibold text-[var(--txt)]">
          {loading ? "—" : stats?.documentCount ?? 0}
        </div>
      </div>
      <div className="p-4 border border-[var(--border)] bg-[var(--card)] rounded overflow-visible">
        <div className="text-[11px] uppercase tracking-wider text-[var(--muted)] mb-1 flex items-center gap-1">
          Fragments
          <span className="relative group">
            <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full border border-[var(--muted)] text-[9px] leading-none cursor-help opacity-60 group-hover:opacity-100 transition-opacity">
              ?
            </span>
            <span className="pointer-events-none absolute left-0 top-full mt-1.5 w-52 px-2.5 py-1.5 rounded bg-[var(--bg-elevated)] text-[var(--text-strong)] text-[11px] normal-case tracking-normal leading-snug opacity-0 group-hover:opacity-100 transition-opacity border border-[var(--border-strong)] shadow-md">
              Documents are split into smaller text chunks called fragments, tasty snacks for agents, yumm
            </span>
          </span>
        </div>
        <div className="text-2xl font-semibold text-[var(--txt)]">
          {loading ? "—" : stats?.fragmentCount ?? 0}
        </div>
      </div>
    </div>
  );
}

/* ── Upload Zone ────────────────────────────────────────────────────── */

function UploadZone({
  onFileUpload,
  onUrlUpload,
  uploading,
}: {
  onFileUpload: (file: File) => void;
  onUrlUpload: (url: string) => void;
  uploading: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0 && !uploading) {
        onFileUpload(files[0]);
      }
    },
    [onFileUpload, uploading],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && !uploading) {
        onFileUpload(files[0]);
      }
      e.target.value = "";
    },
    [onFileUpload, uploading],
  );

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim();
    if (url && !uploading) {
      onUrlUpload(url);
      setUrlInput("");
      setShowUrlInput(false);
    }
  }, [urlInput, uploading, onUrlUpload]);

  return (
    <div className="mb-6">
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          dragOver
            ? "border-[var(--accent)] bg-[var(--accent)]/5"
            : "border-[var(--border)] hover:border-[var(--muted)]"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".txt,.md,.pdf,.docx,.json,.csv,.xml,.html"
          onChange={handleFileSelect}
        />
        <div className="text-[var(--muted)] mb-3">
          {uploading ? (
            <span className="text-[var(--accent)]">Uploading...</span>
          ) : (
            <>Drop files here or click to browse</>
          )}
        </div>
        <div className="text-[11px] text-[var(--muted)] mb-4">
          Supported: PDF, Markdown, Text, DOCX, JSON, CSV, XML, HTML
        </div>
        <div className="flex gap-3 justify-center">
          <button
            type="button"
            className={btnPrimary}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            Choose File
          </button>
          <button
            type="button"
            className={btnGhost}
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={uploading}
          >
            Add from URL
          </button>
        </div>
      </div>

      {showUrlInput && (
        <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)] rounded">
          <div className="text-xs text-[var(--muted)] mb-2">
            Paste a URL to import content. YouTube links will be auto-transcribed.
          </div>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://example.com/document.pdf or YouTube URL"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              className={inputCls}
              disabled={uploading}
            />
            <button
              type="button"
              className={btnPrimary}
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim() || uploading}
            >
              Import
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Search Bar ─────────────────────────────────────────────────────── */

function SearchBar({
  onSearch,
  searching,
}: {
  onSearch: (query: string) => void;
  searching: boolean;
}) {
  const [query, setQuery] = useState("");

  const handleSubmit = useCallback(() => {
    if (query.trim()) {
      onSearch(query.trim());
    }
  }, [query, onSearch]);

  return (
    <div className="mb-6">
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Search knowledge..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          className={inputCls}
          disabled={searching}
        />
        <button
          type="button"
          className={btnPrimary}
          onClick={handleSubmit}
          disabled={!query.trim() || searching}
        >
          {searching ? "Searching..." : "Search"}
        </button>
      </div>
    </div>
  );
}

/* ── Search Results ─────────────────────────────────────────────────── */

function SearchResults({
  results,
  onClear,
}: {
  results: KnowledgeSearchResult[];
  onClear: () => void;
}) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-[var(--txt)]">
          Search Results ({results.length})
        </h3>
        <button type="button" className={btnGhost} onClick={onClear}>
          Clear
        </button>
      </div>
      <div className="space-y-2">
        {results.map((result) => (
          <div
            key={result.id}
            className="p-3 border border-[var(--border)] bg-[var(--card)] rounded"
          >
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs text-[var(--muted)]">
                {result.documentTitle || "Unknown Document"}
              </span>
              <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded">
                {(result.similarity * 100).toFixed(0)}% match
              </span>
            </div>
            <p className="text-sm text-[var(--txt)] line-clamp-3">{result.text}</p>
          </div>
        ))}
        {results.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)]">No results found</div>
        )}
      </div>
    </div>
  );
}

/* ── Document Card ──────────────────────────────────────────────────── */

function DocumentCard({
  doc,
  onSelect,
  onDelete,
  deleting,
}: {
  doc: KnowledgeDocument;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  deleting: boolean;
}) {
  return (
    <div className="flex items-center justify-between p-4 border border-[var(--border)] bg-[var(--card)] rounded hover:border-[var(--accent)]/50 transition-colors">
      <div
        className="flex-1 min-w-0 cursor-pointer"
        onClick={() => onSelect(doc.id)}
      >
        <div className="font-medium text-sm text-[var(--txt)] truncate mb-1">
          {doc.filename}
        </div>
        <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>{doc.contentType}</span>
          <span>{formatByteSize(doc.fileSize)}</span>
          <span>{formatShortDate(doc.createdAt, { fallback: "—" })}</span>
          {doc.source === "youtube" && (
            <span className="px-1.5 py-0.5 bg-[#e74c3c]/10 text-[#e74c3c] rounded text-[10px]">
              YouTube
            </span>
          )}
          {doc.source === "url" && (
            <span className="px-1.5 py-0.5 bg-[var(--accent)]/10 text-[var(--accent)] rounded text-[10px]">
              URL
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2 ml-4">
        <ConfirmDeleteControl
          triggerClassName={btnDanger}
          confirmClassName={btnDanger}
          cancelClassName={btnGhost}
          disabled={deleting}
          busyLabel="..."
          onConfirm={() => onDelete(doc.id)}
        />
      </div>
    </div>
  );
}

/* ── Document Detail Modal ──────────────────────────────────────────── */

function DocumentDetailModal({
  documentId,
  onClose,
}: {
  documentId: string;
  onClose: () => void;
}) {
  const [doc, setDoc] = useState<KnowledgeDocument | null>(null);
  const [fragments, setFragments] = useState<KnowledgeFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const [docRes, fragRes] = await Promise.all([
        client.getKnowledgeDocument(documentId),
        client.getKnowledgeFragments(documentId),
      ]);

      if (cancelled) return;

      setDoc(docRes.document);
      setFragments(fragRes.fragments);
      setLoading(false);
    }

    load().catch((err) => {
      if (!cancelled) {
        setError(err instanceof Error ? err.message : "Failed to load document");
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[var(--border)]">
          <h2 className="text-lg font-medium text-[var(--txt)]">
            {loading ? "Loading..." : doc?.filename || "Document"}
          </h2>
          <button type="button" className={btnGhost} onClick={onClose}>
            Close
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && (
            <div className="text-center py-8 text-[var(--muted)]">Loading...</div>
          )}

          {error && (
            <div className="text-center py-8 text-[#e74c3c]">{error}</div>
          )}

          {!loading && !error && doc && (
            <>
              {/* Document info */}
              <div className="mb-6 p-4 bg-[var(--card)] border border-[var(--border)] rounded">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-[var(--muted)]">Type:</span>{" "}
                    <span className="text-[var(--txt)]">{doc.contentType}</span>
                  </div>
                  <div>
                    <span className="text-[var(--muted)]">Source:</span>{" "}
                    <span className="text-[var(--txt)]">{doc.source}</span>
                  </div>
                  {doc.url && (
                    <div className="col-span-2">
                      <span className="text-[var(--muted)]">URL:</span>{" "}
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--accent)] hover:underline"
                      >
                        {doc.url}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Fragments */}
              <h3 className="text-sm font-medium text-[var(--txt)] mb-3">
                Fragments ({fragments.length})
              </h3>
              <div className="space-y-3">
                {fragments.map((fragment, index) => (
                  <div
                    key={fragment.id}
                    className="p-3 bg-[var(--card)] border border-[var(--border)] rounded"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-[var(--muted)]">
                        Fragment {index + 1}
                      </span>
                      {fragment.position !== undefined && (
                        <span className="text-[10px] text-[var(--muted)]">
                          Position: {fragment.position}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--txt)] whitespace-pre-wrap">
                      {fragment.text}
                    </p>
                  </div>
                ))}
                {fragments.length === 0 && (
                  <div className="text-center py-4 text-[var(--muted)]">
                    No fragments found
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Main KnowledgeView Component ───────────────────────────────────── */

export function KnowledgeView() {
  const { setActionNotice } = useApp();
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [statsRes, docsRes] = await Promise.all([
      client.getKnowledgeStats(),
      client.listKnowledgeDocuments({ limit: 100 }),
    ]);
    setStats(statsRes);
    setDocuments(docsRes.documents);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("[KnowledgeView] Failed to load data:", err);
      setLoading(false);
    });
  }, [loadData]);

  const handleFileUpload = useCallback(
    async (file: File) => {
      setUploading(true);

      // Read file content
      const reader = new FileReader();
      const content = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result;
          if (typeof result === "string") {
            // For text files
            resolve(result);
          } else if (result instanceof ArrayBuffer) {
            // For binary files (PDF, DOCX), convert to base64
            const bytes = new Uint8Array(result);
            let binary = "";
            for (let i = 0; i < bytes.byteLength; i++) {
              binary += String.fromCharCode(bytes[i]);
            }
            resolve(btoa(binary));
          } else {
            reject(new Error("Failed to read file"));
          }
        };
        reader.onerror = () => reject(reader.error);

        // Read as text for text-based files, binary for others
        const textTypes = [
          "text/plain",
          "text/markdown",
          "text/html",
          "text/csv",
          "application/json",
          "application/xml",
        ];
        if (textTypes.some((t) => file.type.includes(t)) || file.name.endsWith(".md")) {
          reader.readAsText(file);
        } else {
          reader.readAsArrayBuffer(file);
        }
      });

      const result = await client.uploadKnowledgeDocument({
        content,
        filename: file.name,
        contentType: file.type || "application/octet-stream",
      });

      setUploading(false);

      if (result.ok) {
        setActionNotice(
          `Uploaded "${file.name}" (${result.fragmentCount} fragments)`,
          "success",
          3000,
        );
        loadData();
      } else {
        setActionNotice("Failed to upload document", "error", 4000);
      }
    },
    [loadData, setActionNotice],
  );

  const handleUrlUpload = useCallback(
    async (url: string) => {
      setUploading(true);

      const result = await client.uploadKnowledgeFromUrl(url);

      setUploading(false);

      if (result.ok) {
        const message = result.isYouTubeTranscript
          ? `Imported YouTube transcript (${result.fragmentCount} fragments)`
          : `Imported "${result.filename}" (${result.fragmentCount} fragments)`;
        setActionNotice(message, "success", 3000);
        loadData();
      } else {
        setActionNotice("Failed to import from URL", "error", 4000);
      }
    },
    [loadData, setActionNotice],
  );

  const handleSearch = useCallback(async (query: string) => {
    setSearching(true);
    const result = await client.searchKnowledge(query, { threshold: 0.3, limit: 20 });
    setSearchResults(result.results);
    setSearching(false);
  }, []);

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeleting(documentId);

      const result = await client.deleteKnowledgeDocument(documentId);

      setDeleting(null);

      if (result.ok) {
        setActionNotice(
          `Deleted document (${result.deletedFragments} fragments removed)`,
          "success",
          3000,
        );
        loadData();
      } else {
        setActionNotice("Failed to delete document", "error", 4000);
      }
    },
    [loadData, setActionNotice],
  );

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold text-[var(--txt)] mb-6">Knowledge Base</h1>

      <StatsCard stats={stats} loading={loading} />

      <UploadZone
        onFileUpload={handleFileUpload}
        onUrlUpload={handleUrlUpload}
        uploading={uploading}
      />

      <SearchBar onSearch={handleSearch} searching={searching} />

      {searchResults !== null && (
        <SearchResults results={searchResults} onClear={() => setSearchResults(null)} />
      )}

      {/* Document List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-[var(--txt)]">
            Documents ({documents.length})
          </h2>
          <button
            type="button"
            className={btnGhost}
            onClick={() => loadData()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        {loading && documents.length === 0 && (
          <div className="text-center py-8 text-[var(--muted)]">Loading documents...</div>
        )}

        {!loading && documents.length === 0 && (
          <div className="text-center py-12 border border-dashed border-[var(--border)] rounded-lg">
            <div className="text-[var(--muted)] mb-2">No documents yet</div>
            <div className="text-xs text-[var(--muted)]">
              Upload files or import from URL to get started
            </div>
          </div>
        )}

        <div className="space-y-2">
          {documents.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onSelect={setSelectedDocId}
              onDelete={handleDelete}
              deleting={deleting === doc.id}
            />
          ))}
        </div>
      </div>

      {/* Document Detail Modal */}
      {selectedDocId && (
        <DocumentDetailModal
          documentId={selectedDocId}
          onClose={() => setSelectedDocId(null)}
        />
      )}
    </div>
  );
}
