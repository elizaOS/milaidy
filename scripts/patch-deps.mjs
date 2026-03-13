#!/usr/bin/env node
/**
 * Post-install patches for various @elizaos and dependency packages.
 *
 * 1) @elizaos/plugin-sql: Adds .onConflictDoNothing() to createWorld(), guards
 *    ensureEmbeddingDimension(), removes pgcrypto from extension list.
 *    Remove once plugin-sql publishes fixes.
 *
 * 2) Bun exports: Some published @elizaos packages set exports["."].bun =
 *    "./src/index.ts", which only exists in their dev workspace, not in the
 *    npm tarball. Bun picks "bun" first and fails. We remove the dead "bun"/
 *    "default" conditions so Bun resolves via "import" → dist/. WHY: See
 *    docs/plugin-resolution-and-node-path.md "Bun and published package exports".
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  patchBunExports,
  patchExtensionlessJsExports,
  patchNobleHashesCompat,
  patchProperLockfileSignalExitCompat,
} from "./lib/patch-bun-exports.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Patch @elizaos packages whose exports["."].bun points to ./src/index.ts.
// Logic lives in scripts/lib/patch-bun-exports.mjs (testable).
// ---------------------------------------------------------------------------
patchBunExports(root, "@elizaos/plugin-coding-agent");

// @noble/curves and @noble/hashes publish ".js" subpath exports, while ethers
// imports extensionless paths like "@noble/curves/secp256k1" and
// "@noble/hashes/sha3". Add extensionless aliases so Bun resolves them.
patchExtensionlessJsExports(root, "@noble/curves");

// @noble/hashes only exports subpaths with explicit ".js" suffixes (for
// example "./sha3.js"), but ethers imports "@noble/hashes/sha3". Add
// extensionless aliases so Bun resolves the published package at runtime.
patchExtensionlessJsExports(root, "@noble/hashes");
patchNobleHashesCompat(root);
patchProperLockfileSignalExitCompat(root);

/**
 * Patch @pixiv/three-vrm node-material helpers for Three r168+.
 *
 * The published nodes bundle still references THREE_WEBGPU.tslFn in the
 * compatibility helper. Three r182 no longer exports tslFn from three/webgpu,
 * so Vite/Rollup emits a noisy missing-export warning even though the runtime
 * branch would use THREE_TSL.Fn instead. We patch the helper to the modern
 * path directly because this repo pins Three r182.
 */
function findAllThreeVrmNodeFiles() {
  const targets = [];
  const relPaths = ["lib/nodes/index.module.js", "lib/nodes/index.cjs"];
  const searchRoots = [root, resolve(root, "apps/app")];

  for (const searchRoot of searchRoots) {
    for (const relPath of relPaths) {
      const npmTarget = resolve(
        searchRoot,
        `node_modules/@pixiv/three-vrm/${relPath}`,
      );
      if (existsSync(npmTarget) && !targets.includes(npmTarget)) {
        targets.push(npmTarget);
      }
    }

    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@pixiv+three-vrm@")) {
            for (const relPath of relPaths) {
              const bunTarget = resolve(
                bunCacheDir,
                entry,
                `node_modules/@pixiv/three-vrm/${relPath}`,
              );
              if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
                targets.push(bunTarget);
              }
            }
          }
        }
      } catch {
        // Ignore bun cache traversal errors.
      }
    }
  }

  return targets;
}

