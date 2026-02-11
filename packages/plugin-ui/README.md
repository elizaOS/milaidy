# @elizaos/plugin-ui

Schema-driven configuration UI for ElizaOS plugins. Provides 23 field type renderers, a responsive grid layout, validation, conditional visibility, and design tokens for consistent rendering.

## Installation

```bash
npm install @elizaos/plugin-ui
```

## Quick Start

```tsx
import { ConfigRenderer, defaultRegistry } from "@elizaos/plugin-ui";
import type { ConfigUiHint } from "@elizaos/plugin-ui";

const schema = {
  type: "object",
  properties: {
    apiKey: { type: "string" },
    model: { type: "string", enum: ["gpt-4", "gpt-3.5-turbo"] },
    temperature: { type: "number", minimum: 0, maximum: 2 },
  },
  required: ["apiKey"],
};

const hints: Record<string, ConfigUiHint> = {
  apiKey: { label: "API Key", sensitive: true, help: "Your API key" },
  model: { label: "Model", type: "select", width: "half" },
  temperature: { label: "Temperature", width: "half", min: 0, max: 2, step: 0.1 },
};

function PluginSettings() {
  const [values, setValues] = useState({});
  return (
    <ConfigRenderer
      schema={schema}
      hints={hints}
      values={values}
      registry={defaultRegistry}
      onChange={(key, value) => setValues(prev => ({ ...prev, [key]: value }))}
    />
  );
}
```

## Field Types (23)

### Primitives

| Type | Description | Auto-detected from |
|------|-------------|-------------------|
| `text` | Single-line text input | Default for strings |
| `password` | Masked input with show/hide toggle | `sensitive: true` hint |
| `number` | Numeric input with min/max/step | `type: "number"` in schema |
| `boolean` | Toggle switch | `type: "boolean"` in schema |
| `textarea` | Multi-line text input | `maxLength > 200` in schema |

### Selection

| Type | Description | Auto-detected from |
|------|-------------|-------------------|
| `select` | Dropdown selector | `enum` in schema (4+ options) |
| `multiselect` | Checkbox group for multiple values | `type: "array"` + `items.enum` |
| `radio` | Radio button group with descriptions | `hint.type: "radio"` |
| `checkbox-group` | Checkbox list with per-option descriptions | `hint.type: "checkbox-group"` |

### Specialized

| Type | Description | Auto-detected from |
|------|-------------|-------------------|
| `url` | URL input with validation | `format: "uri"` in schema |
| `email` | Email input with validation | `format: "email"` in schema |
| `color` | Color picker swatch + hex input | `format: "color"` in schema |
| `date` | Date picker | `format: "date"` in schema |
| `datetime` | Date + time picker | `format: "date-time"` in schema |
| `json` | JSON editor with validation | `type: "object"` in schema |
| `code` | Monospaced code editor | `hint.type: "code"` |
| `markdown` | Markdown editor with preview toggle | `hint.type: "markdown"` |
| `file` | File path input | `hint.type: "file"` |

### Layout & Structured

| Type | Description | Auto-detected from |
|------|-------------|-------------------|
| `array` | Add/remove items list | `type: "array"` in schema |
| `keyvalue` | Key-value pair editor | `additionalProperties` in schema |
| `group` | Fieldset container with legend | `hint.type: "group"` |
| `table` | Tabular data editor with rows/columns | `hint.type: "table"` |
| `custom` | Plugin-provided React component | `hint.type: "custom"` |

## ConfigUiHint Reference

```typescript
interface ConfigUiHint {
  // Display
  label?: string;          // Field label
  help?: string;           // Help text below the field
  placeholder?: string;    // Input placeholder
  icon?: string;           // Icon identifier

  // Behavior
  type?: string;           // Explicit field type override
  sensitive?: boolean;     // Mask value, show/hide toggle
  readonly?: boolean;      // Render as disabled
  advanced?: boolean;      // Show in collapsed "Advanced" section
  hidden?: boolean;        // Don't render at all

  // Layout
  order?: number;          // Sort order (lower = first)
  group?: string;          // Group heading (e.g., "API Settings")
  width?: "full" | "half" | "third";  // Grid column width

  // Validation
  pattern?: string;        // Regex pattern for string values
  patternError?: string;   // Custom error message for pattern mismatch

  // Conditional visibility
  showIf?: {
    field: string;
    op: "eq" | "neq" | "in" | "truthy" | "falsy";
    value?: unknown;
  };

  // For select / radio / multiselect / checkbox-group
  options?: Array<{
    value: string;
    label: string;
    description?: string;
    icon?: string;
    disabled?: boolean;
  }>;

  // For number fields
  min?: number;
  max?: number;
  step?: number;
  unit?: string;           // Display unit (e.g., "ms", "tokens")

  // For array fields
  itemSchema?: ConfigUiHint;
  minItems?: number;
  maxItems?: number;

  // For custom components
  component?: string;      // React component name
}
```

## Responsive Grid Layout

Fields support three width modes via `width` hint:

| Width | Desktop | Mobile |
|-------|---------|--------|
| `"full"` (default) | 100% | 100% |
| `"half"` | 50% | 100% |
| `"third"` | 33% | 100% |

