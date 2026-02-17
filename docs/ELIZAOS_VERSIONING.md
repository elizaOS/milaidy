# ElizaOS Version Pinning Strategy

## Why We Pin Specific Packages

Milady uses ElizaOS as its AI agent runtime. During the 2.0.0 alpha release cycle, we've discovered version compatibility issues that require careful dependency management.

## The Problem with `"next"` Tag

The `"next"` npm dist-tag is intended to point to the latest pre-release version. However, in the ElizaOS ecosystem, we encountered several issues:

### Issue 1: Mismatched Plugin Versions

The `@elizaos/core` package has released up to `2.0.0-alpha.10`, but many plugins only publish up to `2.0.0-alpha.4`. When using `"next"`:

- `@elizaos/core@next` → resolves to `2.0.0-alpha.10` ✓
- `@elizaos/plugin-openai@next` → resolves to `2.0.0-alpha.4` ⚠️
- `@elizaos/plugin-ollama@next` → resolves to `2.0.0-alpha.4` ⚠️
- `@elizaos/plugin-google-genai@next` → resolves to `2.0.0-alpha.4` ⚠️

### Issue 2: Breaking Changes in Alpha Releases

Alpha releases are not guaranteed to be API-compatible. We experienced runtime failures when plugins at `alpha.4` tried to import exports that were added or changed in `@elizaos/core@alpha.10`.

### Issue 3: Version Skew Errors

When a plugin's `"next"` resolves to a version that's incompatible with the core's `"next"`, Node.js throws errors like:

```
Export named 'MAX_EMBEDDING_TOKENS' not found in '@elizaos/core'
```

This happens because the plugin was compiled against a newer core API that doesn't exist in the version actually installed.

## Our Solution: Pin to Latest Compatible Versions

We pin the following packages to specific alpha versions that are known to work together:

### Pinned Packages

```json
{
  "@elizaos/core": "2.0.0-alpha.10",
  "@elizaos/plugin-openai": "2.0.0-alpha.4",
  "@elizaos/plugin-ollama": "2.0.0-alpha.4", 
  "@elizaos/plugin-google-genai": "2.0.0-alpha.4",
  "@elizaos/plugin-openrouter": "2.0.0-alpha.4",
  "@elizaos/plugin-knowledge": "2.0.0-alpha.4"
}
```

**Why these versions?**
- These are the **latest available** versions for each package as of this pinning
- Core at `alpha.10` is backward-compatible with plugins at `alpha.4`
- Plugins at `alpha.4` do not attempt to import any symbols that don't exist in their declared core peer dependencies

### Other Packages Stay on `"next"`

Most other ElizaOS plugins can safely remain on `"next"` because:
1. They don't have the same version skew issues
2. They're updated more frequently and maintain compatibility
3. We want to automatically pick up bugfixes and improvements

## How to Update Pinned Versions

When updating to newer ElizaOS versions:

1. **Check available versions:**
   ```bash
   npm view @elizaos/core versions --json | grep alpha | tail -5
   npm view @elizaos/plugin-openai versions --json | grep alpha | tail -5
   ```

2. **Test compatibility locally:**
   ```bash
   # Update versions in package.json
   bun install
   bun run build
   bun test src/services/version-compat.test.ts
   ```

3. **Verify no version skew errors:**
   - Start the runtime: `bun run dev`
   - Check logs for "Export named ... not found" errors
   - Test AI model providers (OpenAI, Ollama, Google Gemini, OpenRouter)

4. **Update all pinned packages together:**
   - Don't update just `core` without updating plugins
   - Don't mix `"next"` and pinned versions for the affected packages
   - Keep pinned plugins at the same alpha version (e.g., all at `alpha.4`)

## Version Compatibility Tests

We maintain automated tests in `src/services/version-compat.test.ts` and `src/services/plugin-stability.test.ts` that:

- Verify pinned packages are NOT using `"next"`
- Ensure versions follow the expected semver format
- Detect when packages are upgraded to incompatible versions
- Reproduce known version skew issues (as regression tests)

These tests will fail if you accidentally revert to `"next"` for critical packages.

## When Can We Go Back to `"next"`?

We can switch back to `"next"` when:

1. **ElizaOS reaches stable 2.0.0 release** - stable releases guarantee API compatibility
2. **Plugin releases catch up to core** - if all plugins publish `alpha.10+` in sync
3. **ElizaOS adopts semantic versioning strictly** - ensuring alpha releases don't introduce breaking changes

Until then, **pinning is safer and more predictable** for production deployments.

## Related Issues

- GitHub Issue #10: Version skew causing "MAX_EMBEDDING_TOKENS not found" errors
- ElizaOS 2.0.0-alpha.4+ introduces breaking changes without clear migration docs
- Plugin ecosystem lags behind core releases by several alpha versions

---

**Last Updated:** 2026-02-09  
**Current Pinned Versions:** core@alpha.10, plugins@alpha.4  
**Milady Version:** 2.0.0-alpha.8
