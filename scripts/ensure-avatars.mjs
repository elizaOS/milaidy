#!/usr/bin/env node
/**
 * Ensure avatar assets (VRMs, animations, backgrounds) are present in the app.
 *
 * On a fresh clone, apps/app/public/vrms/ and animations/ may be empty or
 * contain only Git LFS pointers.  This script clones the milady-ai/avatars
 * repository into a temp directory and copies the assets into the correct
 * locations under apps/app/public/.
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

const AVATARS_REPO = "https://github.com/milady-ai/avatars.git";
const TAG = "[ensure-avatars]";

/** A VRM file is valid if it is > 1 KB (rules out LFS pointers & stubs). */
function hasValidVrm(dir) {
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".vrm"));
    if (files.length === 0) return false;
    // Check the first VRM is a real binary, not an LFS pointer (~130 bytes)
    const stat = statSync(join(dir, files[0]));
    return stat.size > 1024;
  } catch {
    return false;
  }
}

function hasValidAnimations(dir) {
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

export function runEnsureAvatars({
  force = false,
  log = console.log,
  logError = console.error,
} = {}) {
  if (!force && hasValidVrm(VRMS_DIR) && hasValidAnimations(ANIMATIONS_DIR)) {
    log(`${TAG} Avatar assets already present — skipping`);
    return { cloned: false, reason: "already-present" };
  }

  if (!gitAvailable()) {
    logError(`${TAG} git not found — cannot clone avatar assets`);
    return { cloned: false, reason: "no-git" };
  }

  log(
    `${TAG} Avatar assets missing or incomplete — cloning from ${AVATARS_REPO}...`,
  );

  const tmpDir = join(ROOT, ".avatar-clone-tmp");

  try {
    // Clean up any previous failed attempt
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    // Shallow clone for speed (assets only, no history)
    execSync(`git clone --depth 1 ${AVATARS_REPO} "${tmpDir}"`, {
      cwd: ROOT,
      stdio: "inherit",
    });

    // Copy VRM files and directories
    const avatarVrms = join(tmpDir, "vrms");
    if (existsSync(avatarVrms)) {
      mkdirSync(VRMS_DIR, { recursive: true });
      cpSync(avatarVrms, VRMS_DIR, { recursive: true, force: true });
      log(`${TAG} Copied VRMs, previews, and backgrounds`);
    }

    // Copy animation files and directories
    const avatarAnims = join(tmpDir, "animations");
    if (existsSync(avatarAnims)) {
      mkdirSync(ANIMATIONS_DIR, { recursive: true });
      cpSync(avatarAnims, ANIMATIONS_DIR, { recursive: true, force: true });
      log(`${TAG} Copied animations and emotes`);
    }

    // Verify the copy worked
    const vrmsOk = hasValidVrm(VRMS_DIR);
    const animsOk = hasValidAnimations(ANIMATIONS_DIR);

    if (vrmsOk && animsOk) {
      log(`${TAG} Avatar assets installed successfully`);
    } else {
      logError(
        `${TAG} Warning: copy completed but verification failed (vrms=${vrmsOk}, animations=${animsOk})`,
      );
    }

    return { cloned: true, vrmsOk, animsOk };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logError(`${TAG} Failed to clone avatar assets: ${message}`);
    logError(
      `${TAG} You can manually clone: git clone ${AVATARS_REPO} /tmp/avatars && cp -r /tmp/avatars/vrms/ apps/app/public/vrms/ && cp -r /tmp/avatars/animations/ apps/app/public/animations/`,
    );
    return { cloned: false, reason: "clone-failed", error: message };
  } finally {
    // Always clean up temp directory
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