```typescript
const hints = {
  firstName: { label: "First Name", width: "half" },
  lastName: { label: "Last Name", width: "half" },
  port: { label: "Port", width: "third" },
  host: { label: "Host", width: "third" },
  protocol: { label: "Protocol", width: "third" },
};
```

## Groups & Advanced Fields

Fields with the same `group` value are rendered together under a heading:

```typescript
const hints = {
  apiKey: { label: "API Key", group: "Authentication" },
  apiSecret: { label: "API Secret", group: "Authentication", sensitive: true },
  debugMode: { label: "Debug Mode", advanced: true },
  logLevel: { label: "Log Level", advanced: true },
};
```

Advanced fields are collapsed by default with an expandable toggle.

## Conditional Visibility

Show or hide fields based on other field values:

```typescript
const hints = {
  authType: {
    label: "Auth Type",
    type: "radio",
    options: [
      { value: "apikey", label: "API Key" },
      { value: "oauth", label: "OAuth" },
    ],
  },
  apiKey: {
    label: "API Key",
    showIf: { field: "authType", op: "eq", value: "apikey" },
  },
  clientId: {
    label: "Client ID",
    showIf: { field: "authType", op: "eq", value: "oauth" },
  },
};
```

Operators: `eq`, `neq`, `in`, `truthy`, `falsy`.

## Design Tokens

The `PluginUiTheme` interface defines standard design tokens:

```typescript
import { DEFAULT_PLUGIN_UI_THEME } from "@elizaos/plugin-ui";

// Override specific tokens
const theme = {
  ...DEFAULT_PLUGIN_UI_THEME,
  fieldGap: "1.25rem",
  inputHeight: "2.5rem",
};
```

| Token | Default | CSS Variable |
|-------|---------|-------------|
| `fieldGap` | `1rem` | -- |
| `groupGap` | `1.5rem` | -- |
| `labelSize` | `0.8125rem` | -- |
| `helpSize` | `0.6875rem` | -- |
| `errorSize` | `0.6875rem` | -- |
| `labelColor` | `var(--txt)` | `--txt` |
| `helpColor` | `var(--muted)` | `--muted` |
| `errorColor` | `var(--destructive)` | `--destructive` |
| `borderColor` | `var(--border)` | `--border` |
| `focusRing` | `var(--accent)` | `--accent` |
| `inputHeight` | `2.25rem` | -- |
| `maxFieldWidth` | `32rem` | -- |

## Custom Field Renderers

Plugin authors can create custom renderers:

```tsx
import type { FieldRenderProps, FieldRenderer } from "@elizaos/plugin-ui";

const renderSliderField: FieldRenderer = (props: FieldRenderProps) => {
  const value = typeof props.value === "number" ? props.value : 0;
  return (
    <input
      type="range"
      min={props.hint.min ?? 0}
      max={props.hint.max ?? 100}
      step={props.hint.step ?? 1}
      value={value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      disabled={props.readonly}
    />
  );
};
```

Register custom renderers via `extendRegistry`:

```tsx
import { extendRegistry, defaultRegistry } from "@elizaos/plugin-ui";

const myRegistry = extendRegistry(defaultRegistry, {
  slider: renderSliderField,
});
```

## Validation

ConfigRenderer validates fields against JSON Schema and custom patterns:

- **Required fields**: Red accent bar + "Required" badge
- **Pattern validation**: Regex patterns with custom error messages
- **Zod validators**: Per-field-type validators (email format, URL format, etc.)
- **Inline errors**: Shown below each field
- **Summary**: Clickable error count at the top with scroll-to-field

## API Reference

### ConfigRenderer Props

| Prop | Type | Description |
|------|------|-------------|
| `schema` | `JsonSchemaObject` | JSON Schema for the config object |
| `hints` | `Record<string, ConfigUiHint>` | UI hints keyed by field name |
| `values` | `Record<string, unknown>` | Current config values |
| `registry` | `FieldRegistry` | Field type registry (use `defaultRegistry`) |
| `onChange` | `(key: string, value: unknown) => void` | Called when a field value changes |
| `onReveal?` | `(key: string) => Promise<string \| null>` | Reveal sensitive field value |
| `onAction?` | `(action: string, params?: Record<string, unknown>) => Promise<unknown>` | Handle field actions |

### FieldRenderProps

| Prop | Type | Description |
|------|------|-------------|
| `key` | `string` | Config key (e.g., "OPENAI_API_KEY") |
| `value` | `unknown` | Current field value |
| `schema` | `JsonSchemaProperty` | JSON Schema for this field |
| `hint` | `ConfigUiHint` | UI rendering hints |
| `fieldType` | `string` | Resolved field type name |
| `onChange` | `(value: unknown) => void` | Update field value |
| `isSet` | `boolean` | Whether field has a configured value |
| `required` | `boolean` | Whether field is required |
| `errors?` | `string[]` | Validation errors |
| `readonly?` | `boolean` | Whether field is read-only |
| `onReveal?` | `() => Promise<string \| null>` | Reveal sensitive value |
| `onAction?` | `(action: string, params?) => Promise<unknown>` | Dispatch action |

## License

MIT
