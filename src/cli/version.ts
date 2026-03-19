import { resolveElizaVersion } from "../version-resolver";

export const CLI_VERSION = resolveElizaVersion(import.meta.url);
