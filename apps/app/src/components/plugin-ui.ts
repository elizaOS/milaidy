/**
 * @elizaos/plugin-ui — Plugin UI SDK (React)
 *
 * Public API for plugin authors to build custom configuration field renderers
 * and full config pages. Reverse-engineered from vercel-labs/json-render.
 *
 * ## Architecture (json-render pattern)
 *
 * ```
 * defineCatalog({ fields, actions, functions })   →  Type-safe catalog
 *   ↓
 * defineRegistry(catalog, renderers, handlers)     →  Maps catalog → implementations
 *   ↓
 * <ConfigRenderer registry={registry} />           →  Schema-driven form rendering
 * ```
 *
 * ## Features (json-render parity)
 *
 * - **12 built-in field types** + custom field extension via `extendRegistry()`
 * - **Actions**: Catalog-defined actions with Zod params + registry handlers
 * - **Rich visibility**: LogicExpression (and/or/not/eq/neq/gt/gte/lt/lte)
 * - **Validation checks**: Declarative (required/email/minLength/pattern/url/...)
 * - **Data binding**: DynamicValue with JSON Pointer path resolution
 * - **Prompt generation**: `catalog.prompt()` for AI system prompts
 *
 * @module plugin-ui
 */

import { z } from "zod";
import type { ReactNode } from "react";
import type {
  ConfigUiHint,
  VisibilityCondition,
  LogicExpression,
  DynamicValue,
  ValidationCheck,
  ValidationConfig,
  ActionBinding,
  ShowIfCondition,
} from "../types";
import {
  defineCatalog,
  defineRegistry,
  defaultCatalog,
  resolveFields,
  // Data binding
  getByPath,
  setByPath,
  resolveDynamic,
  findFormValue,
  interpolateString,
  // Rich visibility
  evaluateVisibility,
  evaluateLogicExpression,
  evaluateShowIf,
  visibility,
  // Validation
  runValidation,
  builtInValidators,
  check,
  // Types
  type CatalogConfig,
  type FieldCatalog,
  type FieldDefinition,
  type FieldRegistry,
  type FieldRenderProps,
  type FieldRenderer,
  type JsonSchemaObject,
  type JsonSchemaProperty,
  type ResolvedField,
  type ActionDefinition,
  type ActionHandler,
  type ValidationFunction,
} from "./config-catalog";
import { defaultRenderers } from "./config-field";
import { defaultRegistry } from "./config-renderer";

// ── Re-exports ──────────────────────────────────────────────────────────

export {
  // Core types
  type FieldRenderProps,
  type FieldRenderer,
  type FieldDefinition,
  type FieldCatalog,
  type FieldRegistry,
  type ResolvedField,
  type JsonSchemaObject,
  type JsonSchemaProperty,
  type ConfigUiHint,
  type CatalogConfig,

  // Action types
  type ActionDefinition,
  type ActionHandler,
  type ActionBinding,

  // Visibility types
  type VisibilityCondition,
  type LogicExpression,
  type ShowIfCondition,

  // Data binding types
  type DynamicValue,

  // Validation types
  type ValidationCheck,
  type ValidationConfig,
  type ValidationFunction,

  // Factory functions
  defineCatalog,
  defineRegistry,
  resolveFields,

  // Data binding utilities
  getByPath,
  setByPath,
  resolveDynamic,
  findFormValue,
  interpolateString,

  // Visibility utilities
  evaluateVisibility,
  evaluateLogicExpression,
  evaluateShowIf,
  visibility,

  // Validation utilities
  runValidation,
  builtInValidators,
  check,

  // Defaults
  defaultCatalog,
  defaultRenderers,
  defaultRegistry,

  // Zod re-export for field type definitions
  z,
};

// ── PluginConfigFieldProps ───────────────────────────────────────────────

/**
 * Props passed to a plugin's custom field renderer.
 *
 * This is the public API type that plugin authors use when building
 * custom configuration UI fields.
 */
