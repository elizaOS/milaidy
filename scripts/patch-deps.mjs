#!/usr/bin/env node
/**
 * Post-install patches for @elizaos/plugin-sql.
 *
 * 1) Adds .onConflictDoNothing() to createWorld() to prevent duplicate world
 *    insert errors on repeated ensureWorldExists() calls.
 * 2) Guards ensureEmbeddingDimension() so unsupported dimensions don't set the
 *    embedding column to undefined (which crashes drizzle query planning).
 *
 * Remove these once plugin-sql publishes fixes for both paths.
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

const target = resolve(
  root,
  "node_modules/@elizaos/plugin-sql/dist/node/index.node.js",
);

if (!existsSync(target)) {
  console.log("[patch-deps] plugin-sql dist not found, skipping patch.");
  process.exit(0);
}

let src = readFileSync(target, "utf8");
let patched = 0;

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

if (src.includes(createWorldFixed)) {
  console.log("[patch-deps] createWorld conflict patch already present.");
} else if (src.includes(createWorldBuggy)) {
  src = src.replace(createWorldBuggy, createWorldFixed);
  patched += 1;
  console.log("[patch-deps] Applied createWorld onConflictDoNothing() patch.");
} else {
  console.log(
    "[patch-deps] createWorld() signature changed — world patch may no longer be needed.",
  );
}

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

if (src.includes(embeddingFixed)) {
  console.log(
    "[patch-deps] ensureEmbeddingDimension guard patch already present.",
  );
} else if (src.includes(embeddingBuggy)) {
  src = src.replace(embeddingBuggy, embeddingFixed);
  patched += 1;
  console.log("[patch-deps] Applied ensureEmbeddingDimension guard patch.");
} else {
  console.log(
    "[patch-deps] ensureEmbeddingDimension signature changed — embedding patch may no longer be needed.",
  );
}

if (patched > 0) {
  writeFileSync(target, src, "utf8");
  console.log(`[patch-deps] Wrote ${patched} plugin-sql patch(es).`);
} else {
  console.log("[patch-deps] No plugin-sql patches needed.");
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
 * Fix @elizaos plugin package metadata that pins @elizaos/core to a specific
 * alpha version (or uses workspace/next tags). Electron-builder's dependency
 * traversal is strict and will fail if these don't match the installed core.
 *
 * This is a metadata-only patch; runtime will still use the installed core.
 */
