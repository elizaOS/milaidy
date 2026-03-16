import { execFileSync, spawnSync } from "node:child_process";

const BIOME_CRASHER_PATHS = new Set([
  "apps/app/plugins/screencapture/src/web.ts",
  "apps/app/plugins/talkmode/electron/src/index.d.ts",
  "src/types/elizaos-tui-fallback.d.ts",
  "src/types/optional-plugin-modules.d.ts",
]);

const BIOME_ROOTS = ["src", "scripts", "apps"];
const BIOME_CHUNK_SIZE = 200;

function getBiomeFiles() {
  const output = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      ...BIOME_ROOTS,
    ],
    { encoding: "utf8" },
  );

  return output
    .split("\0")
    .filter(Boolean)
    .filter((file) => !BIOME_CRASHER_PATHS.has(file));
}

function chunk(items, size) {
  const groups = [];
  for (let index = 0; index < items.length; index += size) {
    groups.push(items.slice(index, index + size));
  }
  return groups;
}

const files = getBiomeFiles();
if (files.length === 0) {
  console.error("[biome-check] No files matched the configured roots.");
  process.exit(1);
}

const extraArgs = process.argv.slice(2);
for (const group of chunk(files, BIOME_CHUNK_SIZE)) {
  const result = spawnSync(
    "bunx",
    ["@biomejs/biome", "check", ...extraArgs, ...group],
    {
      stdio: "inherit",
      shell: process.platform === "win32",
    },
  );

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
