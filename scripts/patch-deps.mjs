#!/usr/bin/env node
/**
 * Post-install patches for @elizaos/plugin-sql.
 *
 * 1) Adds .onConflictDoNothing() to createWorld() to prevent duplicate world
 *    insert errors on repeated ensureWorldExists() calls.
 * 2) Guards ensureEmbeddingDimension() so unsupported dimensions don't set the
 *    embedding column to undefined (which crashes drizzle query planning).
 * 3) Removes pgcrypto from extension list (not used, causes PGlite warnings).
 *
 * Remove these once plugin-sql publishes fixes for both paths.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  const homeNodeModules = resolve(process.env.HOME || "", "node_modules");
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
