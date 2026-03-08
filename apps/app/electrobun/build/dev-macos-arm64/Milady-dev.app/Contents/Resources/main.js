// @bun
var __require = import.meta.require;

// src/launcher/main.ts
import { join, dirname, resolve } from "path";
import { dlopen, suffix, ptr, toArrayBuffer } from "bun:ffi";
import { existsSync, writeFileSync } from "fs";
import { tmpdir } from "os";
var pathToMacOS = dirname(process.argv0);
var libPath = join(pathToMacOS, `libNativeWrapper.${suffix}`);
var absoluteLibPath = resolve(libPath);
function main() {
  let channel = "";
  let identifier = "";
  let name = "";
  try {
    const pathToLauncherBin2 = process.argv0;
    const pathToBinDir2 = dirname(pathToLauncherBin2);
    const versionJsonPath = join(pathToBinDir2, "..", "Resources", "version.json");
    if (existsSync(versionJsonPath)) {
      const versionInfo = __require(versionJsonPath);
      if (versionInfo.identifier) {
        identifier = versionInfo.identifier;
      }
      if (versionInfo.name) {
        name = versionInfo.name;
      }
      if (versionInfo.channel) {
        channel = versionInfo.channel;
      }
      console.log(`[LAUNCHER] Loaded identifier: ${identifier}, name: ${name}, channel: ${channel}`);
    }
  } catch (error) {
    console.error(`[LAUNCHER] Warning: Could not read version.json:`, error);
  }
  if (process.platform === "linux") {
    const cefLibs = [
      join(pathToMacOS, "libcef.so"),
      join(pathToMacOS, "libvk_swiftshader.so")
    ];
    const existingCefLibs = cefLibs.filter((lib2) => existsSync(lib2));
    if (existingCefLibs.length > 0 && !process.env["LD_PRELOAD"]) {
      console.error(`[LAUNCHER] ERROR: CEF libraries found but LD_PRELOAD not set!`);
      console.error(`[LAUNCHER] Please run through the wrapper script: ./run.sh`);
      console.error(`[LAUNCHER] Or set: LD_PRELOAD="${existingCefLibs.join(":")}" before starting.`);
      const { spawn } = __require("child_process");
      const env = { ...process.env, LD_PRELOAD: existingCefLibs.join(":") };
      const child = spawn(process.argv[0], process.argv.slice(1), {
        env,
        stdio: "inherit"
      });
      child.on("exit", (code) => process.exit(code ?? 1));
      return;
    }
  }
  let lib;
  try {
    if (!process.env["LD_LIBRARY_PATH"]?.includes(".")) {
      process.env["LD_LIBRARY_PATH"] = `.${process.env["LD_LIBRARY_PATH"] ? ":" + process.env["LD_LIBRARY_PATH"] : ""}`;
    }
    lib = dlopen(libPath, {
      startEventLoop: {
        args: ["cstring", "cstring", "cstring"],
        returns: "void"
      },
      forceExit: {
        args: ["i32"],
        returns: "void"
      }
    });
  } catch (error) {
    console.error(`[LAUNCHER] Failed to load library: ${error.message}`);
    try {
      lib = dlopen(absoluteLibPath, {
        startEventLoop: {
          args: ["cstring", "cstring", "cstring"],
          returns: "void"
        },
        forceExit: {
          args: ["i32"],
          returns: "void"
        }
      });
    } catch (absError) {
      console.error(`[LAUNCHER] Library loading failed. Try running: ldd ${libPath}`);
      throw error;
    }
  }
  const pathToLauncherBin = process.argv0;
  const pathToBinDir = dirname(pathToLauncherBin);
  const resourcesDir = join(pathToBinDir, "..", "Resources");
  const asarPath = join(resourcesDir, "app.asar");
  const appFolderPath = join(resourcesDir, "app");
  let appEntrypointPath;
  if (existsSync(asarPath)) {
    console.log(`[LAUNCHER] Loading app code from ASAR: ${asarPath}`);
    let asarLibPath;
    let asarLib;
    if (process.platform === "win32") {
      asarLibPath = libPath;
      console.log(`[LAUNCHER] Using native wrapper's ASAR reader: ${asarLibPath}`);
    } else {
      asarLibPath = join(pathToMacOS, `libasar.${suffix}`);
    }
    try {
      asarLib = dlopen(asarLibPath, {
        asar_open: { args: ["cstring"], returns: "ptr" },
        asar_read_file: { args: ["ptr", "cstring", "ptr"], returns: "ptr" },
        asar_free_buffer: { args: ["ptr", "u64"], returns: "void" },
        asar_close: { args: ["ptr"], returns: "void" }
      });
    } catch (error) {
      console.error(`[LAUNCHER] Failed to load ASAR library: ${error.message}`);
      throw error;
    }
    const asarArchive = asarLib.symbols.asar_open(ptr(new Uint8Array(Buffer.from(asarPath + "\x00", "utf8"))));
    if (!asarArchive || asarArchive === 0n) {
      console.error(`[LAUNCHER] Failed to open ASAR archive at: ${asarPath}`);
      throw new Error("Failed to open ASAR archive");
    }
    const filePath = "bun/index.js";
    const sizeBuffer = new BigUint64Array(1);
    const fileDataPtr = asarLib.symbols.asar_read_file(asarArchive, ptr(new Uint8Array(Buffer.from(filePath + "\x00", "utf8"))), ptr(sizeBuffer));
    if (!fileDataPtr || fileDataPtr === 0n) {
      console.error(`[LAUNCHER] Failed to read ${filePath} from ASAR`);
      asarLib.symbols.asar_close(asarArchive);
      throw new Error(`Failed to read ${filePath} from ASAR`);
    }
    const fileSize = Number(sizeBuffer[0]);
    console.log(`[LAUNCHER] Read ${fileSize} bytes from ASAR for ${filePath}`);
    const arrayBuffer = toArrayBuffer(fileDataPtr, 0, fileSize);
    const fileData = Buffer.from(arrayBuffer);
    const systemTmpDir = tmpdir();
    const randomFileName = `electrobun-${Date.now()}-${Math.random().toString(36).substring(7)}.js`;
    appEntrypointPath = join(systemTmpDir, randomFileName);
    const wrappedFileData = `
// Auto-delete temp file after Worker loads it
const __tempFilePath = "${appEntrypointPath}";
setTimeout(() => {
    try {
        require("fs").unlinkSync(__tempFilePath);
        console.log("[LAUNCHER] Deleted temp file:", __tempFilePath);
    } catch (error) {
        console.warn("[LAUNCHER] Failed to delete temp file:", error.message);
    }
}, 100);

${fileData.toString("utf8")}
`;
    writeFileSync(appEntrypointPath, wrappedFileData);
    console.log(`[LAUNCHER] Wrote app entrypoint to: ${appEntrypointPath}`);
    asarLib.symbols.asar_free_buffer(fileDataPtr, BigInt(fileSize));
    asarLib.symbols.asar_close(asarArchive);
  } else {
    console.log(`[LAUNCHER] Loading app code from flat files`);
    appEntrypointPath = join(appFolderPath, "bun", "index.js");
  }
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => {});
  new Worker(appEntrypointPath, {});
  lib.symbols.startEventLoop(ptr(new Uint8Array(Buffer.from(identifier + "\x00", "utf8"))), ptr(new Uint8Array(Buffer.from(name + "\x00", "utf8"))), ptr(new Uint8Array(Buffer.from(channel + "\x00", "utf8"))));
  lib.symbols.forceExit(0);
}
main();
