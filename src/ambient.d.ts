/**
 * Ambient type declarations for optional dependencies that may not be
 * installed locally.  The runtime code guards every import with try/catch,
 * so these declarations exist solely to satisfy the type-checker.
 */

declare module "@elizaos/skills" {
  /** Returns the absolute path to the bundled skills directory. */
  export function getSkillsDir(): string;
}

declare module "@elizaos/plugin-trajectory-logger" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "@elizaos/plugin-groq" {
  import type { Plugin } from "@elizaos/core";
  const plugin: Plugin;
  export default plugin;
}

declare module "qrcode" {
  const QRCode: {
    toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  };
  export default QRCode;
}
