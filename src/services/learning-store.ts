/**
 * LearningStore — persistence for structured learnings.
 *
 * Manages LEARNINGS.md and ERRORS.md in the agent workspace directory.
 * YAML frontmatter + markdown entries (same pattern as SKILL.md).
 */
import fs from "node:fs";
import path from "node:path";
import { loadMiladyConfig } from "../config/config";

/**
 * Check if self-evolution is enabled. Defaults to true.
 * Can be disabled via milady config: `features.selfEvolution: false`
 * or character settings: `ENABLE_SELF_EVOLUTION: false`.
 */
export function isSelfEvolutionEnabled(
  characterSettings?: Record<string, unknown> | null,
): boolean {
  // Character settings take priority (explicit per-agent override)
  if (characterSettings?.ENABLE_SELF_EVOLUTION === false) return false;

  // Check milady config features
  try {
    const config = loadMiladyConfig();
    const flag = config.features?.selfEvolution;
    if (flag === false) return false;
    if (typeof flag === "object" && flag?.enabled === false) return false;
  } catch {
    // Config unreadable — default to enabled
  }

  return true;
}

const MAX_ENTRIES = 1000;
const PROMOTION_THRESHOLD = 3;
const MEMORY_LEARNINGS_MARKER = "<!-- AGENT_LEARNINGS_START -->";
const MEMORY_LEARNINGS_END = "<!-- AGENT_LEARNINGS_END -->";
const MAX_MEMORY_LEARNINGS = 10;

export type LearningCategory = "error" | "correction" | "insight" | "pattern";

