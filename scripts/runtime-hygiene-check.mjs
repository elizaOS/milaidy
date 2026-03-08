#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const args = new Set(process.argv.slice(2));
const strict = args.has("--strict");

const SECRET_KEY_PATTERN =
  /(api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|seed|mnemonic|password)/i;
const SECRET_VALUE_PATTERN =
  /(sk-[A-Za-z0-9_-]{16,}|eliza_[A-Za-z0-9_-]{16,}|xox[baprs]-[A-Za-z0-9-]{10,}|gh[pousr]_[A-Za-z0-9_]{20,}|-----BEGIN [A-Z ]+PRIVATE KEY-----)/;
const REDACTED_PATTERN = /^\*{4,}$|^REDACTED$|^<redacted>$/i;

function resolvePaths() {
  const cwd = process.cwd();
  const expectedStateDir = path.resolve(cwd, ".milady-state");
  const expectedConfigPath = path.resolve(expectedStateDir, "milady.json");
  const stateDir = path.resolve(
    (process.env.MILADY_STATE_DIR || expectedStateDir).trim(),
  );
  const configPath = path.resolve(
    (process.env.MILADY_CONFIG_PATH || expectedConfigPath).trim(),
  );
  return { cwd, stateDir, configPath, expectedStateDir, expectedConfigPath };
}

function collectJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.toLowerCase().endsWith(".json")) continue;
      out.push(full);
    }
  }
  return out;
}

function isLikelySecretField(fieldPath, value) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  if (!trimmed || REDACTED_PATTERN.test(trimmed)) return false;
  if (SECRET_VALUE_PATTERN.test(trimmed)) return true;
  return SECRET_KEY_PATTERN.test(fieldPath);
}

function scanObject(value, pathPrefix, findings) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      scanObject(value[i], `${pathPrefix}[${i}]`, findings);
    }
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    const fieldPath = pathPrefix ? `${pathPrefix}.${key}` : key;
    if (isLikelySecretField(fieldPath, nested)) {
      findings.push(fieldPath);
    }
    scanObject(nested, fieldPath, findings);
  }
}

function scanJsonFile(filePath) {
  const findings = [];
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw.trim()) return findings;
    const parsed = JSON.parse(raw);
    scanObject(parsed, "", findings);
  } catch {
    // Ignore malformed/non-json-like files in hygiene scan.
  }
  return findings;
}

function main() {
  const failures = [];
  const warnings = [];
  const { stateDir, configPath, expectedStateDir, expectedConfigPath } =
    resolvePaths();

  const allowNonWorkspace =
    process.env.MILADY_ALLOW_NON_WORKSPACE_STATE === "1";
  if (!allowNonWorkspace) {
    if (stateDir !== expectedStateDir) {
      failures.push(
        `MILADY_STATE_DIR drift: ${stateDir} (expected ${expectedStateDir})`,
      );
    }
    if (configPath !== expectedConfigPath) {
      failures.push(
        `MILADY_CONFIG_PATH drift: ${configPath} (expected ${expectedConfigPath})`,
      );
    }
  }

  const candidateFiles = new Set([
    configPath,
    ...collectJsonFiles(path.join(expectedStateDir, "workspace")),
  ]);

  const secretFindings = [];
  for (const filePath of candidateFiles) {
    if (!fs.existsSync(filePath)) continue;
    const findings = scanJsonFile(filePath);
    if (findings.length > 0) {
      secretFindings.push({
        filePath,
        fields: findings.slice(0, 5),
      });
    }
  }

  if (secretFindings.length > 0) {
    const rendered = secretFindings
      .map(
        (entry) =>
          `${entry.filePath} -> ${entry.fields.join(", ")}${entry.fields.length >= 5 ? "..." : ""}`,
      )
      .join("\n");
    failures.push(
      `Potential plaintext secrets detected in runtime state/config:\n${rendered}`,
    );
  }

  if (!fs.existsSync(expectedStateDir)) {
    warnings.push(`Workspace state dir missing: ${expectedStateDir}`);
  }

  if (warnings.length > 0) {
    for (const warning of warnings) {
      console.warn(`[runtime-hygiene] warn: ${warning}`);
    }
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      const lines = failure.split("\n");
      for (const line of lines) {
        console.error(`[runtime-hygiene] fail: ${line}`);
      }
    }
    if (strict) process.exit(1);
  }

  console.log(
    `[runtime-hygiene] ${failures.length === 0 ? "pass" : strict ? "failed" : "warnings only"} (strict=${strict ? "1" : "0"})`,
  );
}

main();