// ---------------------------------------------------------------------------
// Patch @elizaos/plugin-signal: Fix bugs in the compiled dist.
//
// 1) msg.attachments.length crash when attachments is undefined
// 2) msg.attachments.map crash when attachments is undefined
// 3) pollMessages: add try/catch, envelope unwrapping, receive() null guard
// 4) JSON.parse without try-catch in HTTP client request()
// 5) handleIncomingMessage: add ensureConnection before createMemory
// 6) sendMessage: accept UUID recipients (signal-cli returns UUIDs)
//
// Remove once plugin-signal publishes fixes (>2.0.0-alpha.7).
// ---------------------------------------------------------------------------
{
  const signalPaths = [
    resolve(root, "node_modules/@elizaos/plugin-signal/dist/index.js"),
  ];
  // Also check bun cache
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      for (const entry of readdirSync(bunCacheDir)) {
        if (entry.startsWith("@elizaos+plugin-signal@")) {
          const p = resolve(bunCacheDir, entry, "node_modules/@elizaos/plugin-signal/dist/index.js");
          if (existsSync(p) && !signalPaths.includes(p)) signalPaths.push(p);
        }
      }
    } catch { /* ignore */ }
  }

  for (const target of signalPaths) {
    if (!existsSync(target)) continue;
    let src = readFileSync(target, "utf8");
    let patched = false;

    // Fix 1: msg.attachments.length without null check
    const bug1 = "if (!msg.message && msg.attachments.length === 0)";
    const fix1 = "if (!msg.message && (!msg.attachments || msg.attachments.length === 0))";
    if (src.includes(bug1)) { src = src.replace(bug1, fix1); patched = true; }

    // Fix 2: msg.attachments.map without null check
    const bug2 = "const media = msg.attachments.map(";
    const fix2 = "const media = (msg.attachments || []).map(";
    if (src.includes(bug2)) { src = src.replace(bug2, fix2); patched = true; }

    // Fix 3: pollMessages — try/catch/finally + envelope unwrapping + receive null guard
    // signal-cli REST API returns {envelope:{source,dataMessage:{message,...}}} but
    // the plugin expects flat {sender, message, timestamp, ...} objects.
    const bug3 = `  async pollMessages() {
    if (!this.client || this.isPolling)
      return;
    this.isPolling = true;
    const messages = await this.client.receive();
    for (const msg of messages) {
      await this.handleIncomingMessage(msg);
    }
    this.isPolling = false;
  }`;
    const fix3 = `  static unwrapEnvelope(raw) {
    if (!raw || !raw.envelope) return raw;
    const env = raw.envelope;
    const dm = env.dataMessage || {};
    return {
      sender: env.sourceNumber || env.source,
      senderName: env.sourceName || null,
      message: dm.message || null,
      timestamp: dm.timestamp || env.timestamp,
      groupId: dm.groupInfo?.groupId || null,
      attachments: dm.attachments || null,
      reaction: dm.reaction || null,
      expiresInSeconds: dm.expiresInSeconds || 0,
      viewOnce: dm.viewOnce || false,
      _raw: raw
    };
  }
  async pollMessages() {
    if (!this.client || this.isPolling)
      return;
    this.isPolling = true;
    try {
      const rawMessages = (await this.client.receive()) || [];
      for (const raw of rawMessages) {
        try {
          const msg = SignalService.unwrapEnvelope(raw);
          this.runtime.logger.info({ src: "plugin:signal", sender: msg.sender, hasMessage: !!msg.message, hasAttachments: !!(msg.attachments && msg.attachments.length) }, "Signal message received");
          await this.handleIncomingMessage(msg);
        } catch (msgErr) {
          this.runtime.logger.error({ src: "plugin:signal", error: String(msgErr) }, "Error handling incoming message");
        }
      }
    } catch (err) {
      this.runtime.logger.error({ src: "plugin:signal", error: String(err) }, "Error polling messages");
    } finally {
      this.isPolling = false;
    }
  }`;
    if (src.includes(bug3)) { src = src.replace(bug3, fix3); patched = true; }

    // Fix 4: JSON.parse without try-catch in request()
    const bug4 = `    const text = await response.text();
    return text ? JSON.parse(text) : {};`;
    const fix4 = `    const text = await response.text();
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      throw new Error(\`Signal API returned invalid JSON: \${text.slice(0, 200)}\`);
    }`;
    if (src.includes(bug4)) { src = src.replace(bug4, fix4); patched = true; }

    // Fix 5: handleIncomingMessage — add ensureConnection before createMemory
    // Without this, the entity/room/world don't exist and DB insert fails.
    const bug5 = `    const memory = await this.buildMemoryFromMessage(msg);
    if (!memory)
      return;
    const room = await this.ensureRoomExists(msg.sender, msg.groupId);
    await this.runtime.createMemory(memory, "messages");
    await this.runtime.emitEvent("SIGNAL_MESSAGE_RECEIVED" /* MESSAGE_RECEIVED */, {
      runtime: this.runtime,
      source: "signal"
    });
    await this.processMessage(memory, room, msg.sender, msg.groupId);`;
    const fix5 = `    const entityId = this.getEntityId(msg.sender);
    const roomId = await this.getRoomId(msg.sender, msg.groupId);
    const worldId = createUniqueUuid(this.runtime, "signal-world");
    const displayName = msg.senderName || (this.contactCache.get(msg.sender) ? getSignalContactDisplayName(this.contactCache.get(msg.sender)) : msg.sender);
    await this.runtime.ensureConnection({
      entityId,
      roomId,
      worldId,
      worldName: "Signal",
      userName: displayName,
      name: displayName,
      source: "signal",
      type: isGroupMessage ? ChannelType.GROUP : ChannelType.DM,
      channelId: msg.groupId || msg.sender
    });
    const memory = await this.buildMemoryFromMessage(msg);
    if (!memory)
      return;
    await this.runtime.createMemory(memory, "messages");
    await this.runtime.emitEvent("SIGNAL_MESSAGE_RECEIVED" /* MESSAGE_RECEIVED */, {
      runtime: this.runtime,
      source: "signal"
    });
    const room = await this.runtime.getRoom(roomId);
    await this.processMessage(memory, room, msg.sender, msg.groupId);`;
    if (src.includes(bug5)) { src = src.replace(bug5, fix5); patched = true; }

    // Fix 6: sendMessage — accept UUID recipients (signal-cli returns UUIDs not phone numbers)
    const bug6 = `    const normalizedRecipient = normalizeE164(recipient);
    if (!normalizedRecipient) {
      throw new Error(\`Invalid recipient number: \${recipient}\`);
    }`;
    const fix6 = `    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipient);
    const normalizedRecipient = isUuid ? recipient : normalizeE164(recipient);
    if (!normalizedRecipient) {
      throw new Error(\`Invalid recipient number: \${recipient}\`);
    }`;
    if (src.includes(bug6)) { src = src.replace(bug6, fix6); patched = true; }

    if (patched) {
      writeFileSync(target, src, "utf8");
      console.log(`[patch-deps] Applied @elizaos/plugin-signal patches: ${target}`);
    } else {
      console.log(`[patch-deps] @elizaos/plugin-signal patches already applied or not needed: ${target}`);
    }
  }
}

