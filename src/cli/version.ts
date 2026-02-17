import { resolveMiladyVersion } from "../version-resolver";

export const CLI_VERSION = resolveMiladyVersion(import.meta.url);
