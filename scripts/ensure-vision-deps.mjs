#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";

const platform = os.platform();

const supportsColor =
  process.env.FORCE_COLOR !== "0" &&
  process.env.NO_COLOR === undefined &&
  process.stdout.isTTY;

const GREEN = supportsColor ? "\x1b[38;2;0;255;65m" : "";
const ORANGE = supportsColor ? "\x1b[38;2;255;165;0m" : "";
const DIM = supportsColor ? "\x1b[2m" : "";
const RESET = supportsColor ? "\x1b[0m" : "";

function green(text) {
  return `${GREEN}${text}${RESET}`;
}
function orange(text) {
  return `${ORANGE}${text}${RESET}`;
}
function dim(text) {
  return `${DIM}${text}${RESET}`;
}

function which(cmd) {
  const pathEnv = process.env.PATH ?? "";
  if (!pathEnv) return null;

  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const isWindows = platform === "win32";
  const pathext = isWindows ? process.env.PATHEXT : "";
  const exts = isWindows
    ? pathext?.length
      ? pathext.split(";").filter(Boolean)
      : [".EXE", ".CMD", ".BAT", ".COM"]
    : [""];

  for (const dir of dirs) {
    const candidates = [cmd];
    if (isWindows) {
      const lowerCmd = cmd.toLowerCase();
      for (const ext of exts) {
        const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
        if (!lowerCmd.endsWith(normalizedExt.toLowerCase())) {
          candidates.push(cmd + normalizedExt);
        }
      }
    }
    for (const name of candidates) {
      const candidate = path.join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function installMacOs() {
  if (which("imagesnap")) {
    console.log(`  ${green("[milady]")} ${dim("imagesnap installed")}`);
    return;
  }

  if (!which("brew")) {
    console.warn(
      `  ${orange("[milady]")} ${dim("Homebrew not found. Install manually: brew install imagesnap")}`,
    );
    return;
  }

  console.log(`  ${green("[milady]")} Installing imagesnap via Homebrew...`);
  try {
    execSync("brew install imagesnap", { stdio: "inherit" });
    console.log(`  ${green("[milady]")} imagesnap installed successfully`);
  } catch (_err) {
    console.error(
      `  ${orange("[milady]")} ${dim("Failed to install imagesnap")}`,
    );
  }
}

function installLinux() {
  if (which("fswebcam")) {
    console.log(`  ${green("[milady]")} ${dim("fswebcam installed")}`);
    return;
  }

  if (!which("apt-get")) {
    console.warn(
      `  ${orange("[milady]")} ${dim("apt-get not found. Install manually: sudo apt-get install fswebcam")}`,
    );
    return;
  }

  console.log(`  ${green("[milady]")} Installing fswebcam via apt-get...`);
  try {
    execSync("sudo apt-get install -y fswebcam", { stdio: "inherit" });
    console.log(`  ${green("[milady]")} fswebcam installed successfully`);
  } catch (_err) {
    console.error(
      `  ${orange("[milady]")} ${dim("Failed to install fswebcam. (Sudo privileges may be required)")}`,
    );
  }
}

function installWindows() {
  if (which("ffmpeg")) {
    console.log(`  ${green("[milady]")} ${dim("ffmpeg installed")}`);
    return;
  }

  if (!which("winget")) {
    console.warn(
      `  ${orange("[milady]")} ${dim("winget not found. Install manually from ffmpeg.org and add to PATH.")}`,
    );
    return;
  }

  console.log(`  ${green("[milady]")} Installing ffmpeg via winget...`);
  try {
    execSync(
      "winget install -e --id Gyan.FFmpeg --accept-source-agreements --accept-package-agreements",
      { stdio: "inherit" },
    );
    console.log(
      `  ${green("[milady]")} ffmpeg installed successfully. Restart your terminal if necessary.`,
    );
  } catch (_err) {
    console.error(`  ${orange("[milady]")} ${dim("Failed to install ffmpeg")}`);
  }
}

function main() {
  const disableFlag = process.env.MILADY_NO_VISION_DEPS === "1";
  if (disableFlag) {
    return;
  }

  if (platform === "darwin") {
    installMacOs();
  } else if (platform === "linux") {
    installLinux();
  } else if (platform === "win32") {
    installWindows();
  } else {
    // Unsupported platform
    console.log(
      `  ${green("[milady]")} ${dim(`Platform ${platform} unsupported for automatic camera deps`)}`,
    );
  }
}

main();
