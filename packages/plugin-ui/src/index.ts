/**
 * @elizaos/plugin-ui — Public SDK for plugin configuration UI.
 *
 * Provides:
 *  - ConfigRenderer: Schema-driven form component
 *  - Field renderers: 23 built-in field type renderers
 *  - Catalog utilities: defineCatalog, defineRegistry, resolveFields
 *  - Data binding: getByPath, setByPath, resolveDynamic, findFormValue
 *  - Visibility: evaluateVisibility, evaluateShowIf, evaluateLogicExpression
 *  - Validation: runValidation, builtInValidators, check helpers
 *  - Actions: ActionDefinition, ActionHandler types
 *  - Type definitions: FieldRenderProps, ConfigUiHint, JsonSchemaObject, etc.
 *
 * @example
 * ```tsx
 * import { ConfigRenderer, defaultRegistry } from "@elizaos/plugin-ui";
 * import type { FieldRenderProps } from "@elizaos/plugin-ui";
 *
 * <ConfigRenderer
 *   schema={mySchema}
 *   hints={myHints}
 *   values={configValues}
 *   registry={defaultRegistry}
 *   onChange={handleChange}
 * />
 * ```
 *
 * @module @elizaos/plugin-ui
 */

export type {
  // Action types
  ActionDefinition,
  ActionHandler,
  CatalogConfig,
  FieldCatalog,
  FieldDefinition,
  FieldRegistry,
  FieldRenderer,
  // Core types
  FieldRenderProps,
  JsonSchemaObject,
  JsonSchemaProperty,
  ResolvedField,
  ValidationFunction,
} from "@app/components/config-catalog";
// ── Catalog & Registry ──────────────────────────────────────────────────
export {
  builtInValidators,
  check,
  // Defaults
  defaultCatalog,
  // Factory functions
  defineCatalog,
  defineRegistry,
  evaluateLogicExpression,
  evaluateShowIf,
  // Rich visibility utilities
  evaluateVisibility,
  findFormValue,
  // Data binding utilities
  getByPath,
  interpolateString,
  resolveDynamic,
  resolveFields,
  // Validation utilities
  runValidation,
  setByPath,
  visibility,
} from "@app/components/config-catalog";

// ── Field Renderers ─────────────────────────────────────────────────────
export {
  ConfigField,
  defaultRenderers,
} from "@app/components/config-field";
export type {
  ConfigRendererHandle,
  ConfigRendererProps,
} from "@app/components/config-renderer";
// ── ConfigRenderer ──────────────────────────────────────────────────────
export {
  ConfigRenderer,
  defaultRegistry,
  useConfigValidation,
} from "@app/components/config-renderer";
// ── Types ───────────────────────────────────────────────────────────────

// ── Zod re-export for field type definitions ────────────────────────────
export { z } from "zod";
