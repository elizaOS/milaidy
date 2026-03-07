import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateText } from "ai";
import { ollama } from "ollama-ai-provider";

// --- PROMPT ENGINEERING & BEHAVIOR: THE "IT BEHAVES" LAYER ---

const TEST_TIMEOUT = 600000;

const EVALUATOR_MODEL = ollama("qwen2.5-coder:7b");

// Helper to use LLM-as-a-judge for prompt engineering tests
async function evaluateResponse(
  agentResponse: string,
  rule: string,
): Promise<{ pass: boolean; reason: string }> {
  const result = await generateText({
    model: EVALUATOR_MODEL as Parameters<typeof generateText>[0]["model"],
    system:
      'You are a test invariant evaluator. Your job is strictly to determine whether the assistant\'s response violates the provided rule. Output a JSON block: { "pass": boolean, "reason": string }',
    prompt: `Rule: ${rule}\n\nAgent Response:\n"""\n${agentResponse}\n"""`,
  });

  try {
    const parsed = JSON.parse(
      result.text.replace(/```json/g, "").replace(/```/g, ""),
    );
    return parsed;
  } catch (_e) {
    throw new Error(`Evaluator failed to return JSON: ${result.text}`);
  }
}

describe("Tier 3: Prompt Engineering / Behavior Invariants", () => {
  let testDir: string;
  let miladyProcess: ReturnType<typeof spawn>;
  let _processReady = false;

  beforeAll(async () => {
    testDir = join(tmpdir(), `milady-test-tier3-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });

    miladyProcess = spawn("node", ["./scripts/run-node.mjs", "start"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        HOME: testDir,
        USERPROFILE: testDir,
        MILADY_DIR: join(testDir, ".milady"),
        NODE_LLAMA_CPP_GPU: "false",
        LOG_LEVEL: "info",
      },
    });

    await new Promise<void>((resolve, reject) => {
      miladyProcess.stdout?.on("data", (data) => {
        if (data.toString().includes("API server listening on")) {
          _processReady = true;
          resolve();
        }
      });
      setTimeout(
        () => reject(new Error("Timeout binding")),
        TEST_TIMEOUT - 5000,
      );
    });
  }, TEST_TIMEOUT);

  afterAll(async () => {
    if (miladyProcess) miladyProcess.kill("SIGINT");
    await rm(testDir, { recursive: true, force: true }).catch(() => {});
  });

  // Helper to send a chat ping
  async function askMilady(text: string) {
    const id = `test-user-${randomUUID()}`;
    const response = await fetch(`http://localhost:2138/main/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId: "test-room",
        userId: id,
        userName: "tester",
        text,
      }),
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    return data;
  }

  test("PRM-TONE-01 & PRM-STYLE-01: Agent maintains persona syntax and rejects corporate tone", async () => {
    const responses = await askMilady("Can you assist me with learning react?");
    expect(responses.length).toBeGreaterThan(0);

    const combinedText = responses
      .map((r: { text: string }) => r.text)
      .join(" ");

    const evalResult = await evaluateResponse(
      combinedText,
      "The response must NOT contain corporate assistant filler like 'happy to help', 'great question', or formal structure. It MUST be primarily lowercase, use casual internet shorthand (like 'lol', 'tbh', 'ngl'), and match an ironic detached persona.",
    );

    expect(evalResult.pass).toBe(
      true,
      `Behavior test failed: ${evalResult.reason}`,
    );
  }, 20000);

  test("PRM-CAP-01: Agent does not hallucinate false actions for basic chitchat", async () => {
    const responses = await askMilady("im so tired of being online");

    // Contract: Pure chit-chat should not trigger any background CLI actions
    // The action field on responses should be IGNORING, NONE, or CONTINUE.
    for (const res of responses) {
      if (res.action) {
        expect(["NONE", "CONTINUE", "IGNORE"]).toContain(res.action);
      }
    }
  }, 20000);
});
