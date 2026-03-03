#!/usr/bin/env node
/**
 * Ensure avatar assets (VRMs, animations, backgrounds) are present in the app.
 *
 * On a fresh clone, apps/app/public/vrms/ and animations/ may be empty or
 * contain only Git LFS pointers.  This script clones the milady-ai/avatars
 * repository (org-owned) into a temp directory and copies the assets into
 * the correct locations under apps/app/public/.
 *
 * Run automatically via the `postinstall` hook, or manually:
 *   node scripts/ensure-avatars.mjs
 *   node scripts/ensure-avatars.mjs --force   # re-download even if present
 */
import { execSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");
const PUBLIC = join(ROOT, "apps", "app", "public");
const VRMS_DIR = join(PUBLIC, "vrms");
const ANIMATIONS_DIR = join(PUBLIC, "animations");

// milady-ai/avatars is an org-owned repo in the milady-ai GitHub organization.
// Pinned to a specific commit for reproducible installs (supply-chain safety).
const AVATARS_REPO = "https://github.com/milady-ai/avatars.git";
const AVATARS_COMMIT = "23e9bfc02e55e70acb8c8f0d4786829ecccbb5b6";
const TAG = "[ensure-avatars]";

/** A VRM file is valid if it is > 1 KB (rules out LFS pointers & stubs). */
export function hasValidVrm(dir) {
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".vrm"));
    if (files.length === 0) return false;
    const stat = statSync(join(dir, files[0]));
    return stat.size > 1024;
  } catch {
    return false;
  }
}

export function hasValidAnimations(dir) {
  if (!existsSync(dir)) return false;
  const emotesDir = join(dir, "emotes");
  if (!existsSync(emotesDir)) return false;
  try {
    const files = readdirSync(emotesDir).filter((f) => f.endsWith(".glb"));
    if (files.length === 0) return false;
    const stat = statSync(join(emotesDir, files[0]));
    return stat.size > 1024;
  } catch {
    return false;
  }
}

function gitAvailable() {
  try {
    execSync("git --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Count files matching an extension in a directory (non-recursive). */
function countFiles(dir, ext) {
  if (!existsSync(dir)) return 0;
  try {
    return readdirSync(dir).filter((f) => f.endsWith(ext)).length;
  } catch {
    return 0;
  }
}

export function runEnsureAvatars({
  force = false,
  log = console.log,
  logError = console.error,
  _hasValidVrm = hasValidVrm,
  _hasValidAnimations = hasValidAnimations,
} = {}) {
  if (!force && _hasValidVrm(VRMS_DIR) && _hasValidAnimations(ANIMATIONS_DIR)) {
    log(`${TAG} Avatar assets already present — skipping`);
    return { cloned: false, reason: "already-present" };
  }

  const skipEnv = process.env.SKIP_AVATAR_CLONE;
  if (skipEnv === "1" || skipEnv === "true") {
    log(`${TAG} SKIP_AVATAR_CLONE set — skipping clone`);
    return { cloned: false, reason: "skipped-by-env" };
  }

  if (!gitAvailable()) {
    logError(`${TAG} git not found — cannot clone avatar assets`);
    return { cloned: false, reason: "no-git" };
  }

  log(
    `${TAG} Avatar assets missing or incomplete — cloning from ${AVATARS_REPO} @ ${AVATARS_COMMIT.slice(0, 8)}...`,
  );

  const tmpDir = join(ROOT, ".avatar-clone-tmp");

  try {
    // Clean up any previous failed attempt
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    // Clone and checkout pinned commit for reproducibility.
    // Uses --depth 1 + fetch for speed (avoids full history).
    execSync(`git clone --depth 1 ${AVATARS_REPO} "${tmpDir}"`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    execSync(`git -C "${tmpDir}" fetch --depth 1 origin ${AVATARS_COMMIT}`, {
      cwd: ROOT,
      stdio: "inherit",
    });
    execSync(`git -C "${tmpDir}" checkout ${AVATARS_COMMIT}`, {
      cwd: ROOT,
      stdio: "inherit",
    });

    // cpSync(src, dest, { recursive: true }) merges src contents INTO dest
    // (like rsync -a src/ dest/), it does NOT create dest/basename(src).
    // So vrms/milady-1.vrm → apps/app/public/vrms/milady-1.vrm (correct).

    const avatarVrms = join(tmpDir, "vrms");
    if (existsSync(avatarVrms)) {
      mkdirSync(VRMS_DIR, { recursive: true });
      cpSync(avatarVrms, VRMS_DIR, { recursive: true, force: true });
      const vrmCount = countFiles(VRMS_DIR, ".vrm");
      log(`${TAG} Copied ${vrmCount} VRMs + previews and backgrounds`);
    }

    const avatarAnims = join(tmpDir, "animations");
    if (existsSync(avatarAnims)) {
      mkdirSync(ANIMATIONS_DIR, { recursive: true });
      cpSync(avatarAnims, ANIMATIONS_DIR, { recursive: true, force: true });
      const glbCount = countFiles(join(ANIMATIONS_DIR, "emotes"), ".glb");
      const fbxCount = countFiles(join(ANIMATIONS_DIR, "mixamo"), ".fbx");
      log(`${TAG} Copied ${glbCount} emotes + ${fbxCount} mixamo animations`);
    }

    // Verify the copy produced valid assets
    const vrmsOk = hasValidVrm(VRMS_DIR);
    const animsOk = hasValidAnimations(ANIMATIONS_DIR);

    if (!vrmsOk || !animsOk) {
      logError(
        `${TAG} ERROR: copy completed but verification failed (vrms=${vrmsOk}, animations=${animsOk})`,
      );
      return { cloned: true, vrmsOk, animsOk, reason: "verify-failed" };
    }

    log(`${TAG} Avatar assets installed successfully`);
    return { cloned: true, vrmsOk, animsOk };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`${TAG} Failed to clone avatar assets: ${message}`);
    logError(
      `${TAG} You can manually clone: git clone ${AVATARS_REPO} /tmp/avatars && cp -r /tmp/avatars/vrms/ apps/app/public/vrms/ && cp -r /tmp/avatars/animations/ apps/app/public/animations/`,
    );
    return { cloned: false, reason: "clone-failed", error: message };
  } finally {
    try {
      if (existsSync(tmpDir)) {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }
}

// Run directly if invoked from CLI
const isDirectRun =
  process.argv[1] && resolve(process.argv[1]) === resolve(__filename);

if (isDirectRun) {
  const force = process.argv.includes("--force");
  runEnsureAvatars({ force });
}
