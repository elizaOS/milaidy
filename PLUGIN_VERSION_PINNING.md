# Plugin Version Pinning

This feature allows you to install specific versions of plugins, giving you more control over which versions are used in your Milaidy setup.

## Usage

### Installing a Specific Version

Use the `@version` syntax to install a specific version of a plugin:

```bash
# Install a specific version
milaidy plugins install twitter@1.2.23-alpha.0

# Install latest from registry (no version specified)
milaidy plugins install twitter

# Works with full package names
milaidy plugins install @elizaos/plugin-twitter@1.2.23-alpha.0

# Works with shorthand names
milaidy plugins install discord@2.0.0
```

### Version Formats Supported

The version parameter supports standard npm version formats:

- **Specific versions**: `1.2.3`, `2.0.0-alpha.1`
- **Dist-tags**: `next`, `latest`, `alpha`
- **Semver ranges**: `^1.2.0`, `~1.2.3`, `>=1.0.0`

## Examples

### Twitter Plugin with Bug Fixes

Install the Twitter plugin with critical bug fixes (v1.2.23-alpha.0):

```bash
milaidy plugins install twitter@1.2.23-alpha.0
```

This version includes:
- Fixed infinite auth retry loop
- Fixed false positive credential warnings
- Fixed missing media uploads
- Fixed AUTO_RESPOND for mention replies

### Installing from Different Channels

```bash
# Install the latest stable version
milaidy plugins install twitter@latest

# Install the next/development version
milaidy plugins install twitter@next

# Install a specific alpha version
milaidy plugins install twitter@1.2.23-alpha.0
```

## How It Works

1. **Version Parsing**: The CLI parses `name@version` syntax
2. **Plugin Resolution**: Looks up the plugin in the registry
3. **Version Override**: Uses your specified version instead of the registry default
4. **Installation**: Installs the exact version via npm/bun/pnpm

## When to Use Version Pinning

### ✅ Good Use Cases:

- **Bug Fixes**: Install a specific version with critical fixes
- **Testing**: Test a pre-release version before it becomes default
- **Stability**: Pin to a known-good version
- **Compatibility**: Use a version compatible with your setup

### ⚠️ Consider Carefully:

- **Security**: Older versions may have security vulnerabilities
- **Compatibility**: Ensure version compatibility with your Milaidy version
- **Updates**: Pinned versions won't auto-update

## Checking Installed Versions

View your currently installed plugins and their versions:

```bash
milaidy plugins installed
```

## Updating a Plugin

To update a plugin to a newer version:

```bash
# Uninstall current version
milaidy plugins uninstall twitter

# Install new version
milaidy plugins install twitter@1.2.24
```

Or simply reinstall with the new version:

```bash
milaidy plugins install twitter@1.2.24
```

## Troubleshooting

### Version Not Found

If you get an error that a version doesn't exist:

```bash
# Check available versions on npm
npm view @elizaos/plugin-twitter versions

# Or use the registry default
milaidy plugins install twitter
```

### Compatibility Issues

If a specific version causes issues:

1. Check the plugin documentation for compatibility
2. Try the registry default version:
   ```bash
   milaidy plugins install twitter
   ```
3. Report compatibility issues to the plugin maintainers

## Implementation Details

- **CLI**: [src/cli/plugins-cli.ts](src/cli/plugins-cli.ts:282)
- **Installer**: [src/services/plugin-installer.ts](src/services/plugin-installer.ts:178)
- **Parser**: `parsePluginSpec()` function in CLI

## Related Issues

- Addresses #144 - Twitter plugin bug fixes
- Enables users to install specific plugin versions for testing and stability