export type PluginConfigFieldProps<T = unknown> = {
  /** Current field value. */
  value: T;
  /** Callback to update the field value. */
  onChange: (value: T) => void;
  /** Full config values map (for cross-field logic). */
  config: Record<string, unknown>;
  /** UI rendering hints for this field. */
  hint: ConfigUiHint;
  /** JSON Schema definition for this field. */
  schema: JsonSchemaProperty;
  /** Resolved field type name. */
  fieldType: string;
  /** The config key. */
  key: string;
  /** Whether this field currently has a value set. */
  isSet: boolean;
  /** Whether this field is required. */
  required: boolean;
  /** Validation errors. */
  errors?: string[];
  /** Whether the field is read-only. */
  readonly?: boolean;
  /** Reveal a masked sensitive value. */
  onReveal?: () => Promise<string | null>;
  /** Execute a named action. */
  onAction?: (action: string, params?: Record<string, unknown>) => Promise<unknown>;
};

/**
 * A render function for a custom plugin config field.
 *
 * Receives PluginConfigFieldProps and returns a React node.
 */
export type PluginFieldRenderer<T = unknown> = (
  props: PluginConfigFieldProps<T>,
) => ReactNode;

// ── PluginConfigPageProps ────────────────────────────────────────────────

/**
 * Props for a plugin that provides a full custom config page.
 */
export interface PluginConfigPageProps {
  /** Current configuration values. */
  config: Record<string, unknown>;
  /** Callback to update configuration values. */
  onConfigChange: (config: Record<string, unknown>) => void;
  /** The plugin's JSON Schema for config structure. */
  schema: JsonSchemaObject;
  /** UI rendering hints keyed by property name. */
  hints: Record<string, ConfigUiHint>;
  /** Which keys currently have values set. */
  setKeys: Set<string>;
  /** Plugin ID. */
  pluginId: string;
  /** Validation errors keyed by field name. */
  errors?: Record<string, string[]>;
}

// ── Helpers for plugin authors ──────────────────────────────────────────

/**
 * Create a field type definition with a Zod validator.
 *
 * ```ts
 * const sliderField = createFieldType(z.coerce.number().min(0).max(100), "Slider input");
 * ```
 */
export function createFieldType<T extends z.ZodType>(
  validator: T,
  description: string,
): FieldDefinition<T> {
  return { validator, description };
}

/**
 * Adapt a PluginFieldRenderer to the internal FieldRenderer type.
 *
 * Plugin renderers receive `PluginConfigFieldProps` (which includes `config`).
 * The internal system uses `FieldRenderProps`. This adapter bridges the gap.
 */
export function adaptRenderer<T = unknown>(
  pluginRenderer: PluginFieldRenderer<T>,
): FieldRenderer {
  return (props: FieldRenderProps) =>
    pluginRenderer({
      value: props.value as T,
      onChange: props.onChange as (value: T) => void,
      config: {},
      hint: props.hint,
      schema: props.schema,
      fieldType: props.fieldType,
      key: props.key,
      isSet: props.isSet,
      required: props.required,
      errors: props.errors,
      readonly: props.readonly,
      onReveal: props.onReveal,
      onAction: props.onAction,
    });
}

/**
 * Extend the default registry with custom field types and renderers.
 *
 * ```ts
 * const myRegistry = extendRegistry(defaultRegistry, {
 *   "model-selector": {
 *     definition: createFieldType(z.string(), "Model selector"),
 *     renderer: renderModelSelector,
 *   },
 * });
 * ```
 */
export function extendRegistry(
  base: FieldRegistry,
  extensions: Record<string, {
    definition: FieldDefinition;
    renderer: FieldRenderer;
  }>,
): FieldRegistry {
  const mergedFields: Record<string, FieldDefinition> = {
    ...base.catalog.fields,
  };
  const mergedRenderers: Record<string, FieldRenderer> = {
    ...base.renderers,
  };

  for (const [name, ext] of Object.entries(extensions)) {
    mergedFields[name] = ext.definition;
    mergedRenderers[name] = ext.renderer;
  }

  const catalog = defineCatalog(mergedFields);
  return defineRegistry(catalog, mergedRenderers);
}
