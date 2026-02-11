import type http from "node:http";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";

export interface KnowledgeRouteHelpers {
  json: (res: http.ServerResponse, data: object, status?: number) => void;
  error: (res: http.ServerResponse, message: string, status?: number) => void;
  readJsonBody: <T extends object>(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) => Promise<T | null>;
}

export interface KnowledgeRouteContext extends KnowledgeRouteHelpers {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  method: string;
  pathname: string;
  url: URL;
  runtime: AgentRuntime | null;
}

interface KnowledgeServiceLike {
  addKnowledge(options: {
    agentId?: UUID;
    worldId: UUID;
    roomId: UUID;
    entityId: UUID;
    clientDocumentId: UUID;
    contentType: string;
    originalFilename: string;
    content: string;
    metadata?: Record<string, unknown>;
  }): Promise<{
    clientDocumentId: string;
    storedDocumentMemoryId: UUID;
    fragmentCount: number;
  }>;
  getKnowledge(
    message: Memory,
    scope?: { roomId?: UUID; worldId?: UUID; entityId?: UUID },
  ): Promise<
    Array<{
      id: UUID;
      content: { text?: string };
      similarity?: number;
      metadata?: Record<string, unknown>;
    }>
  >;
  getMemories(params: {
    tableName: string;
    roomId?: UUID;
    count?: number;
    offset?: number;
    end?: number;
  }): Promise<Memory[]>;
  countMemories(params: {
    tableName: string;
    roomId?: UUID;
    unique?: boolean;
  }): Promise<number>;
  deleteMemory(memoryId: UUID): Promise<void>;
}

async function getKnowledgeService(
  runtime: AgentRuntime | null,
): Promise<KnowledgeServiceLike | null> {
  if (!runtime) return null;

  // Try to get the service directly first
  let service = runtime.getService("knowledge") as KnowledgeServiceLike | null;
  if (service) return service;

  // Service might still be loading - wait for it with a timeout
  try {
    const servicePromise = runtime.getServiceLoadPromise("knowledge");
    const timeout = new Promise<never>((_resolve, reject) => {
      setTimeout(() => {
        reject(new Error("Knowledge service load timeout (10s)"));
      }, 10_000);
    });

    await Promise.race([servicePromise, timeout]);

    // Try again after waiting
    service = runtime.getService("knowledge") as KnowledgeServiceLike | null;
  } catch {
    // Service didn't load in time or isn't registered
    return null;
  }

  return service;
}

function parsePositiveInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function parseFloat01(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0, Math.min(1, parsed));
}

function isYouTubeUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)/.test(url);
}

function extractYouTubeVideoId(url: string): string | null {
  // Handle youtu.be/VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
  if (shortMatch) return shortMatch[1];

  // Handle youtube.com/watch?v=VIDEO_ID
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
  if (watchMatch) return watchMatch[1];

  // Handle youtube.com/embed/VIDEO_ID
  const embedMatch = url.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
  if (embedMatch) return embedMatch[1];

  // Handle youtube.com/v/VIDEO_ID
  const vMatch = url.match(/\/v\/([a-zA-Z0-9_-]{11})/);
  if (vMatch) return vMatch[1];

  return null;
}

