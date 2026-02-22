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

function collectPaths(toolInput) {
  const paths = [];

  if (!toolInput || typeof toolInput !== "object") {
    return paths;
  }

  if (typeof toolInput.file_path === "string") {
    paths.push(toolInput.file_path);
  }

  if (Array.isArray(toolInput.edits)) {
    for (const edit of toolInput.edits) {
      if (
        edit &&
        typeof edit === "object" &&
        typeof edit.file_path === "string"
      ) {
        paths.push(edit.file_path);
      }
    }
  }

  return paths;
}

function isCodePath(filePath) {
  return /\.(ts|tsx|js|jsx|mjs|cjs)$/.test(filePath);
}

async function main() {
  const raw = await readStdin();
  if (!raw.trim()) {
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }

  const paths = collectPaths(payload?.tool_input ?? {});
  if (paths.length === 0) {
    return;
  }

  if (!paths.some(isCodePath)) {
    return;
  }

  const message =
    "Milady reminder: after code edits, run targeted tests first, then `bun run pre-review:local` before push.";

  process.stdout.write(
    JSON.stringify({
      continue: true,
      systemMessage: message,
    }),
  );
}

main().catch((error) => {
  process.stderr.write(`Hook error: ${String(error)}\n`);
  process.exit(1);
});
