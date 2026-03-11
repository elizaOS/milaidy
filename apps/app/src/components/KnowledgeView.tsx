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

import type {
  KnowledgeDocument,
  KnowledgeFragment,
  KnowledgeSearchResult,
  KnowledgeStats,
} from "@milady/app-core/api";
import { client } from "@milady/app-core/api";
import {
  ConfirmDeleteControl,
  formatByteSize,
  formatShortDate,
} from "@milady/app-core/components";
import { Button, Input, SearchBar } from "@milady/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";

const MAX_UPLOAD_REQUEST_BYTES = 32 * 1_048_576; // Must match server knowledge route limit
const BULK_UPLOAD_TARGET_BYTES = 24 * 1_048_576;
const MAX_BULK_REQUEST_DOCUMENTS = 100;
const LARGE_FILE_WARNING_BYTES = 8 * 1_048_576;
const SUPPORTED_UPLOAD_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".pdf",
  ".docx",
  ".json",
  ".csv",
  ".xml",
  ".html",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".gif",
]);
const DIRECTORY_INPUT_ATTRS = {
  webkitdirectory: "",
  directory: "",
} as Record<string, string>;

export type KnowledgeUploadFile = File & {
  webkitRelativePath?: string;
};

type KnowledgeUploadOptions = {
  includeImageDescriptions: boolean;
};

export function getKnowledgeUploadFilename(file: KnowledgeUploadFile): string {
  return file.webkitRelativePath?.trim() || file.name;
}

export function shouldReadKnowledgeFileAsText(
  file: Pick<File, "type" | "name">,
): boolean {
  const textTypes = [
    "text/plain",
    "text/markdown",
    "text/html",
    "text/csv",
    "application/json",
    "application/xml",
  ];

  return (
    textTypes.some((t) => file.type.includes(t)) || file.name.endsWith(".md")
  );
}

function isSupportedKnowledgeFile(file: Pick<File, "name">): boolean {
  const lowerName = file.name.toLowerCase();
  for (const extension of SUPPORTED_UPLOAD_EXTENSIONS) {
    if (lowerName.endsWith(extension)) return true;
  }
  return false;
}

/* ── StatsCard ──────────────────────────────────────────────────────── */

function StatsCard({
  stats,
  loading,
  hasError,
}: {
  stats: KnowledgeStats | null;
  loading: boolean;
  hasError?: boolean;
}) {
  const { t } = useApp();
  return (
    <div className="grid grid-cols-2 gap-4 mb-8 relative z-10">
      <div className="p-5 border border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-md transition-all">
        <div className="text-[11px] font-bold tracking-widest uppercase text-muted mb-2 flex items-center gap-2">
          {t("knowledgeview.Documents")}
          <span className="w-1.5 h-1.5 rounded-full bg-accent/50 blur-[1px]" />
        </div>
        <div className="text-3xl font-bold tracking-tight text-txt bg-gradient-to-br from-txt to-muted bg-clip-text text-transparent">
          {loading ? "—" : hasError ? "—" : (stats?.documentCount ?? 0)}
        </div>
      </div>
      <div className="p-5 border border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl shadow-sm hover:shadow-md transition-all overflow-visible group/card">
        <div className="text-[11px] font-bold tracking-widest uppercase text-muted mb-2 flex items-center gap-2">
          {t("knowledgeview.Fragments")}
          <span className="relative group">
            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-border/50 bg-bg/50 text-[10px] leading-none cursor-help opacity-60 group-hover:opacity-100 transition-all font-mono hover:bg-accent/10 hover:text-accent hover:border-accent/40">
              ?
            </span>
            <span className="pointer-events-none absolute left-0 top-full mt-2 w-64 p-3 rounded-xl bg-card/90 backdrop-blur-md text-txt text-xs normal-case tracking-normal leading-relaxed opacity-0 group-hover:opacity-100 transition-all border border-border/50 shadow-xl translate-y-2 group-hover:translate-y-0 z-50">
              {t("knowledgeview.DocumentsAreSplit")}
            </span>
          </span>
        </div>
        <div className="text-3xl font-bold tracking-tight text-txt bg-gradient-to-br from-txt to-muted bg-clip-text text-transparent">
          {loading ? "—" : hasError ? "—" : (stats?.fragmentCount ?? 0)}
        </div>
      </div>
    </div>
  );
}