async function fetchYouTubeTranscript(videoId: string): Promise<string | null> {
  // Fetch the video page to get transcript data
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const response = await fetch(watchUrl, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    return null;
  }

  const html = await response.text();

  // Extract the captions track URL from the page
  const captionsMatch = html.match(
    /"captions":\s*\{[^}]*"playerCaptionsTracklistRenderer":\s*\{[^}]*"captionTracks":\s*\[([^\]]+)\]/,
  );
  if (!captionsMatch) {
    // Try alternative pattern for newer YouTube format
    const altMatch = html.match(/"captionTracks":\s*\[([^\]]+)\]/);
    if (!altMatch) {
      return null;
    }
  }

  // Find the base URL for English captions (or first available)
  const baseUrlMatch = html.match(
    /"baseUrl":\s*"(https:\/\/www\.youtube\.com\/api\/timedtext[^"]+)"/,
  );
  if (!baseUrlMatch) {
    return null;
  }

  // Decode the URL (it's JSON-escaped)
  const captionUrl = baseUrlMatch[1]
    .replace(/\\u0026/g, "&")
    .replace(/\\\//g, "/");

  // Fetch the transcript
  const transcriptResponse = await fetch(captionUrl);
  if (!transcriptResponse.ok) {
    return null;
  }

  const transcriptXml = await transcriptResponse.text();

  // Parse the XML transcript
  const textMatches = transcriptXml.matchAll(/<text[^>]*>([^<]*)<\/text>/g);
  const segments: string[] = [];

  for (const match of textMatches) {
    // Decode HTML entities
    const text = match[1]
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .trim();

    if (text) {
      segments.push(text);
    }
  }

  if (segments.length === 0) {
    return null;
  }

  return segments.join(" ");
}

