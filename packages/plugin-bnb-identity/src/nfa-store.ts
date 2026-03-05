/**
 * Lightweight file-based persistence for BAP-578 NFA state.

 *
 * Writes to ~/.milady/bap578-nfa.json so NFA state survives restarts
 * and can be read by other plugins and API routes.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { NfaRecord } from "./types.js";

const MILADY_DIR = join(homedir(), ".milady");
const NFA_FILE = join(MILADY_DIR, "bap578-nfa.json");

/** Reads the persisted NFA record, or null if none exists. */
export async function readNfaRecord(): Promise<NfaRecord | null> {
  try {
    const raw = await readFile(NFA_FILE, "utf8");
    return JSON.parse(raw) as NfaRecord;
  } catch {
    return null;
  }
}

/** Writes an NFA record to disk, creating ~/.milady/ if needed. */
export async function writeNfaRecord(record: NfaRecord): Promise<void> {
  await mkdir(MILADY_DIR, { recursive: true });
  await writeFile(NFA_FILE, JSON.stringify(record, null, 2), "utf8");
}

/** Updates specific fields on the existing record, or throws if none exists. */
export async function patchNfaRecord(
  patch: Partial<NfaRecord>
): Promise<NfaRecord> {
  const existing = await readNfaRecord();
  if (!existing) {
    throw new Error(
      "No NFA record found. Mint first with: mint nfa"
    );
  }
  const updated: NfaRecord = {
    ...existing,
    ...patch,
    lastUpdatedAt: new Date().toISOString(),
  };
  await writeNfaRecord(updated);
  return updated;
}

/** Deletes the NFA file. Used in tests. */
export async function clearNfaRecord(): Promise<void> {
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(NFA_FILE);
  } catch {
    // already gone
  }
}