#!/usr/bin/env node

import process from "node:process";

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
  });
}

function extractCommand(payload) {
  const toolInput = payload?.tool_input;
  if (!toolInput || typeof toolInput !== "object") {
    return "";
  }

  if (typeof toolInput.command === "string") {
    return toolInput.command;
  }

  if (typeof toolInput.cmd === "string") {
    return toolInput.cmd;
  }

  if (Array.isArray(toolInput.commands)) {
    return toolInput.commands.join(" && ");
  }

  return "";
}

function isDangerous(command) {
  const normalized = command.toLowerCase();
  const bannedPatterns = [
    /git\s+reset\s+--hard\b/,
    /git\s+checkout\s+--\s+/,
    /git\s+clean\s+-fdx\b/,
    /rm\s+-rf\s+\//,
    /rm\s+-rf\s+\./,
  ];
  return bannedPatterns.some((pattern) => pattern.test(normalized));
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    process.exit(0);
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.exit(0);
  }

  if (payload?.tool_name !== "Bash") {
    process.exit(0);
  }

  const command = extractCommand(payload);
  if (!command) {
    process.exit(0);
  }

  if (isDangerous(command)) {
    process.stderr.write(
      "Blocked by milady-ai-workbench hook: destructive git/shell command detected. Request explicit user approval and use a safer alternative.\n",
    );
    process.exit(2);
  }

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`Hook error: ${String(error)}\n`);
  process.exit(1);
});
