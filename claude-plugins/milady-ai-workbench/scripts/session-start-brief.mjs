#!/usr/bin/env node

const lines = [
  "Milady AI policy brief:",
  "- Stay in scope: prioritize bug fixes, security, tests, docs accuracy, and performance.",
  "- Reject aesthetic/UI-only redesign work unless explicitly authorized.",
  "- Prefer Bun tooling (`bun run ...`) and targeted tests before full suites.",
  "- Before push/PR, use `bun run pre-review:local`.",
  "- Avoid destructive git commands without explicit user authorization.",
];

process.stdout.write(lines.join("\n"));
