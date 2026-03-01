import { AgentRuntime } from "@elizaos/core";
import { default as pluginSql } from "@elizaos/plugin-sql";
import pluginTrajectoryLogger from "@elizaos/plugin-trajectory-logger";
import { installDatabaseTrajectoryLogger, startTrajectoryStepInDatabase, loadPersistedTrajectoryRows } from "./src/runtime/trajectory-persistence.ts";
import process from "process";
import fs from "fs";
import path from "path";
import os from "os";

async function run() {
  const pgliteDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-e2e-pglite-"));
  process.env.PGLITE_DATA_DIR = pgliteDir;

  const runtime = new AgentRuntime({
    character: { name: "test" } as any,
    logLevel: "error",
    plugins: [pluginTrajectoryLogger],
  });
  await runtime.registerPlugin(pluginSql);
  await runtime.initialize();

  const loggerSvc = runtime.getService("trajectory_logger");
  installDatabaseTrajectoryLogger(runtime);
  
  await startTrajectoryStepInDatabase({ runtime, stepId: "test-step" });
  await new Promise((resolve) => setTimeout(resolve, 2000));
  
  const rows = await loadPersistedTrajectoryRows(runtime);
  console.log("Rows in DB:", rows);

  process.exit(0);
}
run().catch(console.error);
