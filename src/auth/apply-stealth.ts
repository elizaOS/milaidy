import { installClaudeCodeStealthFetchInterceptor } from "./claude-code-stealth";

export function applyClaudeCodeStealth(): void {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.startsWith("sk-ant-oat")) {
    return;
  }

  installClaudeCodeStealthFetchInterceptor();
}