export interface LearningEntry {
  id: string;
  timestamp: string;
  category: LearningCategory;
  source: string;
  summary: string;
  detail: string;
  occurrences: number;
  promotedToMemory: boolean;
}

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export class LearningStore {
  private learnings: LearningEntry[] = [];
  private readonly learningsPath: string;
  private readonly errorsPath: string;

  constructor(workspaceDir: string) {
    this.learningsPath = path.join(workspaceDir, "LEARNINGS.md");
    this.errorsPath = path.join(workspaceDir, "ERRORS.md");
    this.load();
  }

  private load(): void {
    this.learnings = this.parseFile(this.learningsPath);
  }

  private parseFile(filePath: string): LearningEntry[] {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, "utf-8");
    const entries: LearningEntry[] = [];
    const blocks = content.split("\n---\n").filter((b) => b.trim());

    for (const block of blocks) {
      try {
        const entry = this.parseBlock(block);
        if (entry) entries.push(entry);
      } catch {
        // Skip malformed entries
      }
    }
    return entries;
  }

  private parseBlock(block: string): LearningEntry | null {
    const lines = block.trim().split("\n");
    const entry: Partial<LearningEntry> = {};

    for (const line of lines) {
      const match = line.match(/^(\w+):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        switch (key) {
          case "id":
            entry.id = value;
            break;
          case "timestamp":
            entry.timestamp = value;
            break;
          case "category":
            entry.category = value as LearningCategory;
            break;
          case "source":
            entry.source = value;
            break;
          case "summary":
            entry.summary = value;
            break;
          case "occurrences":
            entry.occurrences = Number.parseInt(value, 10);
            break;
          case "promotedToMemory":
            entry.promotedToMemory = value === "true";
            break;
        }
      } else if (!line.startsWith("id:") && entry.id && !entry.detail) {
        entry.detail = line.trim();
      }
    }

    if (entry.id && entry.summary && entry.category) {
      return {
        id: entry.id,
        timestamp: entry.timestamp ?? new Date().toISOString(),
        category: entry.category,
        source: entry.source ?? "agent",
        summary: entry.summary,
        detail: entry.detail ?? "",
        occurrences: entry.occurrences ?? 1,
        promotedToMemory: entry.promotedToMemory ?? false,
      };
    }
    return null;
  }

  private save(): void {
    const content = this.learnings
      .map(
        (e) =>
          `id: ${e.id}\ntimestamp: ${e.timestamp}\ncategory: ${e.category}\nsource: ${e.source}\nsummary: ${e.summary}\noccurrences: ${e.occurrences}\npromotedToMemory: ${e.promotedToMemory}\n${e.detail}`,
      )
      .join("\n---\n");

    const dir = path.dirname(this.learningsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.learningsPath, content, "utf-8");

    // Also write errors separately
    const errors = this.learnings.filter((e) => e.category === "error");
    if (errors.length > 0) {
      const errContent = errors
        .map(
          (e) =>
            `id: ${e.id}\ntimestamp: ${e.timestamp}\nsummary: ${e.summary}\noccurrences: ${e.occurrences}\n${e.detail}`,
        )
        .join("\n---\n");
      fs.writeFileSync(this.errorsPath, errContent, "utf-8");
    }

    // Sync top learnings to MEMORY.md for LLM visibility
    this.syncToMemory();
  }

  /** Sync top learnings into MEMORY.md so the LLM sees them via workspace provider. */
  syncToMemory(): void {
    const memoryPath = path.join(path.dirname(this.learningsPath), "MEMORY.md");
    let content = "";
    try {
      content = fs.readFileSync(memoryPath, "utf-8");
    } catch {
      // File doesn't exist yet — will create
    }

    // Build learnings section
    const topLearnings = this.learnings
      .filter((e) => e.occurrences >= 2 || e.promotedToMemory)
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, MAX_MEMORY_LEARNINGS);

    if (topLearnings.length === 0) return;

    const section = [
      MEMORY_LEARNINGS_MARKER,
      "",
      "## Agent Learnings",
      "",
      ...topLearnings.map(
        (e) => `- [${e.category}] ${e.summary} (x${e.occurrences})`,
      ),
      "",
      MEMORY_LEARNINGS_END,
    ].join("\n");

    // Replace existing section or append
    const startIdx = content.indexOf(MEMORY_LEARNINGS_MARKER);
    const endIdx = content.indexOf(MEMORY_LEARNINGS_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content =
        content.slice(0, startIdx) +
        section +
        content.slice(endIdx + MEMORY_LEARNINGS_END.length);
    } else {
      content = content.trimEnd() + "\n\n" + section + "\n";
    }

    const dir = path.dirname(memoryPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(memoryPath, content, "utf-8");
  }

  /** Add or deduplicate a learning entry. Returns the entry. */
  record(
    category: LearningCategory,
    summary: string,
    detail?: string,
    source?: string,
  ): LearningEntry {
    // Dedup by summary similarity
    const existing = this.learnings.find(
      (e) =>
        e.category === category &&
        e.summary.toLowerCase() === summary.toLowerCase(),
    );

    if (existing) {
      existing.occurrences += 1;
      existing.timestamp = new Date().toISOString();
      if (detail) existing.detail = detail;
      this.save();
      return existing;
    }

    const entry: LearningEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      category,
      source: source ?? "agent",
      summary,
      detail: detail ?? "",
      occurrences: 1,
      promotedToMemory: false,
    };

    this.learnings.push(entry);

    // Prune oldest if over max
    if (this.learnings.length > MAX_ENTRIES) {
      this.learnings.sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );
      this.learnings = this.learnings.slice(0, MAX_ENTRIES);
    }

    this.save();
    return entry;
  }

  /** Check if any entries should be promoted to memory. */
  async checkPromotions(): Promise<LearningEntry[]> {
    const promoted: LearningEntry[] = [];

    for (const entry of this.learnings) {
      if (entry.occurrences >= PROMOTION_THRESHOLD && !entry.promotedToMemory) {
        try {
          const resp = await fetch(
            `http://localhost:${API_PORT}/api/memory/remember`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                text: `[${entry.category}] ${entry.summary}${entry.detail ? `: ${entry.detail}` : ""}`,
              }),
            },
          );
          if (resp.ok) {
            entry.promotedToMemory = true;
            promoted.push(entry);
          }
        } catch {
          // Memory service unavailable — skip
        }
      }
    }

    if (promoted.length > 0) this.save();
    return promoted;
  }

  getAll(): LearningEntry[] {
    return [...this.learnings];
  }

  getRecent(count: number): LearningEntry[] {
    return this.learnings
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      )
      .slice(0, count);
  }

  getPromotedCount(): number {
    return this.learnings.filter((e) => e.promotedToMemory).length;
  }

  getCount(): number {
    return this.learnings.length;
  }
}

