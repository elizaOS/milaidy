import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Path to the baked-in history knowledge file injected into every character at boot. */
export const HISTORY_KNOWLEDGE = path.join(__dirname, "..", "..", "knowledge", "history.md");
