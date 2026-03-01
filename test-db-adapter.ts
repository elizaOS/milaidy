import { AgentRuntime } from "@elizaos/core";
import { default as pluginSql } from "@elizaos/plugin-sql";
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
    });
    await runtime.registerPlugin(pluginSql);
    await runtime.initialize();

    const adapter = runtime.adapter as any;
    console.log("adapter keys:", Object.keys(adapter));
    console.log("has original db?", adapter.db ? typeof adapter.db : "no");
    console.log("db.execute?", adapter.db?.execute ? typeof adapter.db.execute : "no");
    process.exit(0);
}
run().catch(console.error);