/** Module-level singleton for cross-action access. */
let _store: LearningStore | null = null;

export function initLearningStore(workspaceDir: string): LearningStore {
  _store = new LearningStore(workspaceDir);
  return _store;
}

export function getLearningStore(): LearningStore | null {
  return _store;
}

// ── Auto-analysis: runs on a timer, no LLM involvement ─────────────

let _analysisTimer: ReturnType<typeof setInterval> | null = null;

/**
 * Start a background timer that automatically analyzes trajectories
 * and records error patterns. Runs every `intervalHours` with zero
 * LLM token cost — pure DB scan + file write.
 */
export function startAutoAnalysis(runtime: unknown, intervalHours = 6): void {
  if (_analysisTimer) return; // already running

  const runAnalysis = async () => {
    const store = getLearningStore();
    if (!store) return;

    try {
      // Dynamic import to avoid circular dependency
      const { loadPersistedTrajectoryRows } = await import(
        "../runtime/trajectory-persistence"
      );
      const rows = await loadPersistedTrajectoryRows(runtime as never, 5000);
      if (!rows || rows.length === 0) return;

      const cutoff = Date.now() - intervalHours * 60 * 60 * 1000;
      const recent = rows.filter((row) => {
        const ts = row.created_at;
        if (typeof ts === "string") return new Date(ts).getTime() >= cutoff;
        if (typeof ts === "number") return ts >= cutoff;
        return false;
      });

      // Extract and record error patterns — check both trajectory status AND step-level failures
      for (const row of recent) {
        const status = String(row.status ?? "");

        // Trajectory-level errors
        if (status === "error" || status === "failed") {
          const meta =
            typeof row.metadata === "string"
              ? row.metadata
              : JSON.stringify(row.metadata ?? "");
          const sig = extractAutoSignature(meta);
          if (sig) {
            store.record("error", sig, undefined, "auto-analysis");
          }
        }

        // Step-level failures within completed trajectories
        const stepsJson = row.steps_json ?? row.stepsJson;
        if (stepsJson) {
          const stepsStr =
            typeof stepsJson === "string"
              ? stepsJson
              : JSON.stringify(stepsJson);
          extractStepErrors(stepsStr).forEach((sig) => {
            store.record("error", sig, undefined, "auto-analysis-step");
          });
        }
      }

      // Auto-promote any that crossed the threshold
      await store.checkPromotions();
    } catch {
      // Silent — background analysis should never crash the agent
    }
  };

  // Run once after 5 minutes (let the agent boot), then on interval
  setTimeout(
    () => {
      void runAnalysis();
      _analysisTimer = setInterval(
        () => void runAnalysis(),
        intervalHours * 60 * 60 * 1000,
      );
    },
    5 * 60 * 1000,
  );
}

export function stopAutoAnalysis(): void {
  if (_analysisTimer) {
    clearInterval(_analysisTimer);
    _analysisTimer = null;
  }
}

/** Extract error signatures from steps_json — catches action-level failures within completed trajectories. */
function extractStepErrors(stepsStr: string): string[] {
  const sigs: string[] = [];
  try {
    const steps = JSON.parse(stepsStr);
    if (!Array.isArray(steps)) return sigs;
    for (const step of steps) {
      const stepStatus = String(step?.status ?? step?.result?.status ?? "");
      if (
        stepStatus === "error" ||
        stepStatus === "failed" ||
        step?.error ||
        step?.result?.error
      ) {
        const errorMsg =
          step?.error ?? step?.result?.error ?? step?.result?.text ?? "";
        const sig = extractAutoSignature(
          typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg),
        );
        if (sig) sigs.push(sig);
      }
    }
  } catch {
    // Malformed steps_json — skip
  }
  return sigs;
}

function extractAutoSignature(meta: string): string | null {
  const errorMatch = meta.match(/(?:error|Error|ERROR)[:\s]+([^"}\n]{10,100})/);
  if (errorMatch) return errorMatch[1].trim();
  const failMatch = meta.match(/(?:fail|FAIL)[:\s]+([^"}\n]{10,80})/);
  if (failMatch) return failMatch[1].trim();
  return null;
}
