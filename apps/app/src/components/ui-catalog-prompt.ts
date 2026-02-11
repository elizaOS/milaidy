/**
 * Re-export from the canonical shared location so the frontend and server
 * always use the same catalog definitions.
 */
export {
  COMPONENT_CATALOG,
  generateCatalogPrompt,
  getComponentNames,
} from "../../../../src/shared/ui-catalog-prompt";
export type {
  ComponentMeta,
  CatalogPromptOptions,
} from "../../../../src/shared/ui-catalog-prompt";
