## Summary

Adds version pinning support to the plugin install command, allowing users to install specific versions of plugins using `name@version` syntax. This enables installing plugins with critical bug fixes, testing pre-release versions, and maintaining version stability.

## What's New

### ✨ Version Specification Support

Users can now install specific plugin versions:

```bash
# Install specific version
milaidy plugins install twitter@1.2.23-alpha.0

# Use dist-tags
milaidy plugins install discord@next

# Works with full package names
milaidy plugins install @elizaos/plugin-twitter@1.2.23-alpha.0

# Install latest from registry (default behavior unchanged)
milaidy plugins install twitter
```

### 🔧 Implementation

**1. Enhanced CLI Parser** ([src/cli/plugins-cli.ts](src/cli/plugins-cli.ts:15))
- Added `parsePluginSpec()` function to parse `name@version` syntax
- Handles scoped packages: `@scope/name@version`
- Handles unscoped packages: `name@version`
- Maintains backward compatibility (version is optional)

**2. Enhanced Plugin Installer** ([src/services/plugin-installer.ts](src/services/plugin-installer.ts:178))
- Added optional `requestedVersion` parameter
- Uses requested version instead of registry default when provided
- Falls back to registry version (`v2Version` → `v1Version` → `next`) when no version specified

**3. Comprehensive Documentation** ([PLUGIN_VERSION_PINNING.md](PLUGIN_VERSION_PINNING.md))
- Usage guide and examples
- Version format support (semver, dist-tags, ranges)
- Best practices and use cases
- Troubleshooting guide

## Use Cases

### 🐛 Bug Fixes - Twitter Plugin

The primary motivation for this feature is to enable users to install the Twitter plugin with critical bug fixes:

```bash
milaidy plugins install twitter@1.2.23-alpha.0
```

This version includes fixes for:
- ✅ Infinite auth retry loop (respects `retryLimit`)
- ✅ False positive credential warnings
- ✅ Missing media uploads (Twitter API v1)
- ✅ AUTO_RESPOND for mention replies

### 🧪 Testing Pre-Release Versions

```bash
# Test alpha versions before they become default
milaidy plugins install whatsapp@2.0.0-alpha.7
```

### 📌 Version Stability

```bash
# Pin to a known-good version
milaidy plugins install discord@1.0.5
```

### 🔄 Using Dist-Tags

```bash
# Install from next channel
milaidy plugins install twitter@next

# Install latest stable
milaidy plugins install twitter@latest
```

## Testing

### ✅ All Tests Passing

**Parsing Tests** (7/7 pass):
```
✅ "twitter" → @elizaos/plugin-twitter (no version)
✅ "twitter@1.2.23-alpha.0" → @elizaos/plugin-twitter@1.2.23-alpha.0
✅ "@elizaos/plugin-twitter@1.2.23-alpha.0" → @elizaos/plugin-twitter@1.2.23-alpha.0
✅ "@custom/plugin-x@2.0.0" → @custom/plugin-x@2.0.0
✅ "discord@next" → @elizaos/plugin-discord@next
✅ "plugin-twitter@1.0.0" → plugin-twitter@1.0.0
✅ "@elizaos/plugin-whatsapp" → @elizaos/plugin-whatsapp (no version)
```

**Build Status**: ✅ TypeScript compilation successful, build completes without errors

### 🧪 Test File Included

Created `test-plugin-parsing.mjs` with comprehensive test coverage for the parsing logic.

## Breaking Changes

**None** - This is a backward-compatible enhancement:
- Existing commands work unchanged
- Version parameter is optional
- Default behavior (using registry version) is preserved

## Implementation Details

### Parsing Logic

```typescript
// Input: "twitter@1.2.23-alpha.0"
// Output: { name: "@elizaos/plugin-twitter", version: "1.2.23-alpha.0" }

function parsePluginSpec(input: string): { name: string; version?: string } {
  // Handles scoped packages: @scope/name@version
  // Handles unscoped packages: name@version
  // Normalizes shorthand: twitter → @elizaos/plugin-twitter
}
```

### Version Priority

```typescript
// Priority order:
const npmVersion = requestedVersion         // User-specified version (highest priority)
                || info.npm.v2Version       // Registry v2 version
                || info.npm.v1Version       // Registry v1 version
                || "next";                  // Fallback to next channel
```

## Related Issues

Addresses #144

## Supersedes

This PR supersedes #244 which attempted to update the Twitter plugin version in `package.json`. The develop branch has migrated to a dynamic plugin installation system where connector plugins are no longer listed in `package.json`, making #244's approach obsolete.

**Why This Approach is Better:**
- ✅ Works with the new plugin architecture
- ✅ Provides flexibility for all plugins, not just Twitter
- ✅ Enables users to choose which version to install
- ✅ Supports dist-tags and semver ranges
- ✅ Maintains backward compatibility

## Next Steps

After merging, users can immediately install the Twitter plugin with bug fixes:

```bash
milaidy plugins install twitter@1.2.23-alpha.0
```

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
