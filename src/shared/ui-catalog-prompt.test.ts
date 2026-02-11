/**
 * Tests for the UI catalog prompt generator.
 *
 * The UI catalog prompt is used by the LLM to understand and generate
 * valid UiSpec JSON for rich interactive chat responses.
 */

import { describe, expect, test } from "vitest";
import {
  COMPONENT_CATALOG,
  type ComponentMeta,
  generateCatalogPrompt,
  getComponentNames,
} from "./ui-catalog-prompt.js";

// ============================================================================
// COMPONENT_CATALOG
// ============================================================================

describe("COMPONENT_CATALOG", () => {
  test("exports a non-empty catalog of components", () => {
    expect(Object.keys(COMPONENT_CATALOG).length).toBeGreaterThan(0);
  });

  test("includes core layout components", () => {
    expect(COMPONENT_CATALOG.Stack).toBeDefined();
    expect(COMPONENT_CATALOG.Grid).toBeDefined();
    expect(COMPONENT_CATALOG.Card).toBeDefined();
    expect(COMPONENT_CATALOG.Separator).toBeDefined();
  });

  test("includes form components", () => {
    expect(COMPONENT_CATALOG.Input).toBeDefined();
    expect(COMPONENT_CATALOG.Textarea).toBeDefined();
    expect(COMPONENT_CATALOG.Select).toBeDefined();
    expect(COMPONENT_CATALOG.Checkbox).toBeDefined();
    expect(COMPONENT_CATALOG.Radio).toBeDefined();
    expect(COMPONENT_CATALOG.Switch).toBeDefined();
    expect(COMPONENT_CATALOG.Slider).toBeDefined();
    expect(COMPONENT_CATALOG.Toggle).toBeDefined();
    expect(COMPONENT_CATALOG.ToggleGroup).toBeDefined();
    expect(COMPONENT_CATALOG.ButtonGroup).toBeDefined();
  });

  test("includes typography components", () => {
    expect(COMPONENT_CATALOG.Heading).toBeDefined();
    expect(COMPONENT_CATALOG.Text).toBeDefined();
  });

  test("includes data display components", () => {
    expect(COMPONENT_CATALOG.Table).toBeDefined();
    expect(COMPONENT_CATALOG.Carousel).toBeDefined();
    expect(COMPONENT_CATALOG.Badge).toBeDefined();
    expect(COMPONENT_CATALOG.Avatar).toBeDefined();
    expect(COMPONENT_CATALOG.Image).toBeDefined();
  });

  test("includes feedback components", () => {
    expect(COMPONENT_CATALOG.Alert).toBeDefined();
    expect(COMPONENT_CATALOG.Progress).toBeDefined();
    expect(COMPONENT_CATALOG.Rating).toBeDefined();
    expect(COMPONENT_CATALOG.Skeleton).toBeDefined();
    expect(COMPONENT_CATALOG.Spinner).toBeDefined();
  });

  test("includes navigation components", () => {
    expect(COMPONENT_CATALOG.Button).toBeDefined();
    expect(COMPONENT_CATALOG.Link).toBeDefined();
    expect(COMPONENT_CATALOG.DropdownMenu).toBeDefined();
    expect(COMPONENT_CATALOG.Tabs).toBeDefined();
    expect(COMPONENT_CATALOG.Pagination).toBeDefined();
  });

  test("includes visualization components", () => {
    expect(COMPONENT_CATALOG.BarGraph).toBeDefined();
    expect(COMPONENT_CATALOG.LineGraph).toBeDefined();
  });

  test("includes interaction components", () => {
    expect(COMPONENT_CATALOG.Tooltip).toBeDefined();
    expect(COMPONENT_CATALOG.Popover).toBeDefined();
    expect(COMPONENT_CATALOG.Collapsible).toBeDefined();
    expect(COMPONENT_CATALOG.Accordion).toBeDefined();
    expect(COMPONENT_CATALOG.Dialog).toBeDefined();
    expect(COMPONENT_CATALOG.Drawer).toBeDefined();
  });

  test("each component has required metadata structure", () => {
    for (const [_name, meta] of Object.entries(COMPONENT_CATALOG)) {
      expect(meta.description).toBeDefined();
      expect(typeof meta.description).toBe("string");
      expect(meta.description.length).toBeGreaterThan(0);
      expect(meta.props).toBeDefined();
      expect(typeof meta.props).toBe("object");

      // Check props structure
      for (const [_propName, propMeta] of Object.entries(meta.props)) {
        expect(propMeta.type).toBeDefined();
        expect(propMeta.description).toBeDefined();
        expect(typeof propMeta.type).toBe("string");
        expect(typeof propMeta.description).toBe("string");
      }
    }
  });

  test("components with children have slots defined", () => {
    const componentsWithSlots = [
      "Stack",
      "Grid",
      "Card",
      "Collapsible",
      "Dialog",
      "Drawer",
    ];
    for (const name of componentsWithSlots) {
      const meta = COMPONENT_CATALOG[name] as ComponentMeta;
      expect(meta.slots).toBeDefined();
      expect(Array.isArray(meta.slots)).toBe(true);
    }
  });

  test("required props are marked correctly", () => {
    // Select requires options
    expect(COMPONENT_CATALOG.Select.props.options.required).toBe(true);
    // Input label is not required
    expect(COMPONENT_CATALOG.Input.props.label.required).toBeFalsy();
    // Heading text is required
    expect(COMPONENT_CATALOG.Heading.props.text.required).toBe(true);
    // Table columns and rows are required
    expect(COMPONENT_CATALOG.Table.props.columns.required).toBe(true);
    expect(COMPONENT_CATALOG.Table.props.rows.required).toBe(true);
  });
});