/* ── Upload Zone ────────────────────────────────────────────────────── */

function UploadZone({
  onFilesUpload,
  onUrlUpload,
  uploading,
  uploadStatus,
}: {
  onFilesUpload: (
    files: KnowledgeUploadFile[],
    options: KnowledgeUploadOptions,
  ) => void;
  onUrlUpload: (url: string, options: KnowledgeUploadOptions) => void;
  uploading: boolean;
  uploadStatus: { current: number; total: number; filename: string } | null;
}) {
  const { t } = useApp();
  const [dragOver, setDragOver] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [includeImageDescriptions, setIncludeImageDescriptions] =
    useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files) as KnowledgeUploadFile[];
      if (files.length > 0 && !uploading) {
        onFilesUpload(files, { includeImageDescriptions });
      }
    },
    [includeImageDescriptions, onFilesUpload, uploading],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && !uploading) {
        onFilesUpload(Array.from(files) as KnowledgeUploadFile[], {
          includeImageDescriptions,
        });
      }
      e.target.value = "";
    },
    [includeImageDescriptions, onFilesUpload, uploading],
  );

  const handleUrlSubmit = useCallback(() => {
    const url = urlInput.trim();
    if (url && !uploading) {
      onUrlUpload(url, { includeImageDescriptions });
      setUrlInput("");
      setShowUrlInput(false);
    }
  }, [includeImageDescriptions, urlInput, uploading, onUrlUpload]);

  return (
    <div className="mb-8">
      <section
        className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center transition-all duration-300 relative overflow-hidden backdrop-blur-sm ${
          dragOver
            ? "border-accent bg-accent/5 scale-[1.02] shadow-[0_0_30px_rgba(var(--accent),0.15)]"
            : "border-border/40 hover:border-accent/40 bg-card/20 hover:bg-card/40"
        } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        aria-label="Knowledge upload dropzone"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent pointer-events-none opacity-50" />

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".txt,.md,.pdf,.docx,.json,.csv,.xml,.html,.png,.jpg,.jpeg,.webp,.gif"
          onChange={handleFileSelect}
        />
        <input
          {...DIRECTORY_INPUT_ATTRS}
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          accept=".txt,.md,.pdf,.docx,.json,.csv,.xml,.html,.png,.jpg,.jpeg,.webp,.gif"
          onChange={handleFileSelect}
        />
        <div className="text-muted/80 text-sm font-medium mb-4 z-10">
          {uploading ? (
            <span className="text-accent font-bold tracking-wide flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              {uploadStatus
                ? `Uploading ${uploadStatus.current}/${uploadStatus.total}${uploadStatus.filename ? `: ${uploadStatus.filename}` : ""}`
                : "Uploading..."}
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="opacity-70">Drop files/folders here or</span>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-accent hover:underline decoration-accent/30 underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 rounded-sm"
              >
                click to browse
              </button>
            </span>
          )}
        </div>
        <div className="text-[11px] text-muted/60 mb-6 z-10 font-medium tracking-wide bg-black/5 px-4 py-1.5 rounded-full border border-white/5">
          {t("knowledgeview.SupportedPDFMark")}
        </div>
        <div className="flex flex-wrap gap-3 justify-center z-10">
          <Button
            variant="default"
            size="sm"
            className="shadow-md h-9 font-bold tracking-wide hover:shadow-[0_0_15px_rgba(var(--accent),0.3)] transition-all"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {t("knowledgeview.ChooseFiles")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="h-9 font-bold bg-bg/50 border-border/50 hover:border-accent/40 backdrop-blur-md shadow-sm transition-all"
            onClick={() => folderInputRef.current?.click()}
            disabled={uploading}
          >
            {t("knowledgeview.ChooseFolder")}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9 font-bold border-border/50 bg-transparent hover:bg-accent/10 hover:text-accent transition-all hover:border-accent/30 shadow-inner"
            onClick={() => setShowUrlInput(!showUrlInput)}
            disabled={uploading}
          >
            {t("knowledgeview.AddFromURL")}
          </Button>
        </div>
        <label className="mt-8 inline-flex items-center gap-2.5 text-[11px] font-medium text-muted/80 cursor-pointer z-10 hover:text-muted transition-colors px-3 py-1.5 rounded-lg hover:bg-black/5">
          <input
            type="checkbox"
            checked={includeImageDescriptions}
            onChange={(e) => setIncludeImageDescriptions(e.target.checked)}
            disabled={uploading}
            className="accent-accent w-3.5 h-3.5 rounded border-border/50 bg-bg/50 transition-all cursor-pointer"
          />
          {t("knowledgeview.IncludeAIImageDes")}
        </label>
      </section>

      {showUrlInput && (
        <div className="mt-4 p-5 border border-border/40 bg-card/60 backdrop-blur-xl rounded-2xl shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="text-sm font-bold text-txt mb-2 tracking-wide">
            {t("knowledgeview.PasteAURLToImpor")}
          </div>
          <div className="text-[11px] text-muted mb-4 font-medium leading-relaxed bg-black/5 p-3 rounded-xl border border-white/5 inline-block">
            {t("knowledgeview.ImageURLsCanOptio")}
          </div>
          <div className="flex gap-3 relative">
            <Input
              type="url"
              placeholder={t("knowledgeview.httpsExampleCom")}
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleUrlSubmit()}
              disabled={uploading}
              className="flex-1 bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent h-10 rounded-xl transition-all"
            />
            <Button
              variant="default"
              className="h-10 px-6 font-bold shadow-sm"
              onClick={handleUrlSubmit}
              disabled={!urlInput.trim() || uploading}
            >
              {t("knowledgeview.Import")}
            </Button>
          </div>
        </div>
      )}
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
  const { t } = useApp();
  return (
    <div className="mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
      <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
        <h3 className="text-sm font-bold text-txt tracking-wide">
          {t("knowledgeview.SearchResults")}
          <span className="ml-2 text-[11px] text-muted font-mono bg-black/10 px-2 py-0.5 rounded-full border border-white/5">
            {results.length}
          </span>
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-7 text-[11px] font-bold text-muted hover:text-danger hover:bg-danger/10"
        >
          {t("knowledgeview.Clear")}
        </Button>
      </div>
      <div className="space-y-3">
        {results.map((result) => (
          <div
            key={result.id}
            className="p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-xl shadow-sm hover:shadow-md transition-all hover:border-accent/40"
          >
            <div className="flex items-start justify-between gap-3 mb-3">
              <span className="text-[13px] font-bold text-txt truncate">
                {result.documentTitle || "Unknown Document"}
              </span>
              <span className="shrink-0 text-[10px] font-bold tracking-wider px-2 py-1 bg-accent/20 text-accent rounded-md border border-accent/20">
                {(result.similarity * 100).toFixed(0)}%{" "}
                {t("knowledgeview.Match")}
              </span>
            </div>
            <p className="text-sm text-txt/80 line-clamp-3 leading-relaxed">
              {result.text}
            </p>
          </div>
        ))}
        {results.length === 0 && (
          <div className="text-center py-10 text-muted bg-black/5 rounded-xl border border-white/5">
            {t("knowledgeview.NoResultsFound")}
          </div>
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
  const { t } = useApp();
  return (
    <div className="flex items-center justify-between p-4 border border-border/40 bg-card/40 backdrop-blur-md rounded-xl shadow-sm hover:shadow-[0_0_15px_rgba(var(--accent),0.1)] hover:border-accent/50 transition-all group">
      <button
        type="button"
        className="flex-1 min-w-0 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-sm"
        onClick={() => onSelect(doc.id)}
        aria-label={`Open ${doc.filename}`}
      >
        <div className="font-bold text-sm text-txt truncate mb-2 group-hover:text-accent transition-colors">
          {doc.filename}
        </div>
        <div className="flex items-center gap-3 text-xs text-muted/80 font-medium">
          <span className="uppercase tracking-widest text-[10px]">
            {doc.contentType?.split("/").pop()}
          </span>
          <span className="w-1 h-1 rounded-full bg-border/50" />
          <span>{formatByteSize(doc.fileSize)}</span>
          <span className="w-1 h-1 rounded-full bg-border/50" />
          <span>{formatShortDate(doc.createdAt, { fallback: "—" })}</span>
          {doc.source === "youtube" && (
            <>
              <span className="w-1 h-1 rounded-full bg-border/50" />
              <span className="px-2 py-0.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-md text-[10px] font-bold tracking-wider">
                {t("knowledgeview.YouTube")}
              </span>
            </>
          )}
          {doc.source === "url" && (
            <>
              <span className="w-1 h-1 rounded-full bg-border/50" />
              <span className="px-2 py-0.5 bg-accent/10 text-accent border border-accent/20 rounded-md text-[10px] font-bold tracking-wider">
                {t("knowledgeview.URL")}
              </span>
            </>
          )}
        </div>
      </button>
      <div className="flex items-center gap-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity focus-within:opacity-100">
        <ConfirmDeleteControl
          triggerClassName="h-8 px-3 text-xs font-bold text-danger hover:bg-danger/10 hover:text-danger rounded-lg transition-all"
          confirmClassName="h-8 px-3 text-xs font-bold bg-danger/20 text-danger hover:bg-danger/30 rounded-lg transition-all"
          cancelClassName="h-8 px-3 text-xs font-bold text-muted hover:text-txt rounded-lg transition-all"
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
  const { t } = useApp();
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
        setError(
          err instanceof Error ? err.message : "Failed to load document",
        );
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [documentId]);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6 animate-in fade-in duration-200">
      <div className="bg-card/90 border border-border/50 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden backdrop-blur-xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border/30 bg-black/10">
          <h2 className="text-lg font-bold text-txt tracking-wide">
            {loading ? "Loading..." : doc?.filename || "Document"}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-8 w-8 text-muted hover:bg-white/10 hover:text-txt rounded-full transition-all"
          >
            ✕
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {loading && (
            <div className="text-center py-12 text-muted font-bold tracking-wide animate-pulse">
              <span className="inline-block w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin mr-3 align-middle" />
              {t("knowledgeview.Loading")}
            </div>
          )}

          {error && (
            <div className="text-center py-10 bg-danger/10 border border-danger/20 rounded-xl text-danger font-medium mx-auto max-w-lg">
              {error}
            </div>
          )}

          {!loading && !error && doc && (
            <>
              {/* Document info */}
              <div className="mb-8 p-5 bg-black/20 border border-white/5 shadow-inner rounded-xl">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-muted/70">
                      {t("knowledgeview.Type")}
                    </span>{" "}
                    <span className="text-txt font-medium bg-black/20 px-2 py-1 rounded inline-block w-fit">
                      {doc.contentType}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-muted/70">
                      {t("knowledgeview.Source")}
                    </span>{" "}
                    <span className="text-txt font-medium bg-black/20 px-2 py-1 rounded inline-block w-fit">
                      {doc.source}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-muted/70">
                      Size
                    </span>{" "}
                    <span className="text-txt font-medium bg-black/20 px-2 py-1 rounded inline-block w-fit">
                      {formatByteSize(doc.fileSize)}
                    </span>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-bold tracking-widest uppercase text-muted/70">
                      Uploaded
                    </span>{" "}
                    <span className="text-txt font-medium bg-black/20 px-2 py-1 rounded inline-block w-fit">
                      {formatShortDate(doc.createdAt, { fallback: "—" })}
                    </span>
                  </div>
                  {doc.url && (
                    <div className="col-span-full mt-2 pt-4 border-t border-white/5 flex flex-col gap-1.5">
                      <span className="text-[10px] font-bold tracking-widest uppercase text-muted/70">
                        {t("knowledgeview.URL1")}
                      </span>{" "}
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-accent hover:text-accent/80 font-medium underline decoration-accent/30 underline-offset-4 transition-colors break-all"
                      >
                        {doc.url}
                      </a>
                    </div>
                  )}
                </div>
              </div>

              {/* Fragments */}
              <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-2">
                <h3 className="text-sm font-bold tracking-wide text-txt">
                  {t("knowledgeview.Fragments1")}
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-white/10 text-xs text-muted font-mono">
                    {fragments.length}
                  </span>
                </h3>
              </div>
              <div className="space-y-4">
                {fragments.map((fragment, index) => (
                  <div
                    key={fragment.id}
                    className="p-4 bg-card/60 border border-white/5 shadow-sm rounded-xl hover:border-accent/30 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] font-bold tracking-widest uppercase text-muted">
                        {t("knowledgeview.Fragment")} {index + 1}
                      </span>
                      {fragment.position !== undefined && (
                        <span className="text-[10px] text-muted/80 font-mono bg-black/20 px-2 py-0.5 rounded-md border border-white/5">
                          {t("knowledgeview.Position")} {fragment.position}
                        </span>
                      )}
                    </div>
                    <p className="text-[13px] text-txt/90 whitespace-pre-wrap leading-relaxed">
                      {fragment.text}
                    </p>
                  </div>
                ))}
                {fragments.length === 0 && (
                  <div className="text-center py-12 text-muted bg-black/10 rounded-xl border border-dashed border-white/10">
                    {t("knowledgeview.NoFragmentsFound")}
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

export function KnowledgeView({ inModal }: { inModal?: boolean } = {}) {
  const { t } = useApp();
  const { setActionNotice } = useApp();
  const setActionNoticeRef = useRef(setActionNotice);
  setActionNoticeRef.current = setActionNotice;
  const [stats, setStats] = useState<KnowledgeStats | null>(null);
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [searchResults, setSearchResults] = useState<
    KnowledgeSearchResult[] | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{
    current: number;
    total: number;
    filename: string;
  } | null>(null);
  const [searching, setSearching] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isServiceLoading, setIsServiceLoading] = useState(false);
  const serviceRetryRef = useRef(0);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [statsRes, docsRes] = await Promise.all([
        client.getKnowledgeStats(),
        client.listKnowledgeDocuments({ limit: 100 }),
      ]);
      setStats(statsRes);
      setDocuments(docsRes.documents);
      setIsServiceLoading(false);
      serviceRetryRef.current = 0;
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 503) {
        setIsServiceLoading(true);
      } else {
        setIsServiceLoading(false);
        const msg =
          err instanceof Error ? err.message : "Failed to load knowledge data";
        setLoadError(msg);
        setActionNoticeRef.current(msg, "error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData().catch((err) => {
      console.error("[KnowledgeView] Failed to load data:", err);
      setLoading(false);
    });
  }, [loadData]);

  // Auto-retry with exponential backoff when knowledge service is still loading (503)
  useEffect(() => {
    if (!isServiceLoading) {
      serviceRetryRef.current = 0;
      return;
    }
    const attempt = serviceRetryRef.current;
    if (attempt >= 5) {
      setIsServiceLoading(false);
      setLoadError(
        "Knowledge service did not become available. Please reload the page.",
      );
      return;
    }
    const delayMs = 2000 * 1.5 ** attempt; // 2s, 3s, 4.5s, 6.75s, ~10s
    const timer = setTimeout(() => {
      serviceRetryRef.current = attempt + 1;
      loadData();
    }, delayMs);
    return () => clearTimeout(timer);
  }, [isServiceLoading, loadData]);

  const readKnowledgeFile = useCallback(async (file: KnowledgeUploadFile) => {
    const reader = new FileReader();
    return new Promise<string>((resolve, reject) => {
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
          return;
        }

        if (result instanceof ArrayBuffer) {
          const bytes = new Uint8Array(result);
          let binary = "";
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
          }
          resolve(btoa(binary));
          return;
        }

        reject(new Error("Failed to read file"));
      };

      reader.onerror = () => reject(reader.error);

      if (shouldReadKnowledgeFileAsText(file)) {
        reader.readAsText(file);
      } else {
        reader.readAsArrayBuffer(file);
      }
    });
  }, []);

  const buildKnowledgeUploadRequest = useCallback(
    async (file: KnowledgeUploadFile, options: KnowledgeUploadOptions) => {
      const uploadFilename = getKnowledgeUploadFilename(file);
      const content = await readKnowledgeFile(file);

      const request = {
        content,
        filename: uploadFilename,
        contentType: file.type || "application/octet-stream",
        metadata: {
          includeImageDescriptions: options.includeImageDescriptions,
          relativePath: file.webkitRelativePath || undefined,
        },
      };
      const requestBytes = new TextEncoder().encode(
        JSON.stringify(request),
      ).length;
      if (requestBytes > MAX_UPLOAD_REQUEST_BYTES) {
        throw new Error(
          `Upload payload is ${formatByteSize(requestBytes)}, which exceeds the current limit (${formatByteSize(MAX_UPLOAD_REQUEST_BYTES)}).`,
        );
      }

      return {
        filename: uploadFilename,
        request,
        requestBytes,
      };
    },
    [readKnowledgeFile],
  );

  const handleFilesUpload = useCallback(
    async (files: KnowledgeUploadFile[], options: KnowledgeUploadOptions) => {
      const unsupportedFiles = files.filter(
        (file) => !isSupportedKnowledgeFile(file),
      );
      const uploadQueue = files.filter(
        (file) => file.size > 0 && isSupportedKnowledgeFile(file),
      );
      if (uploadQueue.length === 0) {
        setActionNotice(
          unsupportedFiles.length > 0
            ? "No supported non-empty files were selected."
            : "No non-empty files were selected.",
          "info",
          3000,
        );
        return;
      }

      const largeFiles = uploadQueue.filter(
        (file) => file.size >= LARGE_FILE_WARNING_BYTES,
      );
      if (largeFiles.length > 0) {
        const shouldContinue =
          typeof window === "undefined" ||
          window.confirm(
            `${largeFiles.length} large file(s) detected. Uploading can take longer and may increase embedding/vision costs. Continue?`,
          );
        if (!shouldContinue) return;
      }

      const failures: string[] = [];
      const warnings: string[] = [];
      let successful = 0;

      const normalizeUploadError = (err: unknown): string => {
        const message =
          err instanceof Error ? err.message : "Unknown upload error";
        const status = (err as Error & { status?: number })?.status;
        return status === 413 || /maximum size|payload is/i.test(message)
          ? "Upload too large. Try splitting this file."
          : message;
      };

      setUploading(true);
      setUploadStatus({
        current: 0,
        total: uploadQueue.length,
        filename: "Preparing...",
      });

      try {
        type PreparedUpload = {
          filename: string;
          request: {
            content: string;
            filename: string;
            contentType: string;
            metadata: {
              includeImageDescriptions: boolean;
              relativePath: string | undefined;
            };
          };
          requestBytes: number;
        };

        let currentBatch: PreparedUpload[] = [];
        let currentBatchBytes = 0;

        const flushBatch = async () => {
          if (currentBatch.length === 0) return;

          const batchToUpload = currentBatch;
          currentBatch = [];
          currentBatchBytes = 0;

          const batchLabel = batchToUpload[0]?.filename || "batch";
          setUploadStatus({
            current: successful + failures.length,
            total: uploadQueue.length,
            filename: `Uploading batch starting with ${batchLabel}`,
          });

          try {
            const result = await client.uploadKnowledgeDocumentsBulk({
              documents: batchToUpload.map((item) => item.request),
            });

            for (const item of result.results) {
              const batchItem = batchToUpload[item.index];
              const filename =
                item.filename || batchItem?.filename || "document";
              if (item.ok) {
                successful += 1;
                if (item.warnings?.[0]) {
                  warnings.push(`${filename}: ${item.warnings[0]}`);
                }
              } else {
                failures.push(`${filename}: ${item.error || "Upload failed"}`);
              }
            }
          } catch (err) {
            const message = normalizeUploadError(err);
            for (const batchItem of batchToUpload) {
              failures.push(`${batchItem.filename}: ${message}`);
            }
          }
        };

        for (const [index, file] of uploadQueue.entries()) {
          const uploadFilename = getKnowledgeUploadFilename(file);
          setUploadStatus({
            current: index + 1,
            total: uploadQueue.length,
            filename: `Preparing: ${uploadFilename}`,
          });

          try {
            const prepared = await buildKnowledgeUploadRequest(file, options);
            if (
              currentBatch.length > 0 &&
              (currentBatchBytes + prepared.requestBytes >
                BULK_UPLOAD_TARGET_BYTES ||
                currentBatch.length >= MAX_BULK_REQUEST_DOCUMENTS)
            ) {
              await flushBatch();
            }
            currentBatch.push(prepared);
            currentBatchBytes += prepared.requestBytes;
          } catch (err) {
            failures.push(`${uploadFilename}: ${normalizeUploadError(err)}`);
          }
        }

        await flushBatch();

        let refreshFailed = false;
        try {
          await loadData();
        } catch (err) {
          refreshFailed = true;
          console.error("[KnowledgeView] Failed to refresh after upload:", err);
        }

        const skippedSummary =
          unsupportedFiles.length > 0
            ? ` Skipped ${unsupportedFiles.length} unsupported file(s).`
            : "";
        const refreshSummary = refreshFailed
          ? " Uploaded, but failed to refresh document list."
          : "";

        if (
          uploadQueue.length === 1 &&
          successful === 1 &&
          failures.length === 0
        ) {
          const onlyFile = getKnowledgeUploadFilename(uploadQueue[0]);
          const baseMessage = `Uploaded "${onlyFile}"`;
          if (warnings.length > 0) {
            setActionNotice(`${baseMessage}. ${warnings[0]}`, "info", 6000);
          } else if (refreshFailed) {
            setActionNotice(
              `${baseMessage}. Uploaded, but failed to refresh document list.`,
              "info",
              6000,
            );
          } else {
            setActionNotice(baseMessage, "success", 3000);
          }
          return;
        }

        if (failures.length === 0) {
          setActionNotice(
            `Uploaded ${successful}/${uploadQueue.length} files.${warnings.length > 0 ? ` ${warnings[0]}` : ""}${skippedSummary}${refreshSummary}`,
            warnings.length > 0 || refreshFailed || unsupportedFiles.length > 0
              ? "info"
              : "success",
            7000,
          );
          return;
        }

        setActionNotice(
          `Uploaded ${successful}/${uploadQueue.length} files. ${failures.length} failed.${failures.length > 0 ? ` ${failures[0]}` : ""}${skippedSummary}${refreshSummary}`,
          successful > 0 ? "info" : "error",
          7000,
        );
      } finally {
        setUploading(false);
        setUploadStatus(null);
      }
    },
    [buildKnowledgeUploadRequest, loadData, setActionNotice],
  );

  const handleUrlUpload = useCallback(
    async (url: string, options: KnowledgeUploadOptions) => {
      setUploading(true);
      try {
        const result = await client.uploadKnowledgeFromUrl(url, {
          includeImageDescriptions: options.includeImageDescriptions,
        });

        const baseMessage = result.isYouTubeTranscript
          ? `Imported YouTube transcript (${result.fragmentCount} fragments)`
          : `Imported "${result.filename}" (${result.fragmentCount} fragments)`;
        if (result.warnings && result.warnings.length > 0) {
          setActionNotice(
            `${baseMessage}. ${result.warnings[0]}`,
            "info",
            6000,
          );
        } else {
          setActionNotice(baseMessage, "success", 3000);
        }
        loadData();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown import error";
        setActionNotice(`Failed to import from URL: ${message}`, "error", 5000);
      } finally {
        setUploading(false);
      }
    },
    [loadData, setActionNotice],
  );

  const handleSearch = useCallback(
    async (query: string) => {
      setSearching(true);
      try {
        const result = await client.searchKnowledge(query, {
          threshold: 0.3,
          limit: 20,
        });
        setSearchResults(result.results);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown search error";
        setActionNotice(`Search failed: ${message}`, "error", 4000);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    },
    [setActionNotice],
  );

  const handleDelete = useCallback(
    async (documentId: string) => {
      setDeleting(documentId);

      try {
        const result = await client.deleteKnowledgeDocument(documentId);

        if (result.ok) {
          setActionNotice(
            `Deleted document (${result.deletedFragments} fragments removed)`,
            "success",
            3000,
          );
          await loadData();
        } else {
          setActionNotice("Failed to delete document", "error", 4000);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unknown delete error";
        setActionNotice(`Failed to delete document: ${message}`, "error", 5000);
      } finally {
        setDeleting(null);
      }
    },
    [loadData, setActionNotice],
  );

  return (
    <div
      className={
        inModal
          ? "max-w-4xl mx-auto h-full overflow-y-auto pb-8"
          : "max-w-4xl mx-auto"
      }
    >
      {!inModal && (
        <h1 className="text-xl font-semibold text-[var(--txt)] mb-6">
          {t("knowledgeview.KnowledgeBase")}
        </h1>
      )}

      <StatsCard
        stats={stats}
        loading={loading}
        hasError={!!(loadError || isServiceLoading)}
      />

      {isServiceLoading && (
        <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded border border-[var(--border)] bg-[var(--card)] text-sm text-[var(--muted)]">
          <span className="w-4 h-4 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />

          {t("knowledgeview.KnowledgeServiceIs")}
        </div>
      )}

      {loadError && !isServiceLoading && (
        <div className="flex items-center justify-between mb-4 px-3 py-2 rounded border border-[var(--danger)] bg-[var(--danger)]/10 text-sm text-[var(--danger)]">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => loadData()}
            className="ml-3 px-2 py-1 text-xs border border-[var(--danger)] rounded hover:bg-[var(--danger)]/20 transition-colors"
          >
            {t("knowledgeview.Retry")}
          </button>
        </div>
      )}

      <UploadZone
        onFilesUpload={handleFilesUpload}
        onUrlUpload={handleUrlUpload}
        uploading={uploading}
        uploadStatus={uploadStatus}
      />

      <SearchBar onSearch={handleSearch} searching={searching} />

      {searchResults !== null && (
        <SearchResults
          results={searchResults}
          onClear={() => setSearchResults(null)}
        />
      )}

      {/* Document List */}
      <div>
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <h2 className="text-sm font-bold tracking-wide text-txt">
            {t("knowledgeview.Documents1")}
            <span className="ml-2 px-2 py-0.5 rounded-full bg-black/10 text-xs text-muted font-mono">
              {documents.length}
            </span>
          </h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] font-bold border border-transparent shadow-inner hover:bg-accent/10 hover:border-accent/30 hover:text-accent transition-all"
            onClick={() => void loadData()}
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </Button>
        </div>

        {loading && documents.length === 0 && (
          <div className="text-center py-12 text-muted font-bold tracking-wide animate-pulse">
            {t("knowledgeview.LoadingDocuments")}
          </div>
        )}

        {!loading && documents.length === 0 && (
          <div className="text-center py-16 border-2 border-dashed border-border/40 rounded-2xl bg-card/20 backdrop-blur-sm shadow-inner">
            <div className="text-muted/80 font-bold mb-2 tracking-wide text-[15px]">
              {t("knowledgeview.NoDocumentsYet")}
            </div>
            <div className="text-xs text-muted/60 font-medium">
              {t("knowledgeview.UploadFilesOrImpo")}
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
