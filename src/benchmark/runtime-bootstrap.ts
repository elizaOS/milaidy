import { AgentRuntime, elizaLogger, type Plugin } from "@elizaos/core";
import { CORE_PLUGINS } from "../runtime/core-plugins";
import { createMiladyPlugin } from "../runtime/milady-plugin";
import { createBenchmarkPlugin } from "./plugin";
import {
  envFlag,
  formatUnknownError,
  hasCuaConfig,
  toPlugin,
} from "./server-utils";

export async function createBenchmarkRuntime(): Promise<{
  runtime: AgentRuntime;
  plugins: Plugin[];
  shouldLoadCua: boolean;
}> {
  const plugins: Plugin[] = [];
  const loadedPlugins: string[] = [];
  const failedPlugins: string[] = [];

  const skipPlugins = new Set(["@elizaos/plugin-elizacloud"]);

  for (const pluginName of CORE_PLUGINS) {
    if (skipPlugins.has(pluginName)) {
      elizaLogger.debug(
        `[bench] Skipping plugin (benchmark mode): ${pluginName}`,
      );
      continue;
    }
    try {
      const pluginModule = await import(pluginName);
      const plugin =
        pluginModule.default ?? pluginModule[Object.keys(pluginModule)[0]];
      if (plugin) {
        plugins.push(toPlugin(plugin, pluginName));
        loadedPlugins.push(pluginName);
      }
    } catch (error: unknown) {
      failedPlugins.push(pluginName);
      elizaLogger.debug(
        `[bench] Plugin not available: ${pluginName} (${formatUnknownError(error)})`,
      );
    }
  }

  elizaLogger.info(
    `[bench] Loaded ${loadedPlugins.length}/${CORE_PLUGINS.length} core plugins`,
  );
  if (failedPlugins.length > 0) {
    elizaLogger.debug(
      `[bench] Unavailable plugins: ${failedPlugins.join(", ")}`,
    );
  }

  try {
    const workspaceDir = process.env.MILADY_WORKSPACE_DIR ?? process.cwd();
    const miladyPlugin = createMiladyPlugin({
      workspaceDir,
      agentId: "benchmark",
    });
    plugins.push(toPlugin(miladyPlugin, "milady-plugin"));
    elizaLogger.info(
      `[bench] Loaded milady plugin with workspace: ${workspaceDir}`,
    );
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load milady plugin: ${formatUnknownError(error)}`,
    );
  }

  try {
    const benchmarkPlugin = createBenchmarkPlugin();
    plugins.push(toPlugin(benchmarkPlugin, "benchmark-plugin"));
    elizaLogger.info("[bench] Loaded benchmark plugin");
  } catch (error: unknown) {
    elizaLogger.error(
      `[bench] Failed to load benchmark plugin: ${formatUnknownError(error)}`,
    );
  }

  if (!loadedPlugins.includes("@elizaos/plugin-trust")) {
    try {
      const { default: trustPlugin } = await import("@elizaos/plugin-trust");
      plugins.push(toPlugin(trustPlugin, "@elizaos/plugin-trust"));
      elizaLogger.info("[bench] Loaded plugin: @elizaos/plugin-trust");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Trust plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const groqApiKey = process.env.GROQ_API_KEY?.trim();
  if (groqApiKey) {
    process.env.GROQ_API_KEY = groqApiKey;
    try {
      const { default: groqPlugin } = await import("@elizaos/plugin-groq");
      plugins.push(toPlugin(groqPlugin, "@elizaos/plugin-groq"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-groq");
    } catch (error: unknown) {
      elizaLogger.warn(
        `[bench] Groq plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const openAiApiKey = process.env.OPENAI_API_KEY?.trim();
  if (openAiApiKey && !openAiApiKey.startsWith("gsk_")) {
    process.env.OPENAI_API_KEY = openAiApiKey;
    try {
      const { default: openaiPlugin } = await import("@elizaos/plugin-openai");
      plugins.push(toPlugin(openaiPlugin, "@elizaos/plugin-openai"));
      elizaLogger.info("[bench] Loaded LLM plugin: @elizaos/plugin-openai");
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] OpenAI plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  if (process.env.MILADY_ENABLE_COMPUTERUSE) {
    try {
      process.env.COMPUTERUSE_ENABLED ??= "true";
      process.env.COMPUTERUSE_MODE ??= "local";
      const localComputerusePath =
        "../../../plugins/plugin-computeruse/typescript/src/index.ts";
      const computeruseModule = (await import(localComputerusePath)) as Record<
        string,
        unknown
      >;
      const computerusePlugin =
        computeruseModule.computerusePlugin ??
        computeruseModule.computerUsePlugin ??
        computeruseModule.default;
      if (computerusePlugin) {
        plugins.push(toPlugin(computerusePlugin, localComputerusePath));
        elizaLogger.info(
          "[bench] Loaded local plugin: @elizaos/plugin-computeruse",
        );
      }
    } catch (error: unknown) {
      elizaLogger.debug(
        `[bench] Computer use plugin not available: ${formatUnknownError(error)}`,
      );
    }
  }

  const shouldLoadCua = envFlag("MILADY_ENABLE_CUA") || hasCuaConfig();
  if (shouldLoadCua) {
    const cuaSources = [
      "@elizaos/plugin-cua",
      "../../../eliza/packages/plugin-cua/src/index.ts",
    ];

    let loaded = false;
    for (const source of cuaSources) {
      try {
        const module = (await import(source)) as Record<string, unknown>;
        const candidate = module.default ?? module.cuaPlugin;
        if (!candidate) {
          throw new Error("module does not export cuaPlugin/default");
        }
        plugins.push(toPlugin(candidate, source));
        elizaLogger.info(`[bench] Loaded CUA plugin from ${source}`);
        loaded = true;
        break;
      } catch (error: unknown) {
        elizaLogger.debug(
          `[bench] CUA plugin source unavailable: ${source} (${formatUnknownError(error)})`,
        );
      }
    }

    if (!loaded) {
      elizaLogger.warn(
        "[bench] CUA benchmark mode requested but plugin could not be loaded",
      );
    }
  }

  if (
    process.env.MILADY_BENCH_MOCK === "true" ||
    process.env.MILAIDY_BENCH_MOCK === "true"
  ) {
    try {
      const { plugin: mockPlugin, source } = await (async () => {
        try {
          const localMockPath = String("./mock-plugin.ts");
          const localModule = (await import(localMockPath)) as Record<
            string,
            unknown
          >;
          const localPlugin = localModule.mockPlugin ?? localModule.default;
          if (localPlugin) {
            return { plugin: localPlugin, source: localMockPath };
          }
          throw new Error("mock-plugin.ts did not export mockPlugin/default");
        } catch (localError: unknown) {
          elizaLogger.debug(
            `[bench] Local mock plugin unavailable, using base mock plugin: ${formatUnknownError(localError)}`,
          );
          const baseModule = (await import("./mock-plugin-base.ts")) as Record<
            string,
            unknown
          >;
          const basePlugin = baseModule.mockPlugin ?? baseModule.default;
          if (!basePlugin) {
            throw new Error(
              "mock-plugin-base.ts did not export mockPlugin/default",
            );
          }
          return { plugin: basePlugin, source: "./mock-plugin-base.ts" };
        }
      })();

      plugins.push(toPlugin(mockPlugin, source));
      elizaLogger.info(`[bench] Loaded mock benchmark plugin from ${source}`);
    } catch (error: unknown) {
      elizaLogger.error(
        `[bench] Failed to load mock benchmark plugin: ${formatUnknownError(error)}`,
      );
    }
  }

  const settings: Record<string, string> = {
    PGLITE_DATA_DIR: "memory://",
  };
  const envKeys = [
    "GROQ_API_KEY",
    "OPENAI_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENROUTER_API_KEY",
    "GOOGLE_GENERATIVE_AI_API_KEY",
  ];
  for (const key of envKeys) {
    const value = process.env[key]?.trim();
    if (value) {
      settings[key] = value;
    }
  }

  const runtime = new AgentRuntime({
    character: {
      name: "Kira",
      bio: ["A benchmark execution agent."],
      messageExamples: [],
      topics: [],
      adjectives: [],
      plugins: [],
      settings: {
        secrets: settings,
      },
    },
    plugins,
  });

  await runtime.initialize();

  const modelHandlers = (
    runtime as unknown as { models?: Map<string, unknown[]> }
  ).models;
  const modelHandlerSummary = Object.fromEntries(
    [...(modelHandlers?.entries() ?? [])].map(([modelType, handlers]) => [
      modelType,
      (handlers as Array<{ provider?: string; priority?: number }>).map(
        (handler) => ({
          provider: handler.provider ?? "unknown",
          priority: handler.priority ?? 0,
        }),
      ),
    ]),
  );
  elizaLogger.info(
    `[bench] Model handlers: ${JSON.stringify(modelHandlerSummary)}`,
  );
  elizaLogger.info(
    `[bench] Runtime initialized — agent=${runtime.character.name}, plugins=${plugins.length}`,
  );

  return { runtime, plugins, shouldLoadCua };
}