async function fetchUrlContent(
  url: string,
): Promise<{ content: string; contentType: string; filename: string }> {
  // Check if it's a YouTube URL
  if (isYouTubeUrl(url)) {
    const videoId = extractYouTubeVideoId(url);
    if (!videoId) {
      throw new Error("Invalid YouTube URL: could not extract video ID");
    }

    const transcript = await fetchYouTubeTranscript(videoId);
    if (!transcript) {
      throw new Error(
        "Could not fetch YouTube transcript. The video may not have captions available.",
      );
    }

    return {
      content: transcript,
      contentType: "text/plain",
      filename: `youtube-${videoId}-transcript.txt`,
    };
  }

  // Regular URL fetch
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; Milaidy/1.0; +https://milaidy.ai)",
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch URL: ${response.status} ${response.statusText}`,
    );
  }

  const contentType =
    response.headers.get("content-type") || "application/octet-stream";
  const urlObj = new URL(url);
  const pathSegments = urlObj.pathname.split("/");
  const encodedFilename = pathSegments[pathSegments.length - 1] || "document";
  const filename = decodeURIComponent(encodedFilename);

  // For binary content, return as base64
  const buffer = await response.arrayBuffer();
  const isBinary =
    contentType.startsWith("application/pdf") ||
    contentType.startsWith("application/msword") ||
    contentType.startsWith("application/vnd.openxmlformats-officedocument") ||
    contentType.startsWith("image/");

  if (isBinary) {
    const base64 = Buffer.from(buffer).toString("base64");
    return { content: base64, contentType, filename };
  }

  // For text content, return as string
  const text = new TextDecoder().decode(buffer);
  return { content: text, contentType, filename };
}

export async function handleKnowledgeRoutes(
  ctx: KnowledgeRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    url,
    runtime,
    json,
    error,
    readJsonBody,
  } = ctx;

  if (!pathname.startsWith("/api/knowledge")) return false;

  const knowledgeService = await getKnowledgeService(runtime);
  if (!knowledgeService) {
    error(
      res,
      "Knowledge service is not available. Agent may not be running.",
      503,
    );
    return true;
  }

  if (!runtime?.agentId) {
    error(res, "Agent runtime is not available", 503);
    return true;
  }
  const agentId = runtime.agentId as UUID;

  // ── GET /api/knowledge/stats ────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/knowledge/stats") {
    const documentCount = await knowledgeService.countMemories({
      tableName: "documents",
      roomId: agentId,
      unique: false,
    });

    const fragmentCount = await knowledgeService.countMemories({
      tableName: "knowledge",
      roomId: agentId,
      unique: false,
    });

    json(res, {
      documentCount,
      fragmentCount,
      agentId,
    });
    return true;
  }

  // ── GET /api/knowledge/documents ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/knowledge/documents") {
    const limit = parsePositiveInt(url.searchParams.get("limit"), 100);
    const offset = parsePositiveInt(url.searchParams.get("offset"), 0) - 1;

    const documents = await knowledgeService.getMemories({
      tableName: "documents",
      roomId: agentId,
      count: limit,
      offset: offset > 0 ? offset : undefined,
    });

    // Clean up documents for response (remove embeddings, format metadata)
    const cleanedDocuments = documents.map((doc) => {
      const metadata = doc.metadata as Record<string, unknown> | undefined;
      return {
        id: doc.id,
        filename: metadata?.filename || metadata?.title || "Untitled",
        contentType: metadata?.fileType || metadata?.contentType || "unknown",
        fileSize: metadata?.fileSize || 0,
        createdAt: doc.createdAt,
        fragmentCount: 0, // Will be populated below if needed
        source: metadata?.source || "upload",
        url: metadata?.url,
      };
    });

    json(res, {
      documents: cleanedDocuments,
      total: cleanedDocuments.length,
      limit,
      offset: offset > 0 ? offset : 0,
    });
    return true;
  }

  // ── GET /api/knowledge/documents/:id ────────────────────────────────────
  const docIdMatch = /^\/api\/knowledge\/documents\/([^/]+)$/.exec(pathname);
  if (method === "GET" && docIdMatch) {
    const documentId = decodeURIComponent(docIdMatch[1]) as UUID;

    const documents = await knowledgeService.getMemories({
      tableName: "documents",
      roomId: agentId,
      count: 10000,
    });

    const document = documents.find((d) => d.id === documentId);
    if (!document) {
      error(res, "Document not found", 404);
      return true;
    }

    // Get fragment count for this document
    const allFragments = await knowledgeService.getMemories({
      tableName: "knowledge",
      roomId: agentId,
      count: 50000,
    });

    const fragmentCount = allFragments.filter((f) => {
      const meta = f.metadata as Record<string, unknown> | undefined;
      return meta?.documentId === documentId;
    }).length;

    const metadata = document.metadata as Record<string, unknown> | undefined;

    json(res, {
      document: {
        id: document.id,
        filename: metadata?.filename || metadata?.title || "Untitled",
        contentType: metadata?.fileType || metadata?.contentType || "unknown",
        fileSize: metadata?.fileSize || 0,
        createdAt: document.createdAt,
        fragmentCount,
        source: metadata?.source || "upload",
        url: metadata?.url,
        content: document.content,
      },
    });
    return true;
  }

  // ── DELETE /api/knowledge/documents/:id ─────────────────────────────────
  if (method === "DELETE" && docIdMatch) {
    const documentId = decodeURIComponent(docIdMatch[1]) as UUID;

    // First, delete all fragments associated with this document
    const allFragments = await knowledgeService.getMemories({
      tableName: "knowledge",
      roomId: agentId,
      count: 50000,
    });

    const fragmentsToDelete = allFragments.filter((f) => {
      const meta = f.metadata as Record<string, unknown> | undefined;
      return meta?.documentId === documentId;
    });

    for (const fragment of fragmentsToDelete) {
      await knowledgeService.deleteMemory(fragment.id as UUID);
    }

    // Then delete the document itself
    await knowledgeService.deleteMemory(documentId);

    json(res, {
      ok: true,
      deletedFragments: fragmentsToDelete.length,
    });
    return true;
  }

  // ── POST /api/knowledge/documents ───────────────────────────────────────
  // Upload document from base64 content or text
  if (method === "POST" && pathname === "/api/knowledge/documents") {
    const body = await readJsonBody<{
      content: string;
      filename: string;
      contentType?: string;
      metadata?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;

    if (!body.content || !body.filename) {
      error(res, "content and filename are required");
      return true;
    }

    const result = await knowledgeService.addKnowledge({
      agentId,
      worldId: agentId,
      roomId: agentId,
      entityId: agentId,
      clientDocumentId: "" as UUID, // Will be generated
      contentType: body.contentType || "text/plain",
      originalFilename: body.filename,
      content: body.content,
      metadata: body.metadata,
    });

    json(res, {
      ok: true,
      documentId: result.clientDocumentId,
      fragmentCount: result.fragmentCount,
    });
    return true;
  }

  // ── POST /api/knowledge/documents/url ───────────────────────────────────
  // Upload document from URL (including YouTube auto-transcription)
  if (method === "POST" && pathname === "/api/knowledge/documents/url") {
    const body = await readJsonBody<{
      url: string;
      metadata?: Record<string, unknown>;
    }>(req, res);
    if (!body) return true;

    if (!body.url?.trim()) {
      error(res, "url is required");
      return true;
    }

    const urlToFetch = body.url.trim();

    // Validate URL format
    try {
      new URL(urlToFetch);
    } catch {
      error(res, "Invalid URL format");
      return true;
    }

    // Fetch and process the URL content
    const { content, contentType, filename } =
      await fetchUrlContent(urlToFetch);

    const result = await knowledgeService.addKnowledge({
      agentId,
      worldId: agentId,
      roomId: agentId,
      entityId: agentId,
      clientDocumentId: "" as UUID,
      contentType,
      originalFilename: filename,
      content,
      metadata: {
        ...body.metadata,
        url: urlToFetch,
        source: isYouTubeUrl(urlToFetch) ? "youtube" : "url",
      },
    });

    json(res, {
      ok: true,
      documentId: result.clientDocumentId,
      fragmentCount: result.fragmentCount,
      filename,
      contentType,
      isYouTubeTranscript: isYouTubeUrl(urlToFetch),
    });
    return true;
  }

  // ── GET /api/knowledge/search ───────────────────────────────────────────
  if (method === "GET" && pathname === "/api/knowledge/search") {
    const query = url.searchParams.get("q");
    if (!query?.trim()) {
      error(res, "Search query (q) is required");
      return true;
    }

    const threshold = parseFloat01(url.searchParams.get("threshold"), 0.3);
    const limit = parsePositiveInt(url.searchParams.get("limit"), 20);

    // Create a mock message for the search
    const searchMessage: Memory = {
      id: crypto.randomUUID() as UUID,
      entityId: agentId,
      agentId,
      roomId: agentId,
      content: { text: query.trim() },
      createdAt: Date.now(),
    };

    const results = await knowledgeService.getKnowledge(searchMessage, {
      roomId: agentId,
    });

    // Filter by threshold and limit
    const filteredResults = results
      .filter((r) => (r.similarity ?? 0) >= threshold)
      .slice(0, limit)
      .map((r) => {
        const meta = r.metadata as Record<string, unknown> | undefined;
        return {
          id: r.id,
          text: r.content?.text || "",
          similarity: r.similarity,
          documentId: meta?.documentId,
          documentTitle: meta?.filename || meta?.title || "",
          position: meta?.position,
        };
      });

    json(res, {
      query: query.trim(),
      threshold,
      results: filteredResults,
      count: filteredResults.length,
    });
    return true;
  }

  // ── GET /api/knowledge/fragments/:documentId ────────────────────────────
  const fragmentsMatch = /^\/api\/knowledge\/fragments\/([^/]+)$/.exec(
    pathname,
  );
  if (method === "GET" && fragmentsMatch) {
    const documentId = decodeURIComponent(fragmentsMatch[1]) as UUID;

    const allFragments = await knowledgeService.getMemories({
      tableName: "knowledge",
      roomId: agentId,
      count: 50000,
    });

    const documentFragments = allFragments
      .filter((f) => {
        const meta = f.metadata as Record<string, unknown> | undefined;
        return meta?.documentId === documentId;
      })
      .sort((a, b) => {
        const posA = (a.metadata as Record<string, unknown> | undefined)
          ?.position;
        const posB = (b.metadata as Record<string, unknown> | undefined)
          ?.position;
        return (
          (typeof posA === "number" ? posA : 0) -
          (typeof posB === "number" ? posB : 0)
        );
      })
      .map((f) => {
        const meta = f.metadata as Record<string, unknown> | undefined;
        return {
          id: f.id,
          text: (f.content as { text?: string })?.text || "",
          position: meta?.position,
          createdAt: f.createdAt,
        };
      });

    json(res, {
      documentId,
      fragments: documentFragments,
      count: documentFragments.length,
    });
    return true;
  }

  // Route not matched within /api/knowledge prefix
  return false;
}