// ============================================================================
// getComponentNames
// ============================================================================

describe("getComponentNames", () => {
  test("returns all component names", () => {
    const names = getComponentNames();
    expect(Array.isArray(names)).toBe(true);
    expect(names.length).toBe(Object.keys(COMPONENT_CATALOG).length);
  });

  test("includes expected component types", () => {
    const names = getComponentNames();
    expect(names).toContain("Stack");
    expect(names).toContain("Button");
    expect(names).toContain("Input");
    expect(names).toContain("Card");
    expect(names).toContain("Table");
  });
});

// ============================================================================
// generateCatalogPrompt
// ============================================================================

describe("generateCatalogPrompt", () => {
  test("generates a non-empty prompt string", () => {
    const prompt = generateCatalogPrompt();
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(0);
  });

  test("includes UiSpec format description", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Spec format");
    expect(prompt).toContain('"root"');
    expect(prompt).toContain('"elements"');
    expect(prompt).toContain('"state"');
  });

  test("includes component list with descriptions", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Available components");
    expect(prompt).toContain("**Stack**");
    expect(prompt).toContain("**Button**");
    expect(prompt).toContain("**Input**");
  });

  test("includes data binding documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Data binding");
    expect(prompt).toContain("$data");
    expect(prompt).toContain("$path");
  });

  test("includes state binding documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("State binding");
    expect(prompt).toContain("statePath");
    expect(prompt).toContain("two-way binding");
  });

  test("includes visibility documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Visibility");
    expect(prompt).toContain("visible");
    expect(prompt).toContain("operator");
    expect(prompt).toContain("eq");
    expect(prompt).toContain("auth");
    expect(prompt).toContain("signedIn");
  });

  test("includes validation documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Validation");
    expect(prompt).toContain("checks");
    expect(prompt).toContain("required");
    expect(prompt).toContain("email");
    expect(prompt).toContain("minLength");
    expect(prompt).toContain("validateOn");
  });

  test("includes events documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Events");
    expect(prompt).toContain('"on"');
    expect(prompt).toContain("press");
    expect(prompt).toContain("action");
    expect(prompt).toContain("confirm");
  });

  test("includes repeat/list rendering documentation", () => {
    const prompt = generateCatalogPrompt();
    expect(prompt).toContain("Repeat");
    expect(prompt).toContain("repeat");
    expect(prompt).toContain("$item");
    expect(prompt).toContain("path");
    expect(prompt).toContain("key");
  });

  test("includes example when requested", () => {
    const promptWithExample = generateCatalogPrompt({ includeExamples: true });
    const promptWithoutExample = generateCatalogPrompt({
      includeExamples: false,
    });

    expect(promptWithExample).toContain("Example");
    expect(promptWithExample).toContain('"root": "main"');
    expect(promptWithExample).toContain("Contact Us");

    // Example section should not be in prompt without examples
    expect(promptWithoutExample).not.toContain("Contact Us");
  });

  test("includes custom rules when provided", () => {
    const customRules = [
      "Always use accessible labels",
      "Never use inline styles",
    ];
    const prompt = generateCatalogPrompt({ customRules });

    expect(prompt).toContain("Additional rules");
    expect(prompt).toContain("Always use accessible labels");
    expect(prompt).toContain("Never use inline styles");
  });

  test("filters components when componentFilter is provided", () => {
    const filter = ["Stack", "Card", "Button"];
    const prompt = generateCatalogPrompt({ componentFilter: filter });

    expect(prompt).toContain("**Stack**");
    expect(prompt).toContain("**Card**");
    expect(prompt).toContain("**Button**");
    // These should not be in the filtered prompt's component list
    expect(prompt).not.toContain("**Table**");
    expect(prompt).not.toContain("**Input**");
  });

  test("generated prompt is valid for LLM consumption", () => {
    const prompt = generateCatalogPrompt({ includeExamples: true });

    // Should not have [object Object] which indicates improper serialization
    expect(prompt).not.toContain("[object Object]");

    // JSON examples should be properly fenced
    expect(prompt).toContain("```json");
    expect(prompt).toContain("```");

    // Line count should be reasonable
    const lines = prompt.split("\n");
    expect(lines.length).toBeGreaterThan(100); // Comprehensive prompt
  });
});

