import { repopromptPlugin } from "./plugin.ts";

export { repopromptPlugin } from "./plugin.ts";
export { RepoPromptService } from "./services/repoprompt-service.ts";
export type {
  RepoPromptRunInput,
  RepoPromptRunResult,
  RepoPromptStatus,
} from "./services/repoprompt-service.ts";
export type { RepoPromptConfig } from "./config.ts";

export default repopromptPlugin;
