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
import { patchBunExports } from "./lib/patch-bun-exports.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Find ALL plugin-sql dist files - handles both npm and bun cache structures.
 * Returns array of all found paths including BOTH node and browser builds
 * (bun can have multiple copies with different hashes and might use either).
 * Also searches the eliza submodule's node_modules.
 */
function findAllPluginSqlDists() {
  const targets = [];
  const distPaths = [
    "dist/node/index.node.js",
    "dist/browser/index.browser.js",
  ];

  // Search roots: main project, eliza submodule, plugin submodules, and global node_modules
  const searchRoots = [root];
  const elizaRoot = resolve(root, "eliza");
  if (existsSync(resolve(elizaRoot, "node_modules"))) {
    searchRoots.push(elizaRoot);
  }

  // Also check global node_modules in home directory (bun may resolve from there)
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  // Also check for plugin-sql as a local plugin submodule
  const pluginSqlRoot = resolve(root, "plugins/plugin-sql/typescript");
  if (existsSync(pluginSqlRoot)) {
    for (const distPath of distPaths) {
      const pluginTarget = resolve(pluginSqlRoot, distPath);
      if (existsSync(pluginTarget) && !targets.includes(pluginTarget)) {
        targets.push(pluginTarget);
      }
    }
  }

  for (const searchRoot of searchRoots) {
    // Standard npm location
    for (const distPath of distPaths) {
      const npmTarget = resolve(
        searchRoot,
        `node_modules/@elizaos/plugin-sql/${distPath}`,
      );
      if (existsSync(npmTarget) && !targets.includes(npmTarget)) {
        targets.push(npmTarget);
      }
    }

    // Bun cache location (node_modules/.bun/@elizaos+plugin-sql@*/...)
    // Bun can have multiple copies with different content hashes
    const bunCacheDir = resolve(searchRoot, "node_modules/.bun");
    if (existsSync(bunCacheDir)) {
      try {
        const entries = readdirSync(bunCacheDir);
        for (const entry of entries) {
          if (entry.startsWith("@elizaos+plugin-sql@")) {
            for (const distPath of distPaths) {
              const bunTarget = resolve(
                bunCacheDir,
                entry,
                `node_modules/@elizaos/plugin-sql/${distPath}`,
              );
              if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
                targets.push(bunTarget);
              }
            }
          }
        }
      } catch {
        // Ignore errors reading bun cache
      }
    }
  }

  return targets;
}

const targets = findAllPluginSqlDists();

if (targets.length === 0) {
  console.log("[patch-deps] plugin-sql dist not found, skipping patch.");
  process.exit(0);
}

console.log(
  `[patch-deps] Found ${targets.length} plugin-sql dist file(s) to patch.`,
);

// Patch definitions
const createWorldBuggy = `await this.db.insert(worldTable).values({
        ...world,
        id: newWorldId,
        name: world.name || ""
      });`;

const createWorldFixed = `await this.db.insert(worldTable).values({
        ...world,
        id: newWorldId,
        name: world.name || ""
      }).onConflictDoNothing();`;

const embeddingBuggy = `this.embeddingDimension = DIMENSION_MAP[dimension];`;
const embeddingFixed = `const resolvedDimension = DIMENSION_MAP[dimension];
				if (!resolvedDimension) {
					const fallbackDimension = this.embeddingDimension ?? DIMENSION_MAP[384];
					this.embeddingDimension = fallbackDimension;
					logger10.warn(
						{
							src: "plugin:sql",
							requestedDimension: dimension,
							fallbackDimension,
						},
						"Unsupported embedding dimension requested; keeping fallback embedding column",
					);
					return;
				}
				this.embeddingDimension = resolvedDimension;`;

// Patch: Remove pgcrypto from extension list entirely
// pgcrypto is not used in the codebase and PGlite doesn't support it
// We check for multiple patterns since we may have already partially patched
const extensionsPatterns = [
  // Original unpatched code (newer format)
  `const extensions = isRealPostgres ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`,
  // Previously patched with isPglite check
  `const isPglite = !!process.env.PGLITE_DATA_DIR;
      const extensions = isRealPostgres && !isPglite ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`,
];
// Fixed: just never include pgcrypto - it's not used and causes PGlite warnings
const extensionsNoPgcrypto = `const extensions = ["vector", "fuzzystrmatch"];`;

