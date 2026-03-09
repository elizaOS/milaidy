/**
 * Workflow storage layer.
 *
 * Persists workflow definitions in milady.json (alongside customActions)
 * and workflow runs in a separate JSON file for run history.
 *
 * @module workflows/storage
 */

import crypto from "node:crypto";
import { loadMiladyConfig, saveMiladyConfig } from "../config/config";
import type {
  CreateWorkflowRequest,
  UpdateWorkflowRequest,
  WorkflowDef,
  WorkflowRun,
} from "./types";

// ---------------------------------------------------------------------------
// Run persistence (separate file to avoid bloating milady.json)
// ---------------------------------------------------------------------------

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

function getRunsFilePath(): string {
  const miladyDir = path.join(os.homedir(), ".milady");
  if (!existsSync(miladyDir)) {
    mkdirSync(miladyDir, { recursive: true });
  }
  return path.join(miladyDir, "workflow-runs.json");
}

export function loadWorkflowRuns(): WorkflowRun[] {
  const filePath = getRunsFilePath();
  if (!existsSync(filePath)) return [];
  try {
    const raw = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveWorkflowRuns(runs: WorkflowRun[]): void {
  const filePath = getRunsFilePath();
  writeFileSync(filePath, JSON.stringify(runs, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Workflow definition CRUD (stored in milady.json)
// ---------------------------------------------------------------------------

export function loadWorkflows(): WorkflowDef[] {
  try {
    const config = loadMiladyConfig();
    return (
      ((config as Record<string, unknown>).workflows as WorkflowDef[]) ?? []
    );
  } catch {
    return [];
  }
}

function saveWorkflows(workflows: WorkflowDef[]): void {
  const config = loadMiladyConfig();
  (config as Record<string, unknown>).workflows = workflows;
  saveMiladyConfig(config);
}

export function getWorkflow(id: string): WorkflowDef | null {
  const workflows = loadWorkflows();
  return workflows.find((w) => w.id === id) ?? null;
}

export function createWorkflow(req: CreateWorkflowRequest): WorkflowDef {
  const now = new Date().toISOString();
  const def: WorkflowDef = {
    id: crypto.randomUUID(),
    name: req.name,
    description: req.description ?? "",
    nodes: req.nodes ?? [],
    edges: req.edges ?? [],
    enabled: req.enabled ?? false,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };

  const workflows = loadWorkflows();
  workflows.push(def);
  saveWorkflows(workflows);
  return def;
}

export function updateWorkflow(
  id: string,
  req: UpdateWorkflowRequest,
): WorkflowDef | null {
  const workflows = loadWorkflows();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx < 0) return null;

  const existing = workflows[idx];
  const updated: WorkflowDef = {
    ...existing,
    name: req.name ?? existing.name,
    description: req.description ?? existing.description,
    nodes: req.nodes ?? existing.nodes,
    edges: req.edges ?? existing.edges,
    enabled: req.enabled ?? existing.enabled,
    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  workflows[idx] = updated;
  saveWorkflows(workflows);
  return updated;
}

export function deleteWorkflow(id: string): boolean {
  const workflows = loadWorkflows();
  const idx = workflows.findIndex((w) => w.id === id);
  if (idx < 0) return false;

  workflows.splice(idx, 1);
  saveWorkflows(workflows);
  return true;
}