const corePkgJson = resolve(root, "node_modules/@elizaos/core/package.json");
if (!existsSync(corePkgJson)) {
  console.log("[patch-deps] @elizaos/core not found; skipping metadata patch.");
} else {
  let coreVersion = "0.0.0";
  try {
    coreVersion = JSON.parse(readFileSync(corePkgJson, "utf8")).version;
  } catch {
    console.log(
      "[patch-deps] Failed to read @elizaos/core version; skipping metadata patch.",
    );
    coreVersion = "";
  }

  if (coreVersion) {
    const packageRoots = [
      resolve(root, "node_modules/@elizaos"),
      resolve(root, "apps/app/electron/node_modules/@elizaos"),
    ];

    // Bun stores transitive deps under node_modules/.bun/* and may not hoist
    // them into node_modules/@elizaos. Electron-builder will still traverse
    // the bun store, so patch those copies too.
    const bunStore = resolve(root, "node_modules/.bun");
    if (existsSync(bunStore)) {
      for (const entry of readdirSync(bunStore)) {
        if (!entry.startsWith("@elizaos+")) continue;
        const candidate = resolve(bunStore, entry, "node_modules/@elizaos");
        if (existsSync(candidate)) packageRoots.push(candidate);
      }
    }
    const visited = new Set();
    let metaPatched = 0;

    for (const packageRoot of packageRoots) {
      if (!existsSync(packageRoot)) continue;
      for (const entry of readdirSync(packageRoot)) {
        const pkgJsonPath = resolve(packageRoot, entry, "package.json");
        if (!existsSync(pkgJsonPath)) continue;

        let realPath = pkgJsonPath;
        try {
          realPath = realpathSync(pkgJsonPath);
        } catch {
          // ignore
        }
        if (visited.has(realPath)) continue;
        visited.add(realPath);

        try {
          const raw = readFileSync(pkgJsonPath, "utf8");
          const json = JSON.parse(raw);
          let changed = false;

          for (const field of [
            "dependencies",
            "peerDependencies",
            "optionalDependencies",
          ]) {
            if (
              json?.[field] &&
              typeof json[field] === "object" &&
              json[field]["@elizaos/core"] &&
              json[field]["@elizaos/core"] !== coreVersion
            ) {
              json[field]["@elizaos/core"] = coreVersion;
              changed = true;
            }
          }

          if (changed) {
            writeFileSync(pkgJsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
            metaPatched += 1;
            console.log(
              `[patch-deps] Patched ${json?.name ?? entry} @elizaos/core -> ${coreVersion}`,
            );
          }
        } catch {
          // Ignore parse errors in node_modules metadata.
        }
      }
    }

    if (metaPatched === 0) {
      console.log("[patch-deps] No @elizaos metadata patches needed.");
    } else {
      console.log(`[patch-deps] Wrote ${metaPatched} metadata patch(es).`);
    }
  }
}

/**
 * Electron-builder validates dependency ranges strictly when traversing
 * node_modules. Bun's installer can occasionally resolve to newer major
 * versions (e.g. tar@7) even when a package requests an older range
 * (e.g. ^6.x). Patch bun store package metadata to accept the installed tar.
 */
const bunNodeModules = resolve(root, "node_modules/.bun/node_modules");
const installedTarPkgJson = resolve(bunNodeModules, "tar/package.json");
if (!existsSync(installedTarPkgJson)) {
  console.log("[patch-deps] tar not found in bun store; skipping tar range patch.");
} else {
  let tarVersion = "";
  try {
    tarVersion = JSON.parse(readFileSync(installedTarPkgJson, "utf8")).version;
  } catch {
    tarVersion = "";
  }

  if (!tarVersion) {
    console.log(
      "[patch-deps] Failed to read tar version from bun store; skipping tar range patch.",
    );
  } else {
    const bunStore = resolve(root, "node_modules/.bun");
    let patched = 0;

    if (existsSync(bunStore)) {
      for (const entry of readdirSync(bunStore)) {
        let pkgJsonPath = "";

        if (entry.startsWith("@")) {
          const secondAt = entry.indexOf("@", 1);
          const namePart = secondAt === -1 ? entry : entry.slice(0, secondAt);
          const [scope, pkg] = namePart.split("+");
          if (!scope || !pkg) continue;
          pkgJsonPath = resolve(bunStore, entry, "node_modules", scope, pkg, "package.json");
        } else {
          const at = entry.indexOf("@");
          const pkg = at === -1 ? entry : entry.slice(0, at);
          if (!pkg) continue;
          pkgJsonPath = resolve(bunStore, entry, "node_modules", pkg, "package.json");
        }

        if (!existsSync(pkgJsonPath)) continue;

        try {
          const json = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          const dep = json?.dependencies?.tar;
          if (!dep) continue;
          const desired = `^${tarVersion}`;
          if (dep === desired) continue;
          // Only patch the legacy tar@6 range that electron-builder won't accept with tar@7 installed.
          if (
            typeof dep === "string" &&
            !dep.startsWith("^6") &&
            !dep.startsWith("~6") &&
            !dep.startsWith("6.")
          ) {
            continue;
          }
          json.dependencies.tar = desired;
          writeFileSync(pkgJsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
          patched += 1;
          console.log(
            `[patch-deps] Patched ${json?.name ?? entry} tar -> ${desired}`,
          );
        } catch {
          // ignore
        }
      }
    }

    if (patched === 0) {
      console.log("[patch-deps] No tar range patches needed.");
    } else {
      console.log(`[patch-deps] Wrote ${patched} tar range patch(es).`);
    }
  }
}

/**
 * Similar to tar: some plugins pin drizzle-orm to an older 0.x minor range,
 * but our app uses a newer drizzle-orm. Bun may resolve a newer version; patch
 * plugin metadata so electron-builder's semver checks don't fail packaging.
 */
const installedDrizzlePkgJson = resolve(bunNodeModules, "drizzle-orm/package.json");
if (!existsSync(installedDrizzlePkgJson)) {
  console.log(
    "[patch-deps] drizzle-orm not found in bun store; skipping drizzle range patch.",
  );
} else {
  let drizzleVersion = "";
  try {
    drizzleVersion = JSON.parse(readFileSync(installedDrizzlePkgJson, "utf8")).version;
  } catch {
    drizzleVersion = "";
  }

  if (!drizzleVersion) {
    console.log(
      "[patch-deps] Failed to read drizzle-orm version from bun store; skipping drizzle range patch.",
    );
  } else {
    const bunStore = resolve(root, "node_modules/.bun");
    const desired = `^${drizzleVersion}`;
    let patched = 0;

    if (existsSync(bunStore)) {
      for (const entry of readdirSync(bunStore)) {
        // Scope to @elizaos packages only.
        if (!entry.startsWith("@elizaos+")) continue;

        const secondAt = entry.indexOf("@", 1);
        const namePart = secondAt === -1 ? entry : entry.slice(0, secondAt);
        const [scope, pkg] = namePart.split("+");
        if (!scope || !pkg) continue;

        const pkgJsonPath = resolve(bunStore, entry, "node_modules", scope, pkg, "package.json");
        if (!existsSync(pkgJsonPath)) continue;

        try {
          const json = JSON.parse(readFileSync(pkgJsonPath, "utf8"));
          const dep = json?.dependencies?.["drizzle-orm"];
          if (!dep || dep === desired) continue;
          json.dependencies["drizzle-orm"] = desired;
          writeFileSync(pkgJsonPath, `${JSON.stringify(json, null, 2)}\n`, "utf8");
          patched += 1;
          console.log(
            `[patch-deps] Patched ${json?.name ?? namePart} drizzle-orm -> ${desired}`,
          );
        } catch {
          // ignore
        }
      }
    }

    if (patched === 0) {
      console.log("[patch-deps] No drizzle range patches needed.");
    } else {
      console.log(`[patch-deps] Wrote ${patched} drizzle range patch(es).`);
    }
  }
}