// Older format: extensions passed directly to installRequiredExtensions
const extensionsInlinePatterns = [
  // Hardcoded array with pgcrypto
  `await this.extensionManager.installRequiredExtensions([
        "vector",
        "fuzzystrmatch",
        "pgcrypto"
      ]);`,
  // Single-line variant
  `await this.extensionManager.installRequiredExtensions(["vector", "fuzzystrmatch", "pgcrypto"]);`,
];
const extensionsInlineFixed = `await this.extensionManager.installRequiredExtensions([
        "vector",
        "fuzzystrmatch"
      ]);`;

// Apply patches to each found plugin-sql dist file
for (const target of targets) {
  console.log(`[patch-deps] Patching: ${target}`);
  let src = readFileSync(target, "utf8");
  let patched = 0;

  if (src.includes(createWorldFixed)) {
    console.log("  - createWorld conflict patch already present.");
  } else if (src.includes(createWorldBuggy)) {
    src = src.replace(createWorldBuggy, createWorldFixed);
    patched += 1;
    console.log("  - Applied createWorld onConflictDoNothing() patch.");
  } else {
    console.log(
      "  - createWorld() signature changed — world patch may no longer be needed.",
    );
  }

  if (src.includes(embeddingFixed)) {
    console.log("  - ensureEmbeddingDimension guard patch already present.");
  } else if (src.includes(embeddingBuggy)) {
    src = src.replace(embeddingBuggy, embeddingFixed);
    patched += 1;
    console.log("  - Applied ensureEmbeddingDimension guard patch.");
  } else {
    console.log(
      "  - ensureEmbeddingDimension signature changed — embedding patch may no longer be needed.",
    );
  }

  // Check for pgcrypto removal (const extensions = ... pattern)
  if (src.includes(extensionsNoPgcrypto)) {
    console.log("  - pgcrypto removal patch already present.");
  } else {
    let pgcryptoPatched = false;
    for (const pattern of extensionsPatterns) {
      if (src.includes(pattern)) {
        src = src.replace(pattern, extensionsNoPgcrypto);
        patched += 1;
        pgcryptoPatched = true;
        console.log("  - Removed pgcrypto from extensions list.");
        break;
      }
    }
    if (!pgcryptoPatched) {
      // Check for inline pattern (older code format)
      for (const pattern of extensionsInlinePatterns) {
        if (src.includes(pattern)) {
          src = src.replace(pattern, extensionsInlineFixed);
          patched += 1;
          pgcryptoPatched = true;
          console.log("  - Removed pgcrypto from inline extensions call.");
          break;
        }
      }
    }
    if (!pgcryptoPatched && !src.includes(extensionsInlineFixed)) {
      console.log(
        "  - Extension installation code changed — pgcrypto patch may no longer be needed.",
      );
    } else if (!pgcryptoPatched && src.includes(extensionsInlineFixed)) {
      console.log("  - pgcrypto inline removal patch already present.");
    }
  }

  if (patched > 0) {
    writeFileSync(target, src, "utf8");
    console.log(`  - Wrote ${patched} patch(es) to this file.`);
  } else {
    console.log("  - No patches needed for this file.");
  }
}

/**
 * Patch @elizaos/plugin-elizacloud (next tag currently points to alpha.4)
 * to avoid AI SDK warnings from unsupported params on Responses API models.
 */
const cloudTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-elizacloud/dist/node/index.node.js",
);

