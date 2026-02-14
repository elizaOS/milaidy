/**
 * Quick test for plugin version parsing
 * Run with: node test-plugin-parsing.mjs
 */

// Inline the parsing logic for testing
function normalizePluginName(name) {
  // Already fully qualified (starts with @) or plugin- prefix
  if (name.startsWith("@") || name.startsWith("plugin-")) {
    return name;
  }
  // Shorthand: add @elizaos/plugin- prefix
  return `@elizaos/plugin-${name}`;
}

function parsePluginSpec(input) {
  let namepart;
  let version;

  // Handle scoped packages like @scope/name@version
  if (input.startsWith("@")) {
    // Split on @ after the scope
    const parts = input.split("@");
    // parts = ["", "scope/name", "version"] or ["", "scope/name"]
    if (parts.length >= 3) {
      // Has version: @scope/name@version
      namepart = `@${parts[1]}`;
      version = parts.slice(2).join("@"); // In case version has @ in it
    } else {
      // No version: @scope/name
      namepart = input;
      version = undefined;
    }
  } else {
    // Non-scoped package: name@version or name
    const atIndex = input.indexOf("@");
    if (atIndex > 0) {
      namepart = input.substring(0, atIndex);
      version = input.substring(atIndex + 1);
    } else {
      namepart = input;
      version = undefined;
    }
  }

  return {
    name: normalizePluginName(namepart),
    version: version?.trim(),
  };
}

// Test cases
const tests = [
  {
    input: "twitter",
    expected: { name: "@elizaos/plugin-twitter", version: undefined },
  },
  {
    input: "twitter@1.2.23-alpha.0",
    expected: { name: "@elizaos/plugin-twitter", version: "1.2.23-alpha.0" },
  },
  {
    input: "@elizaos/plugin-twitter@1.2.23-alpha.0",
    expected: { name: "@elizaos/plugin-twitter", version: "1.2.23-alpha.0" },
  },
  {
    input: "@custom/plugin-x@2.0.0",
    expected: { name: "@custom/plugin-x", version: "2.0.0" },
  },
  {
    input: "discord@next",
    expected: { name: "@elizaos/plugin-discord", version: "next" },
  },
  {
    input: "plugin-twitter@1.0.0",
    expected: { name: "plugin-twitter", version: "1.0.0" },
  },
  {
    input: "@elizaos/plugin-whatsapp",
    expected: { name: "@elizaos/plugin-whatsapp", version: undefined },
  },
];

console.log("Testing plugin version parsing...\n");

let passed = 0;
let failed = 0;

for (const test of tests) {
  const result = parsePluginSpec(test.input);
  const isMatch =
    result.name === test.expected.name &&
    result.version === test.expected.version;

  if (isMatch) {
    console.log(`✅ PASS: "${test.input}"`);
    console.log(`   → name: ${result.name}, version: ${result.version || "undefined"}`);
    passed++;
  } else {
    console.log(`❌ FAIL: "${test.input}"`);
    console.log(`   Expected: name: ${test.expected.name}, version: ${test.expected.version || "undefined"}`);
    console.log(`   Got:      name: ${result.name}, version: ${result.version || "undefined"}`);
    failed++;
  }
  console.log();
}

console.log(`\n${"=".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
console.log(`${"=".repeat(50)}\n`);

if (failed > 0) {
  process.exit(1);
}
