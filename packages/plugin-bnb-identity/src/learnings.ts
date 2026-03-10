import { ethers } from "ethers";

import type { LearningLeaf } from "./types.js";

const MARKDOWN_SECTION_HEADER_RE = /^##\s+\[[^\]]+\]\s*[—–-]\s*.+$/m;

const LEARNING_CATEGORIES: ReadonlySet<LearningLeaf["category"]> = new Set([
  "error",
  "correction",
  "insight",
  "pattern",
]);

function normalizeCategory(raw: string | undefined): LearningLeaf["category"] {
  const normalized = raw?.trim().toLowerCase();
  if (
    normalized &&
    LEARNING_CATEGORIES.has(normalized as LearningLeaf["category"])
  ) {
    return normalized as LearningLeaf["category"];
  }
  return "insight";
}

function parseLegacyBlocks(raw: string): LearningLeaf[] {
  const blocks = raw
    .split(/\n---\n/g)
    .map((block) => block.trim())
    .filter(Boolean);

  const entries: LearningLeaf[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let id = "";
    let timestamp = "";
    let category: LearningLeaf["category"] = "insight";
    let summary = "";
    const detailLines: string[] = [];
    let inDetail = false;

    for (const line of lines) {
      if (inDetail) {
        detailLines.push(line);
        continue;
      }

      const idMatch = line.match(/^id:\s*(.+)$/i);
      if (idMatch) {
        id = idMatch[1].trim();
        continue;
      }

      const timestampMatch = line.match(/^timestamp:\s*(.+)$/i);
      if (timestampMatch) {
        timestamp = timestampMatch[1].trim();
        continue;
      }

      const categoryMatch = line.match(/^category:\s*(.+)$/i);
      if (categoryMatch) {
        category = normalizeCategory(categoryMatch[1]);
        continue;
      }

      const summaryMatch = line.match(/^summary:\s*(.+)$/i);
      if (summaryMatch) {
        summary = summaryMatch[1].trim();
        continue;
      }

      const detailMatch = line.match(/^detail:\s*(.*)$/i);
      if (detailMatch) {
        inDetail = true;
        if (detailMatch[1].trim()) {
          detailLines.push(detailMatch[1].trim());
        }
      }
    }

    if (!id || !timestamp) {
      continue;
    }

    const detailContent = detailLines.join("\n").trim() || summary;
    entries.push({
      id,
      timestamp,
      category,
      summary,
      contentHash: ethers.id(detailContent),
    });
  }

  return entries;
}

function pushMarkdownEntry(
  entries: LearningLeaf[],
  current:
    | (Partial<LearningLeaf> & {
        bodyLines?: string[];
      })
    | null,
): void {
  if (!current?.id || !current.timestamp) {
    return;
  }

  const body = current.bodyLines?.join("\n").trim() || current.summary || "";
  entries.push({
    id: current.id,
    timestamp: current.timestamp,
    category: normalizeCategory(current.category),
    summary: current.summary || "",
    contentHash: current.contentHash || ethers.id(body),
  });
}

function parseMarkdownSections(raw: string): LearningLeaf[] {
  const entries: LearningLeaf[] = [];
  const lines = raw.split("\n");
  let current:
    | (Partial<LearningLeaf> & {
        bodyLines?: string[];
      })
    | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+\[(\w+)\]\s*[—–-]\s*(.+)$/);
    if (headerMatch) {
      pushMarkdownEntry(entries, current);
      current = {
        id: "",
        timestamp: "",
        category: normalizeCategory(headerMatch[1]),
        summary: headerMatch[2].trim(),
        contentHash: "",
        bodyLines: [],
      };
      continue;
    }

    if (!current) {
      continue;
    }

    const idMatch = line.match(/^id:\s*(.+)$/i);
    if (idMatch) {
      current.id = idMatch[1].trim();
      continue;
    }

    const timestampMatch = line.match(/^timestamp:\s*(.+)$/i);
    if (timestampMatch) {
      current.timestamp = timestampMatch[1].trim();
      continue;
    }

    const hashMatch = line.match(/^hash:\s*(.+)$/i);
    if (hashMatch) {
      current.contentHash = hashMatch[1].trim();
      continue;
    }

    const detailMatch = line.match(/^detail:\s*(.*)$/i);
    if (detailMatch) {
      current.bodyLines?.push(detailMatch[1]);
      continue;
    }

    if (
      line.trim() &&
      !/^category:\s*/i.test(line) &&
      !/^summary:\s*/i.test(line)
    ) {
      current.bodyLines?.push(line);
    }
  }

  pushMarkdownEntry(entries, current);
  return entries;
}

export function parseLearningsMd(raw: string): LearningLeaf[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  if (MARKDOWN_SECTION_HEADER_RE.test(trimmed)) {
    const markdownEntries = parseMarkdownSections(trimmed);
    if (markdownEntries.length > 0) {
      return markdownEntries;
    }
  }

  const legacyEntries = parseLegacyBlocks(trimmed);
  if (legacyEntries.length > 0) {
    return legacyEntries;
  }

  return parseMarkdownSections(trimmed);
}
