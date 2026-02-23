/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-var-requires */
const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const chokidar = require("chokidar");
const electron = require("electron");

let child = null;
const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";
const bunxCmd = process.platform === "win32" ? "bunx.cmd" : "bunx";
const electronDir = __dirname;
const repoRoot = path.resolve(__dirname, "../../..");
const rootSrcDir = path.join(repoRoot, "src");
const rootDistDir = path.join(repoRoot, "dist");
const rootDistPackageJson = path.join(rootDistDir, "package.json");
const watchGlobs = [path.join(electronDir, "src/**/*"), `${rootSrcDir}/**/*`];
const reloadWatcher = {
  debouncer: null,
  ready: false,
  watcher: null,
  restarting: false,
  needsRootBuild: true,
};

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const tempChild = cp.spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    tempChild.once("error", reject);
    tempChild.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`,
        ),
      );
    });
    tempChild.stdout?.pipe(process.stdout);
    tempChild.stderr?.pipe(process.stderr);
  });
}

async function runRootBuildIfNeeded() {
  if (!reloadWatcher.needsRootBuild) return;

  console.log("[live-runner] Building Milady dist (tsdown)");
  await runCommand(bunxCmd, ["tsdown"], { cwd: repoRoot });

  fs.mkdirSync(rootDistDir, { recursive: true });
  fs.writeFileSync(rootDistPackageJson, '{"type":"module"}\n', "utf-8");
  reloadWatcher.needsRootBuild = false;
}

async function runBuild() {
  await runRootBuildIfNeeded();
  await runCommand(npmCmd, ["run", "build"], { cwd: electronDir });
}

async function spawnElectron() {
  if (child !== null) {
    child.stdin.pause();
    child.kill();
    child = null;
  }
  await runBuild();
  child = cp.spawn(electron, ["--inspect=5858", "./"], { cwd: electronDir });
  child.on("exit", () => {
    if (!reloadWatcher.restarting) {
      process.exit(0);
    }
  });
  child.stdout?.pipe(process.stdout);
  child.stderr?.pipe(process.stderr);
}

function setupReloadWatcher() {
  reloadWatcher.watcher = chokidar
    .watch(watchGlobs, {
      ignored: /[/\\]\./,
      persistent: true,
    })
    .on("ready", () => {
      reloadWatcher.ready = true;
    })
    .on("all", (_event, changedPath) => {
      if (reloadWatcher.ready) {
        const absolutePath = path.resolve(changedPath);
        if (
          absolutePath === rootSrcDir ||
          absolutePath.startsWith(`${rootSrcDir}${path.sep}`)
        ) {
          reloadWatcher.needsRootBuild = true;
        }
        clearTimeout(reloadWatcher.debouncer);
        reloadWatcher.debouncer = setTimeout(async () => {
          console.log("Restarting");
          reloadWatcher.restarting = true;
          try {
            await spawnElectron();
          } catch (err) {
            console.error(
              "[live-runner] Restart failed:",
              err instanceof Error ? err.message : err,
            );
          }
          reloadWatcher.restarting = false;
          reloadWatcher.ready = false;
          clearTimeout(reloadWatcher.debouncer);
          reloadWatcher.debouncer = null;
          reloadWatcher.watcher = null;
          setupReloadWatcher();
        }, 500);
      }
    });
}

(async () => {
  try {
    await spawnElectron();
  } catch (err) {
    console.error(
      "[live-runner] Failed to start Electron:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
  setupReloadWatcher();
})();