// ============================================================================
// Component-specific prop validation
// ============================================================================

describe("component prop definitions", () => {
  test("Button has correct props", () => {
    const button = COMPONENT_CATALOG.Button;
    expect(button.props.label).toBeDefined();
    expect(button.props.variant).toBeDefined();
    expect(button.props.disabled).toBeDefined();
    expect(button.props.variant.type).toContain("primary");
    expect(button.props.variant.type).toContain("secondary");
    expect(button.props.variant.type).toContain("danger");
    expect(button.props.variant.type).toContain("ghost");
  });

  test("Input has correct props", () => {
    const input = COMPONENT_CATALOG.Input;
    expect(input.props.label).toBeDefined();
    expect(input.props.type).toBeDefined();
    expect(input.props.placeholder).toBeDefined();
    expect(input.props.statePath).toBeDefined();
    expect(input.props.type.type).toContain("text");
    expect(input.props.type.type).toContain("email");
    expect(input.props.type.type).toContain("password");
  });

  test("Alert has correct props", () => {
    const alert = COMPONENT_CATALOG.Alert;
    expect(alert.props.type).toBeDefined();
    expect(alert.props.title).toBeDefined();
    expect(alert.props.message).toBeDefined();
    expect(alert.props.type.type).toContain("info");
    expect(alert.props.type.type).toContain("success");
    expect(alert.props.type.type).toContain("warning");
    expect(alert.props.type.type).toContain("error");
  });

  test("Table has correct props", () => {
    const table = COMPONENT_CATALOG.Table;
    expect(table.props.columns.required).toBe(true);
    expect(table.props.rows.required).toBe(true);
    expect(table.props.caption).toBeDefined();
    expect(table.props.columns.type).toContain("string[]");
  });

  test("Select has correct props", () => {
    const select = COMPONENT_CATALOG.Select;
    expect(select.props.options.required).toBe(true);
    expect(select.props.options.type).toContain("Array");
    expect(select.props.options.type).toContain("label");
    expect(select.props.options.type).toContain("value");
  });

  test("Dialog has correct props", () => {
    const dialog = COMPONENT_CATALOG.Dialog;
    expect(dialog.props.title).toBeDefined();
    expect(dialog.props.description).toBeDefined();
    expect(dialog.props.openPath.required).toBe(true);
    expect(dialog.slots).toContain("default");
  });
});
