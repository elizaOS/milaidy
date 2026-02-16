import { resolveMiladyVersion } from "../version-resolver.js";

export const CLI_VERSION = resolveMiladyVersion(import.meta.url);
