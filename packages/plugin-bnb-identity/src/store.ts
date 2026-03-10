/**
 * Lightweight file-based persistence for the agent's ERC-8004 identity.
 *
 * Writes to ~/.milady/bnb-identity.json so the agentId survives restarts
 * and can be read by other plugins (e.g. a future payment plugin).
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { IdentityRecord, NfaRecord } from "./types.js";

const MILADY_DIR = join(homedir(), ".milady");
const IDENTITY_FILE = join(MILADY_DIR, "bnb-identity.json");

/** Reads the persisted identity record, or null if none exists. */
export async function readIdentity(): Promise<IdentityRecord | null> {
  try {
    const raw = await readFile(IDENTITY_FILE, "utf8");
    return JSON.parse(raw) as IdentityRecord;
  } catch {
    return null;
  }
}

/** Writes an identity record to disk, creating ~/.milady/ if needed. */
export async function writeIdentity(record: IdentityRecord): Promise<void> {
  await mkdir(MILADY_DIR, { recursive: true });
  await writeFile(IDENTITY_FILE, JSON.stringify(record, null, 2), "utf8");
}

/** Updates specific fields on the existing record, or throws if none exists. */
export async function patchIdentity(
  patch: Partial<IdentityRecord>,
): Promise<IdentityRecord> {
  const existing = await readIdentity();
  if (!existing) {
    throw new Error(
      "No identity record found. Register first with /bnb-identity register.",
    );
  }
  const updated: IdentityRecord = {
    ...existing,
    ...patch,
    lastUpdatedAt: new Date().toISOString(),
  };
  await writeIdentity(updated);
  return updated;
}

/** Deletes the identity file. Used in tests. */
export async function clearIdentity(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(IDENTITY_FILE);
  } catch {
    // already gone
  }
}

// ── BAP-578 NFA persistence ─────────────────────────────────────────────

const NFA_FILE = join(MILADY_DIR, "bnb-nfa.json");

/** Reads the persisted NFA record, or null if none exists. */
export async function readNfa(): Promise<NfaRecord | null> {
  try {
    const raw = await readFile(NFA_FILE, "utf8");
    return JSON.parse(raw) as NfaRecord;
  } catch {
    return null;
  }
}

/** Writes an NFA record to disk, creating ~/.milady/ if needed. */
export async function writeNfa(record: NfaRecord): Promise<void> {
  await mkdir(MILADY_DIR, { recursive: true });
  await writeFile(NFA_FILE, JSON.stringify(record, null, 2), "utf8");
}

/** Updates specific fields on the existing NFA record. */
export async function patchNfa(
  patch: Partial<NfaRecord>,
): Promise<NfaRecord> {
  const existing = await readNfa();
  if (!existing) {
    throw new Error(
      "No NFA record found. Mint an NFA first with BNB_NFA_MINT.",
    );
  }
  const updated: NfaRecord = { ...existing, ...patch };
  await writeNfa(updated);
  return updated;
}

/** Deletes the NFA file. Used in tests. */
export async function clearNfa(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(NFA_FILE);
  } catch {
    // already gone
  }
}
