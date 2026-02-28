import { cp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(here, "..");
const sourceDir = path.join(appRoot, "dist");
const targetDir = path.join(appRoot, "electron", "app");
const repoRoot = path.resolve(appRoot, "../..");
const backendSourceDir = path.join(repoRoot, "dist");
const backendTargetDir = path.join(appRoot, "electron", "milady-dist");
const pluginManifestSource = path.join(repoRoot, "plugins.json");

async function ensureDirExists(dir) {
  try {
    const info = await stat(dir);
    return info.isDirectory();
  } catch {
    return false;
  }
}

if (!(await ensureDirExists(sourceDir))) {
  console.error(`[Milady] Web build output not found: ${sourceDir}`);
  console.error(
    "[Milady] Run `bun run build` from apps/app before syncing Electron assets.",
  );
  process.exit(1);
}

await rm(targetDir, { recursive: true, force: true });
await mkdir(targetDir, { recursive: true });
await cp(sourceDir, targetDir, { recursive: true, force: true });

console.info(
  `[Milady] Synced Electron web assets: ${sourceDir} -> ${targetDir}`,
);

// Also sync the backend runtime bundle used by the embedded Electron agent.
// The Electron main process loads `milady-dist/server.js` + `milady-dist/eliza.js`.
if (await ensureDirExists(backendSourceDir)) {
  await rm(backendTargetDir, { recursive: true, force: true });
  await mkdir(backendTargetDir, { recursive: true });
  await cp(backendSourceDir, backendTargetDir, { recursive: true, force: true });
  // Ensure Node treats the copied bundle as ESM when packaged (resources/app.asar.unpacked).
  await writeFile(
    path.join(backendTargetDir, "package.json"),
    '{\n  "type": "module"\n}\n',
    "utf8",
  );
  console.info(
    `[Milady] Synced Electron backend bundle: ${backendSourceDir} -> ${backendTargetDir}`,
  );
  try {
    await cp(pluginManifestSource, path.join(backendTargetDir, "plugins.json"), {
      force: true,
    });
    console.info(
      `[Milady] Synced plugin manifest for embedded backend: ${pluginManifestSource} -> ${path.join(backendTargetDir, "plugins.json")}`,
    );
  } catch {
    console.warn(
      `[Milady] Plugin manifest not found at ${pluginManifestSource}. /api/plugins may be incomplete in packaged builds.`,
    );
  }
} else {
  console.warn(
    `[Milady] Backend build output not found: ${backendSourceDir}. Skipping embedded agent bundle sync.`,
  );
}
