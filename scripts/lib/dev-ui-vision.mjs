export function buildVisionDepsFailureMessage(
  error,
  command = "node scripts/ensure-vision-deps.mjs",
) {
  const detail =
    error instanceof Error ? error.message : String(error ?? "unknown error");

  return [
    "",
    "  [milady] Vision dependency auto-install failed.",
    "  [milady] Camera and vision features will be unavailable in this session until the native tools are installed.",
    `  [milady] Retry manually: ${command}`,
    `  [milady] Failure detail: ${detail}`,
  ].join("\n");
}
