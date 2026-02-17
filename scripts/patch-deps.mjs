#!/usr/bin/env node
/**
 * Post-install patches for @elizaos/plugin-sql.
 *
 * 1) Adds .onConflictDoNothing() to createWorld() to prevent duplicate world
 *    insert errors on repeated ensureWorldExists() calls.
 * 2) Guards ensureEmbeddingDimension() so unsupported dimensions don't set the
 *    embedding column to undefined (which crashes drizzle query planning).
 * 3) Skips pgcrypto extension for PGlite (doesn't support extensions).
 *
 * Remove these once plugin-sql publishes fixes for both paths.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

/**
 * Find plugin-sql dist file - handles both npm and bun cache structures.
 */
function findPluginSqlDist() {
  // Standard npm location
  const npmTarget = resolve(
    root,
    "node_modules/@elizaos/plugin-sql/dist/node/index.node.js",
  );
  if (existsSync(npmTarget)) return npmTarget;

  // Bun cache location (node_modules/.bun/@elizaos+plugin-sql@*/...)
  const bunCacheDir = resolve(root, "node_modules/.bun");
  if (existsSync(bunCacheDir)) {
    try {
      const entries = readdirSync(bunCacheDir);
      for (const entry of entries) {
        if (entry.startsWith("@elizaos+plugin-sql@")) {
          const bunTarget = resolve(
            bunCacheDir,
            entry,
            "node_modules/@elizaos/plugin-sql/dist/node/index.node.js",
          );
          if (existsSync(bunTarget)) return bunTarget;
        }
      }
    } catch {
      // Ignore errors reading bun cache
    }
  }

  return null;
}

const target = findPluginSqlDist();

if (!target) {
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

// Patch: Skip pgcrypto extension for PGlite (doesn't support it)
// Change the extension list to exclude pgcrypto when PGLITE_DATA_DIR is set
const extensionsBuggy = `const extensions = isRealPostgres ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`;
const extensionsFixed = `const isPglite = !!process.env.PGLITE_DATA_DIR;
      const extensions = isRealPostgres && !isPglite ? ["vector", "fuzzystrmatch", "pgcrypto"] : ["vector", "fuzzystrmatch"];`;

if (src.includes(extensionsFixed)) {
  console.log("[patch-deps] PGlite extension patch already present.");
} else if (src.includes(extensionsBuggy)) {
  src = src.replace(extensionsBuggy, extensionsFixed);
  patched += 1;
  console.log("[patch-deps] Applied PGlite extension exclusion patch.");
} else {
  console.log(
    "[patch-deps] Extension installation code changed — PGlite patch may no longer be needed.",
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
  const twitterBuggy =
    `      const result = await client.twitterClient.sendTweet(finalTweetText);`;

  // v1 patch (url-based — reads base64 from att.url, may already be applied).
  const twitterV1Fixed =
    `      // Upload any image attachments from the user's chat message
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
  const twitterFixed =
    `      // Upload any image attachments from the user's chat message
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
    console.log("[patch-deps] twitter POST_TWEET media patch (v2) already present.");
  } else if (twitterSrc.includes(twitterV1Fixed.slice(0, 80))) {
    twitterSrc = twitterSrc.replace(twitterV1Fixed, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log("[patch-deps] Upgraded twitter POST_TWEET media patch to v2.");
  } else if (twitterSrc.includes(twitterBuggy)) {
    twitterSrc = twitterSrc.replace(twitterBuggy, twitterFixed);
    writeFileSync(twitterTarget, twitterSrc, "utf8");
    console.log("[patch-deps] Applied twitter POST_TWEET media upload patch (v2).");
  } else {
    console.log(
      "[patch-deps] twitter POST_TWEET sendTweet call changed — media patch may no longer be needed.",
    );
  }
}
