import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installClaudeCodeStealthFetchInterceptor } from "./claude-code-stealth";

/**
 * Walk up from `startDir` until we find a directory containing package.json
 * with name "milady". Returns the directory path, or falls back to `startDir`.
 */
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  const { root } = path.parse(dir);
  while (dir !== root) {
    const pkgPath = path.join(dir, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (typeof pkg.name === "string" && pkg.name.toLowerCase() === "milady") {
        return dir;
      }
    } catch {
      /* keep searching */
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export function applyClaudeCodeStealth(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.startsWith("sk-ant-oat")) {
    return;
  }

  installClaudeCodeStealthFetchInterceptor();
}

const OPENAI_STEALTH_GUARD = Symbol.for("milady.openaiCodexStealthInstalled");

export async function applyOpenAICodexStealth(): Promise<void> {
  // Prevent double-installation
  if ((globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD]) {
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return;
  // Standard API keys start with sk- and don't need stealth
  if (apiKey.startsWith("sk-")) return;

  // Locate the root-level openai-codex-stealth.mjs by walking up to the
  // project root (works whether running from src/ or dist/).
  const thisDir = path.dirname(fileURLToPath(import.meta.url));
  const projectRoot = findProjectRoot(thisDir);
  const stealthPath = path.join(projectRoot, "openai-codex-stealth.mjs");

  await import(stealthPath);
  (globalThis as Record<symbol, unknown>)[OPENAI_STEALTH_GUARD] = true;
}
