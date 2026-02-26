/**
 * Type-only exports for @elizaos/plugin-ui.
 * Import from "@elizaos/plugin-ui/types" for zero-runtime type usage.
 */

// ── Catalog types ───────────────────────────────────────────────────────
export type {
  ActionDefinition,
  ActionHandler,
  CatalogConfig,
  FieldCatalog,
  FieldDefinition,
  FieldRegistry,
  FieldRenderer,
  FieldRenderProps,
  JsonSchemaObject,
  JsonSchemaProperty,
  ResolvedField,
  ValidationFunction,
} from "@app/components/config-catalog";

// ── ConfigRenderer types ────────────────────────────────────────────────
export type {
  ConfigRendererHandle,
  ConfigRendererProps,
} from "@app/components/config-renderer";

// ── Core UI types ───────────────────────────────────────────────────────
export type {
  ActionBinding,
  ConfigUiHint,
  ConfigUiHints,
  DynamicValue,
  LogicExpression,
  PluginUiTheme,
  ShowIfCondition,
  ValidationCheck,
  ValidationConfig,
  VisibilityCondition,
} from "@app/types";
