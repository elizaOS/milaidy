/**
 * Creation safety — validation for agent-created content.
 *
 * Blocks dangerous patterns in code handlers, shell commands,
 * and skill content to prevent misuse by the self-evolution system.
 */

const MAX_CODE_SIZE = 10 * 1024; // 10KB

const BLOCKED_CODE_PATTERNS = [
  /\bprocess\.exit\b/,
  /\brequire\s*\(/,
  /\bimport\s*\(/,
  /\bchild_process\b/,
  /\beval\s*\(/,
  /\bFunction\s*\(/,
  /\bfs\.\w+Sync\b/,
  /\bfs\.write/,
  /\bfs\.unlink/,
  /\bfs\.rmdir/,
  /\bfs\.rm\b/,
  /\b__proto__\b/,
  /\.constructor\s*\[/,
  /\bexecSync\b/,
  /\bspawnSync\b/,
  /\bexecFileSync\b/,
];

const BLOCKED_SHELL_PATTERNS = [
  /\brm\s+-rf\b/,
  /\brm\s+-r\b/,
  /\bdd\s+if=/,
  /\bmkfs\b/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\|\s*sh\b/,
  /\|\s*bash\b/,
  /\|\s*zsh\b/,
  /\bcurl\b.*\|\s*(sh|bash)/,
  /\bwget\b.*\|\s*(sh|bash)/,
  /\bchmod\s+777\b/,
  /\bchown\s+-R\b/,
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /you\s+are\s+now\b/i,
  /\bsystem:\s*/i,
  /\bforget\s+(all|everything)\b/i,
  /\boverride\s+(system|safety)\b/i,
  /\bdisregard\s+(all|previous)\b/i,
];

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

/** Validate a code handler string for dangerous patterns. */
export function validateCodeHandler(code: string): ValidationResult {
  if (code.length > MAX_CODE_SIZE) {
    return {
      valid: false,
      reason: `Code exceeds max size of ${MAX_CODE_SIZE} bytes`,
    };
  }

  for (const pattern of BLOCKED_CODE_PATTERNS) {
    if (pattern.test(code)) {
      return {
        valid: false,
        reason: `Code contains blocked pattern: ${pattern.source}`,
      };
    }
  }

  return { valid: true };
}

/** Validate a shell command for destructive patterns. */
export function validateShellCommand(cmd: string): ValidationResult {
  for (const pattern of BLOCKED_SHELL_PATTERNS) {
    if (pattern.test(cmd)) {
      return {
        valid: false,
        reason: `Shell command contains blocked pattern: ${pattern.source}`,
      };
    }
  }

  return { valid: true };
}

/** Strip prompt injection patterns from skill content. */
export function sanitizeSkillContent(content: string): string {
  let sanitized = content;
  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    sanitized = sanitized.replace(pattern, "[redacted]");
  }
  return sanitized;
}
