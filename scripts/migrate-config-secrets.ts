#!/usr/bin/env node

import path from "node:path";
import { loadMiladyConfig, saveMiladyConfig } from "../src/config/config";

function main() {
  const cwd = process.cwd();
  if (!process.env.MILADY_STATE_DIR?.trim()) {
    process.env.MILADY_STATE_DIR = path.join(cwd, ".milady-state");
  }
  if (!process.env.MILADY_CONFIG_PATH?.trim()) {
    process.env.MILADY_CONFIG_PATH = path.join(
      process.env.MILADY_STATE_DIR,
      "milady.json",
    );
  }
  const config = loadMiladyConfig();
  saveMiladyConfig(config);
  console.log(
    "[migrate-config-secrets] Saved config with sealed env secrets (if present).",
  );
}

main();
