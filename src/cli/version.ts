import { resolveMilaidyVersion } from "../version-resolver.js";

export const CLI_VERSION = resolveMilaidyVersion(import.meta.url);
