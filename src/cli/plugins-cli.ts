import chalk from "chalk";
import type { Command } from "commander";

/**
 * Normalize a user-provided plugin name to its fully-qualified form.
 * Accepts `@scope/plugin-x`, `plugin-x`, or shorthand `x` (→ `@elizaos/plugin-x`).
 */
function normalizePluginName(name: string): string {
  if (name.startsWith("@") || name.startsWith("plugin-")) {
    return name;
  }
  return `@elizaos/plugin-${name}`;
}

function clampInt(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(Math.max(parsed, min), max);
}

export function registerPluginsCli(program: Command): void {
  const pluginsCommand = program
    .command("plugins")
    .description(
      "Browse, search, install, and manage ElizaOS plugins from the registry",
    );

  // ── list ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("list")
    .description("List all plugins from the registry (next branch)")
    .option("-q, --query <query>", "Filter plugins by name or keyword")
    .option("-l, --limit <number>", "Max results to show", "30")
    .action(async (opts: { query?: string; limit: string }) => {
      const { getRegistryPlugins, searchPlugins } = await import(
        "../services/registry-client.js"
      );
      const { listInstalledPlugins } = await import(
        "../services/plugin-installer.js"
      );

      const limit = clampInt(opts.limit, 1, 500, 30);
      const installed = await listInstalledPlugins();
      const installedNames = new Set(installed.map((p) => p.name));

      if (opts.query) {
        const results = await searchPlugins(opts.query, limit);

        if (results.length === 0) {
          console.log(`\nNo plugins found matching "${opts.query}"\n`);
          return;
        }

        console.log(
          `\n${chalk.bold(`Found ${results.length} plugins matching "${opts.query}":`)}\n`,
        );
        for (const r of results) {
          const versionBadges: string[] = [];
          if (r.supports.v0) versionBadges.push("v0");
          if (r.supports.v1) versionBadges.push("v1");
          if (r.supports.v2) versionBadges.push("v2");

          const badge = installedNames.has(r.name)
            ? chalk.green(" ✓ installed")
            : "";

          console.log(
            `  ${chalk.cyan(r.name)} ${r.latestVersion ? chalk.dim(`v${r.latestVersion}`) : ""}${badge}`,
          );
          if (r.description) {
            console.log(`    ${r.description}`);
          }
          if (r.tags.length > 0) {
            console.log(
              `    ${chalk.dim(`tags: ${r.tags.slice(0, 5).join(", ")}`)}`,
            );
          }
          if (versionBadges.length > 0) {
            console.log(
              `    ${chalk.dim(`supports: ${versionBadges.join(", ")}`)}`,
            );
          }
          console.log();
        }
      } else {
        const registry = await getRegistryPlugins();
        const all = Array.from(registry.values());

        const installedCount = all.filter((p) =>
          installedNames.has(p.name),
        ).length;
        console.log(
          `\n${chalk.bold(`${all.length} plugins available in registry`)}${installedCount > 0 ? chalk.green(` (${installedCount} installed)`) : ""}${chalk.bold(":")}\n`,
        );

        const sorted = all
          .sort((a, b) => a.name.localeCompare(b.name))
          .slice(0, limit);

        for (const plugin of sorted) {
          const desc = plugin.description ? ` — ${plugin.description}` : "";
          const badge = installedNames.has(plugin.name)
            ? chalk.green(" ✓")
            : "";
          console.log(`  ${chalk.cyan(plugin.name)}${badge}${chalk.dim(desc)}`);
        }

        if (all.length > limit) {
          console.log(
            chalk.dim(
              `\n  ... and ${all.length - limit} more (use --limit to show more)`,
            ),
          );
        }

        console.log();
      }

      console.log(
        chalk.dim("Install a plugin: milaidy plugins install <name>"),
      );
      console.log(
        chalk.dim("Search:           milaidy plugins list -q <keyword>"),
      );
      console.log();
    });

  // ── search ───────────────────────────────────────────────────────────
  pluginsCommand
    .command("search <query>")
    .description("Search the plugin registry by keyword")
    .option("-l, --limit <number>", "Max results", "15")
    .action(async (query: string, opts: { limit: string }) => {
      const { searchPlugins } = await import("../services/registry-client.js");
      const limit = clampInt(opts.limit, 1, 50, 15);

      const results = await searchPlugins(query, limit);

      if (results.length === 0) {
        console.log(`\nNo plugins found matching "${query}"\n`);
        return;
      }

      console.log(
        `\n${chalk.bold(`${results.length} results for "${query}":`)}\n`,
      );

      for (const r of results) {
        const match = (r.score * 100).toFixed(0);
        console.log(
          `  ${chalk.cyan(r.name)} ${chalk.dim(`(${match}% match)`)}`,
        );
        if (r.description) {
          console.log(`    ${r.description}`);
        }
        if (r.stars > 0) {
          console.log(`    ${chalk.dim(`stars: ${r.stars}`)}`);
        }
        console.log();
      }
    });

  // ── info ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("info <name>")
    .description("Show detailed information about a plugin")
    .action(async (name: string) => {
      const { getPluginInfo } = await import("../services/registry-client.js");

      const normalizedName = normalizePluginName(name);

      const info = await getPluginInfo(normalizedName);

      if (!info) {
        console.log(`\n${chalk.red("Not found:")} ${normalizedName}`);
        console.log(
          chalk.dim(
            "Run 'milaidy plugins search <keyword>' to find plugins.\n",
          ),
        );
        return;
      }

      console.log();
      console.log(chalk.bold(info.name));
      console.log(chalk.dim("─".repeat(info.name.length)));

      if (info.description) {
        console.log(`\n  ${info.description}`);
      }

      console.log(
        `\n  ${chalk.dim("Repository:")}  https://github.com/${info.gitRepo}`,
      );
      if (info.homepage) {
        console.log(`  ${chalk.dim("Homepage:")}    ${info.homepage}`);
      }
      console.log(`  ${chalk.dim("Language:")}    ${info.language}`);
      console.log(`  ${chalk.dim("Stars:")}       ${info.stars}`);

      if (info.topics.length > 0) {
        console.log(`  ${chalk.dim("Topics:")}      ${info.topics.join(", ")}`);
      }

      const versions: string[] = [];
      if (info.npm.v0Version) versions.push(`v0: ${info.npm.v0Version}`);
      if (info.npm.v1Version) versions.push(`v1: ${info.npm.v1Version}`);
      if (info.npm.v2Version) versions.push(`v2: ${info.npm.v2Version}`);
      if (versions.length > 0) {
        console.log(`  ${chalk.dim("npm:")}         ${versions.join("  |  ")}`);
      }

      const supported: string[] = [];
      if (info.supports.v0) supported.push("v0");
      if (info.supports.v1) supported.push("v1");
      if (info.supports.v2) supported.push("v2");
      if (supported.length > 0) {
        console.log(`  ${chalk.dim("Supports:")}    ${supported.join(", ")}`);
      }

      console.log(
        `\n  Install: ${chalk.cyan(`milaidy plugins install ${info.name}`)}\n`,
      );
    });

  // ── install ──────────────────────────────────────────────────────────
  pluginsCommand
    .command("install <name>")
    .description("Install a plugin from the registry")
    .option("--no-restart", "Install without restarting the agent")
    .action(async (name: string, opts: { restart: boolean }) => {
      const { installPlugin, installAndRestart } = await import(
        "../services/plugin-installer.js"
      );

      const normalizedName = normalizePluginName(name);

      console.log(`\nInstalling ${chalk.cyan(normalizedName)}...\n`);

      const progressHandler = (progress: {
        phase: string;
        message: string;
      }) => {
        console.log(`  [${progress.phase}] ${progress.message}`);
      };

      const result = opts.restart
        ? await installAndRestart(normalizedName, progressHandler)
        : await installPlugin(normalizedName, progressHandler);

      if (result.success) {
        console.log(
          `\n${chalk.green("Success!")} ${result.pluginName}@${result.version} installed.`,
        );
        if (result.requiresRestart && !opts.restart) {
          console.log(
            chalk.yellow("\nRestart your agent to load the new plugin."),
          );
        } else if (result.requiresRestart) {
          console.log(
            chalk.dim("Agent is restarting to load the new plugin..."),
          );
        }
      } else {
        console.log(`\n${chalk.red("Failed:")} ${result.error}`);
        process.exitCode = 1;
      }
      console.log();
    });

  // ── uninstall ────────────────────────────────────────────────────────
  pluginsCommand
    .command("uninstall <name>")
    .description("Uninstall a user-installed plugin")
    .option("--no-restart", "Uninstall without restarting the agent")
    .action(async (name: string, opts: { restart: boolean }) => {
      const { uninstallPlugin, uninstallAndRestart } = await import(
        "../services/plugin-installer.js"
      );

      console.log(`\nUninstalling ${chalk.cyan(name)}...\n`);

      const result = opts.restart
        ? await uninstallAndRestart(name)
        : await uninstallPlugin(name);

      if (result.success) {
        console.log(
          `${chalk.green("Success!")} ${result.pluginName} uninstalled.`,
        );
        if (result.requiresRestart && !opts.restart) {
          console.log(chalk.yellow("\nRestart your agent to apply changes."));
        }
      } else {
        console.log(`\n${chalk.red("Failed:")} ${result.error}`);
        process.exitCode = 1;
      }
      console.log();
    });

  // ── installed ────────────────────────────────────────────────────────
  pluginsCommand
    .command("installed")
    .description("List plugins installed from the registry")
    .action(async () => {
      const { listInstalledPlugins } = await import(
        "../services/plugin-installer.js"
      );

      const plugins = await listInstalledPlugins();

      if (plugins.length === 0) {
        console.log("\nNo plugins installed from the registry.\n");
        console.log(chalk.dim("Install one: milaidy plugins install <name>\n"));
        return;
      }

      console.log(
        `\n${chalk.bold(`${plugins.length} user-installed plugins:`)}\n`,
      );
      for (const p of plugins) {
        console.log(`  ${chalk.cyan(p.name)} ${chalk.dim(`v${p.version}`)}`);
        console.log(`    ${chalk.dim(`installed: ${p.installedAt}`)}`);
        console.log(`    ${chalk.dim(`path: ${p.installPath}`)}`);
        console.log();
      }
    });

  // ── refresh ──────────────────────────────────────────────────────────
  pluginsCommand
    .command("refresh")
    .description("Force-refresh the plugin registry cache")
    .action(async () => {
      const { refreshRegistry } = await import(
        "../services/registry-client.js"
      );

      console.log("\nRefreshing registry cache...");
      const registry = await refreshRegistry();
      console.log(`${chalk.green("Done!")} ${registry.size} plugins loaded.\n`);
    });

  // ── test ─────────────────────────────────────────────────────────────
  pluginsCommand
    .command("test")
    .description(
      "Validate custom drop-in plugins in ~/.milaidy/plugins/custom/",
    )
    .action(async () => {
      const nodePath = await import("node:path");
      const { pathToFileURL } = await import("node:url");
      const fsPromises = await import("node:fs/promises");
      const { resolveStateDir, resolveUserPath } = await import(
        "../config/paths.js"
      );
      const { loadMilaidyConfig } = await import("../config/config.js");
      const {
        CUSTOM_PLUGINS_DIRNAME,
        scanDropInPlugins,
        resolvePackageEntry,
      } = await import("../runtime/eliza.js");

      // Build list of directories to scan: well-known + config extras
      const customDir = nodePath.join(
        resolveStateDir(),
        CUSTOM_PLUGINS_DIRNAME,
      );
      const scanDirs = [customDir];

      let config: ReturnType<typeof loadMilaidyConfig> | null = null;
      try {
        config = loadMilaidyConfig();
      } catch (err) {
        console.log(
          chalk.dim(
            `  (Could not read milaidy.json: ${err instanceof Error ? err.message : String(err)} — scanning default directory only)\n`,
          ),
        );
      }
      for (const p of config?.plugins?.load?.paths ?? []) {
        scanDirs.push(resolveUserPath(p));
      }

      console.log(
        `\n${chalk.bold("Custom plugins directory:")} ${chalk.dim(customDir)}\n`,
      );

      // Discover candidates from all directories
      const candidates: Array<{
        name: string;
        installPath: string;
        version: string;
      }> = [];

      for (const dir of scanDirs) {
        const records = await scanDropInPlugins(dir);
        for (const [name, record] of Object.entries(records)) {
          candidates.push({
            name,
            installPath: record.installPath,
            version: record.version,
          });
        }
      }

      if (candidates.length === 0) {
        console.log("  No custom plugins found.\n");
        console.log(
          chalk.dim(
            `  Drop a plugin directory into ${customDir} and run this command again.\n`,
          ),
        );
        return;
      }

      console.log(
        `${chalk.bold(`Found ${candidates.length} custom plugin(s):`)}\n`,
      );

      let validCount = 0;
      let failedCount = 0;

      const fail = (msg: string) => {
        console.log(`    ${chalk.red("✗")} ${msg}`);
        failedCount++;
        console.log();
      };

      for (const candidate of candidates) {
        const ver =
          candidate.version !== "0.0.0"
            ? chalk.dim(` v${candidate.version}`)
            : "";
        console.log(`  ${chalk.cyan(candidate.name)}${ver}`);
        console.log(`    ${chalk.dim("Path:")} ${candidate.installPath}`);

        // 1. Resolve entry point from package.json
        let entryPoint: string;
        try {
          entryPoint = await resolvePackageEntry(candidate.installPath);
        } catch (err) {
          fail(
            `Entry point failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        console.log(
          `    ${chalk.dim("Entry:")} ${nodePath.relative(candidate.installPath, entryPoint)}`,
        );

        // 2. Verify entry point file exists on disk
        try {
          await fsPromises.access(entryPoint);
        } catch {
          fail(`File not found: ${entryPoint}`);
          continue;
        }

        // 3. Trial import
        let mod: Record<string, unknown>;
        try {
          mod = (await import(
            pathToFileURL(entryPoint).href
          )) as Record<string, unknown>;
        } catch (err) {
          fail(
            `Import failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          continue;
        }

        // 4. Check for valid Plugin shape (name + description)
        const plugin = findPluginExport(mod);
        if (plugin) {
          console.log(
            `    ${chalk.green("✓ Valid plugin")} — ${plugin.name}: ${chalk.dim(plugin.description)}`,
          );
          validCount++;
        } else {
          fail(
            "No valid Plugin export — needs { name: string, description: string }",
          );
          continue;
        }
        console.log();
      }

      // Summary
      const parts: string[] = [];
      if (validCount > 0) parts.push(chalk.green(`${validCount} valid`));
      if (failedCount > 0) parts.push(chalk.red(`${failedCount} failed`));
      console.log(
        `  ${chalk.bold("Summary:")} ${parts.join(", ")} out of ${candidates.length}\n`,
      );
    });
}

/**
 * Check a module's exports for a value that looks like an ElizaOS Plugin
 * (an object with `name: string` and `description: string`).
 *
 * @internal Exported for testing.
 */
export function findPluginExport(
  mod: Record<string, unknown>,
): { name: string; description: string } | null {
  const isPlugin = (
    v: unknown,
  ): v is { name: string; description: string } =>
    v !== null &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).name === "string" &&
    typeof (v as Record<string, unknown>).description === "string";

  if (isPlugin(mod.default)) return mod.default;
  if (isPlugin(mod.plugin)) return mod.plugin;
  if (isPlugin(mod)) return mod as { name: string; description: string };
  for (const value of Object.values(mod)) {
    if (isPlugin(value)) return value;
  }
  return null;
}