const threeVrmNodeTargets = findAllThreeVrmNodeFiles();
const threeVrmFnCompatBuggy = `return THREE_WEBGPU.tslFn(jsFunc);`;
const threeVrmFnCompatFixed = `return THREE_TSL.Fn(jsFunc);`;

if (threeVrmNodeTargets.length === 0) {
  console.log("[patch-deps] three-vrm nodes bundle not found, skipping patch.");
} else {
  console.log(
    `[patch-deps] Found ${threeVrmNodeTargets.length} three-vrm node file(s) to patch.`,
  );

  for (const target of threeVrmNodeTargets) {
    console.log(`[patch-deps] Patching three-vrm nodes: ${target}`);
    let src = readFileSync(target, "utf8");

    if (!src.includes(threeVrmFnCompatBuggy)) {
      if (src.includes(threeVrmFnCompatFixed)) {
        console.log("  - three-vrm FnCompat patch already present.");
      } else {
        console.log(
          "  - three-vrm FnCompat signature changed — patch may no longer be needed.",
        );
      }
      continue;
    }

    src = src.replaceAll(threeVrmFnCompatBuggy, threeVrmFnCompatFixed);
    writeFileSync(target, src, "utf8");
    console.log("  - Applied three-vrm FnCompat patch for Three r182.");
  }
}