if (!existsSync(cloudTarget)) {
  console.log("[patch-deps] plugin-elizacloud dist not found, skipping patch.");
} else {
  let cloudSrc = readFileSync(cloudTarget, "utf8");
  let cloudPatched = 0;

  const cloudBuggy = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt, stopSequences = [] } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const maxTokens = params.maxTokens ?? 8192;
  const openai = createOpenAIClient(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  const model = openai.languageModel(modelName);
  const generateParams = {
    model,
    prompt,
    system: runtime.character.system ?? undefined,
    temperature,
    maxOutputTokens: maxTokens,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  const cloudFixed = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt } = params;
  const maxTokens = params.maxTokens ?? 8192;
  const openai = createOpenAIClient(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const experimentalTelemetry = getExperimentalTelemetry(runtime);
  const model = openai.chat(modelName);
  const lowerModelName = modelName.toLowerCase();
  const supportsStopSequences = !lowerModelName.startsWith("openai/") && !lowerModelName.startsWith("anthropic/") && !["o1", "o3", "o4", "gpt-5", "gpt-5-mini"].some((pattern) => lowerModelName.includes(pattern));
  const stopSequences = supportsStopSequences && Array.isArray(params.stopSequences) && params.stopSequences.length > 0 ? params.stopSequences : void 0;
  const generateParams = {
    model,
    prompt,
    system: runtime.character.system ?? undefined,
    ...(stopSequences ? { stopSequences } : {}),
    maxOutputTokens: maxTokens,
    experimental_telemetry: {
      isEnabled: experimentalTelemetry
    }
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  if (cloudSrc.includes(cloudFixed)) {
    console.log("[patch-deps] elizacloud warning patch already present.");
  } else if (cloudSrc.includes(cloudBuggy)) {
    cloudSrc = cloudSrc.replace(cloudBuggy, cloudFixed);
    cloudPatched += 1;
    console.log("[patch-deps] Applied elizacloud responses-compat patch.");
  } else {
    console.log(
      "[patch-deps] elizacloud buildGenerateParams signature changed; skip patch.",
    );
  }

  if (cloudPatched > 0) {
    writeFileSync(cloudTarget, cloudSrc, "utf8");
    console.log(
      `[patch-deps] Wrote ${cloudPatched} plugin-elizacloud patch(es).`,
    );
  }
}

/**
 * Patch @elizaos/plugin-openrouter (next tag currently points to alpha.5)
 * so unsupported sampling params are not forced for Responses-routed models.
 */
const openrouterTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-openrouter/dist/node/index.node.js",
);

if (!existsSync(openrouterTarget)) {
  console.log("[patch-deps] plugin-openrouter dist not found, skipping patch.");
} else {
  let openrouterSrc = readFileSync(openrouterTarget, "utf8");
  let openrouterPatched = 0;

  const openrouterBuggy = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt, stopSequences = [] } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const paramsWithMax = params;
  const resolvedMaxOutput = paramsWithMax.maxOutputTokens ?? paramsWithMax.maxTokens ?? 8192;
  const openrouter = createOpenRouterProvider(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const generateParams = {
    model: openrouter.chat(modelName),
    prompt,
    system: runtime.character?.system ?? undefined,
    temperature,
    frequencyPenalty,
    presencePenalty,
    stopSequences,
    maxOutputTokens: resolvedMaxOutput
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  const openrouterFixed = `function buildGenerateParams(runtime, modelType, params) {
  const { prompt } = params;
  const temperature = params.temperature ?? 0.7;
  const frequencyPenalty = params.frequencyPenalty ?? 0.7;
  const presencePenalty = params.presencePenalty ?? 0.7;
  const paramsWithMax = params;
  const resolvedMaxOutput = paramsWithMax.maxOutputTokens ?? paramsWithMax.maxTokens ?? 8192;
  const openrouter = createOpenRouterProvider(runtime);
  const modelName = modelType === ModelType4.TEXT_SMALL ? getSmallModel(runtime) : getLargeModel(runtime);
  const modelLabel = modelType === ModelType4.TEXT_SMALL ? "TEXT_SMALL" : "TEXT_LARGE";
  const lowerModelName = modelName.toLowerCase();
  const supportsSampling = !lowerModelName.startsWith("openai/") && !lowerModelName.startsWith("anthropic/") && !["o1", "o3", "o4", "gpt-5", "gpt-5-mini"].some((pattern) => lowerModelName.includes(pattern));
  const stopSequences = supportsSampling && Array.isArray(params.stopSequences) && params.stopSequences.length > 0 ? params.stopSequences : void 0;
  const generateParams = {
    model: openrouter.chat(modelName),
    prompt,
    system: runtime.character?.system ?? undefined,
    ...(supportsSampling ? {
      temperature,
      frequencyPenalty,
      presencePenalty,
      ...(stopSequences ? {
        stopSequences
      } : {})
    } : {}),
    maxOutputTokens: resolvedMaxOutput
  };
  return { generateParams, modelName, modelLabel, prompt };
}`;

  if (openrouterSrc.includes(openrouterFixed)) {
    console.log("[patch-deps] openrouter sampling patch already present.");
  } else if (openrouterSrc.includes(openrouterBuggy)) {
    openrouterSrc = openrouterSrc.replace(openrouterBuggy, openrouterFixed);
    openrouterPatched += 1;
    console.log("[patch-deps] Applied openrouter sampling-compat patch.");
  } else {
    console.log(
      "[patch-deps] openrouter buildGenerateParams signature changed; skip patch.",
    );
  }

  if (openrouterPatched > 0) {
    writeFileSync(openrouterTarget, openrouterSrc, "utf8");
    console.log(
      `[patch-deps] Wrote ${openrouterPatched} plugin-openrouter patch(es).`,
    );
  }
}

/**
 * Patch @elizaos/plugin-twitter POST_TWEET action to upload image attachments.
 *
 * The action handler only passes text to sendTweet(), ignoring any
 * message.content.attachments (e.g. images sent from the chat UI).
 * This patch reads image data from the non-standard `_data`/`_mimeType` fields
 * that Milady sets on attachments (keeping the `url` field compact to avoid
 * bloating the LLM context window with base64 strings).
 *
 * Remove once plugin-twitter ships native attachment support.
 */
const twitterTarget = resolve(
  root,
  "node_modules/@elizaos/plugin-twitter/dist/index.js",
);

if (!existsSync(twitterTarget)) {
  console.log("[patch-deps] plugin-twitter dist not found, skipping patch.");
} else {
  let twitterSrc = readFileSync(twitterTarget, "utf8");

  // Original unpatched code.
  const twitterBuggy = `      const result = await client.twitterClient.sendTweet(finalTweetText);`;

  // v1 patch (url-based — reads base64 from att.url, may already be applied).
  const twitterV1Fixed = `      // Upload any image attachments from the user's chat message
      const imageAttachments = message.content?.attachments?.filter(
        (att) => att.contentType === "image" || (att.url && att.url.startsWith("data:image/"))
      ) ?? [];
      const tweetMediaIds = [];
      for (const att of imageAttachments) {
        try {
          const dataUrl = att.url ?? "";
          const commaIdx = dataUrl.indexOf(",");
          if (commaIdx === -1) continue;
          const base64Data = dataUrl.slice(commaIdx + 1);
          const mimeMatch = dataUrl.match(/^data:([^;]+);/);
          const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          const buffer = Buffer.from(base64Data, "base64");
          const mediaId = await client.twitterClient.uploadMedia(buffer, { mimeType });
          tweetMediaIds.push(mediaId);
        } catch (mediaErr) {
          logger14.warn("Failed to upload tweet media attachment:", mediaErr);
        }
      }
      const result = await client.twitterClient.sendTweet(
        finalTweetText,
        void 0,
        void 0,
        void 0,
        tweetMediaIds.length > 0 ? tweetMediaIds : void 0
      );`;

  // v2 patch — reads base64 from att._data/_mimeType so the url field stays
  // compact (attachment:img-0) and doesn't consume LLM context tokens.
  const twitterFixed = `      // Upload any image attachments from the user's chat message
      const imageAttachments = message.content?.attachments?.filter(
        (att) => att.contentType === "image" && (att._data || (att.url && att.url.startsWith("data:image/")))
      ) ?? [];
      const tweetMediaIds = [];
      for (const att of imageAttachments) {
        try {
          let base64Data, mimeType;
          if (att._data) {
            base64Data = att._data;
            mimeType = att._mimeType || "image/jpeg";
          } else {
            const dataUrl = att.url ?? "";
            const commaIdx = dataUrl.indexOf(",");
            if (commaIdx === -1) continue;
            base64Data = dataUrl.slice(commaIdx + 1);
            const mimeMatch = dataUrl.match(/^data:([^;]+);/);
            mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
          }
          const buffer = Buffer.from(base64Data, "base64");
          const mediaId = await client.twitterClient.uploadMedia(buffer, { mimeType });
          tweetMediaIds.push(mediaId);
        } catch (mediaErr) {
          logger14.warn("Failed to upload tweet media attachment:", mediaErr);
        }
      }
      const result = await client.twitterClient.sendTweet(
        finalTweetText,
        void 0,
        void 0,
        void 0,
        tweetMediaIds.length > 0 ? tweetMediaIds : void 0
      );`;

  // v2 is uniquely identified by reading from att._data (not att.url)
  const twitterV2Marker = `if (att._data) {`;
  if (twitterSrc.includes(twitterV2Marker)) {
    console.log(
      "[patch-deps] twitter POST_TWEET media patch (v2) already present.",
    );
  } else if (twitterSrc.includes(twitterV1Fixed.slice(0, 80))) {
    twitterSrc = twitterSrc.replace(twitterV1Fixed, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log("[patch-deps] Upgraded twitter POST_TWEET media patch to v2.");
  } else if (twitterSrc.includes(twitterBuggy)) {
    twitterSrc = twitterSrc.replace(twitterBuggy, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log(
      "[patch-deps] Applied twitter POST_TWEET media upload patch (v2).",
    );
  } else {
    console.log(
      "[patch-deps] twitter POST_TWEET sendTweet call changed — media patch may no longer be needed.",
    );
  }
}

/**
 * Patch @elizaos/plugin-pdf to fix ESM compatibility with pdfjs-dist.
 *
 * pdfjs-dist doesn't provide a default export in ESM mode, so
 * `import pkg from "pdfjs-dist"` fails. We patch it to use namespace import.
 *
 * Remove once plugin-pdf publishes a fix for ESM compatibility.
 */
function findAllPluginPdfDists() {
  const targets = [];
  const distPaths = [
    "dist/node/index.node.js",
    "dist/browser/index.browser.js",
  ];

  const searchRoots = [root];
  const homeDir = process.env.HOME || process.env.USERPROFILE || "";
  const homeNodeModules = resolve(homeDir, "node_modules");
  if (existsSync(homeNodeModules)) {
    searchRoots.push(resolve(homeNodeModules, ".."));
  }

  for (const searchRoot of searchRoots) {
    for (const distPath of distPaths) {
      const npmTarget = resolve(
        searchRoot,
        `node_modules/@elizaos/plugin-pdf/${distPath}`,
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
          if (entry.startsWith("@elizaos+plugin-pdf@")) {
            for (const distPath of distPaths) {
              const bunTarget = resolve(
                bunCacheDir,
                entry,
                `node_modules/@elizaos/plugin-pdf/${distPath}`,
              );
              if (existsSync(bunTarget) && !targets.includes(bunTarget)) {
                targets.push(bunTarget);
              }
            }
          }
        }
      } catch {
        // Ignore errors reading bun cache
      }
    }
  }

  return targets;
}

const pdfTargets = findAllPluginPdfDists();

if (pdfTargets.length === 0) {
  console.log("[patch-deps] plugin-pdf dist not found, skipping patch.");
} else {
  console.log(
    `[patch-deps] Found ${pdfTargets.length} plugin-pdf dist file(s) to patch.`,
  );

  // Use regex to match various minified patterns of the default import
  // Pattern: import <var> from "pdfjs-dist" or import <var> from"pdfjs-dist"
  const pdfBuggyImportRegex = /import\s+(\w+)\s+from\s*"pdfjs-dist"/g;

  for (const target of pdfTargets) {
    console.log(`[patch-deps] Patching plugin-pdf: ${target}`);
    let src = readFileSync(target, "utf8");
    let patched = false;

    if (src.includes("import * as") && src.includes("pdfjs-dist")) {
      console.log("  - pdfjs-dist ESM import patch already present.");
    } else {
      // Find all default imports from pdfjs-dist and replace with namespace imports
      const matches = [...src.matchAll(pdfBuggyImportRegex)];
      if (matches.length > 0) {
        for (const match of matches) {
          const varName = match[1];
          const originalImport = match[0];
          const fixedImport = `import * as ${varName} from "pdfjs-dist"`;
          src = src.replace(originalImport, fixedImport);
          patched = true;
        }
        if (patched) {
          console.log(
            `  - Applied pdfjs-dist ESM namespace import patch (${matches.length} occurrence(s)).`,
          );
        }
      } else if (src.includes("pdfjs-dist")) {
        console.log(
          "  - pdfjs-dist import pattern changed — patch may need updating.",
        );
      } else {
        console.log(
          "  - pdfjs-dist import not found — patch may no longer be needed.",
        );
      }
    }

    if (patched) {
      writeFileSync(target, src, "utf8");
      console.log("  - Wrote pdfjs-dist ESM patch.");
    }
  }
}

// ---------------------------------------------------------------------------
// Patch @elizaos packages whose exports["."].bun points to ./src/index.ts.
// Logic lives in scripts/lib/patch-bun-exports.mjs (testable).
// ---------------------------------------------------------------------------
patchBunExports(root, "@elizaos/plugin-coding-agent");
