/**
 * Re-exports from the shared command registry for backward compatibility.
 *
 * New code should import directly from "../command-registry".
 */

export type {
  BuildCommandsArgs as BuildCommandPaletteCommandsArgs,
  CommandItem,
} from "../command-registry";
export { buildCommands as buildCommandPaletteCommands } from "../command-registry";
