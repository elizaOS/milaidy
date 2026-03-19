# Mobile & Desktop Builds

Build, sign, and ship Milady for iOS, Android, macOS, Windows, and Linux.

**App ID:** `com.miladyai.milady` (iOS) / `ai.milady.app` (Android/macOS)

---

## Prerequisites (All Platforms)

```bash
# Clone and install
git clone https://github.com/milady-ai/milady.git && cd milady
bun install          # runs postinstall hooks automatically

# Build web assets (required before any mobile/desktop build)
cd apps/app && bun scripts/build.mjs
```

---

## iOS

### Local Requirements

| Tool | Version | Install |
|------|---------|---------|
| macOS | 13+ | - |
| Xcode | 16+ | Mac App Store |
| CocoaPods | 1.14+ | `brew install cocoapods` |
| Bun | 1.3+ | `brew install oven-sh/bun/bun` |

Ensure UTF-8 encoding is set (add to `~/.zshrc` if not):
```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

### Build Commands

```bash
# From repo root:
bun run build:ios          # Build web assets + sync to iOS project
bun run dev:ios            # Build + open in Xcode

# From apps/app/:
bunx capacitor sync ios    # Sync web assets to native project (no rebuild)
bunx capacitor open ios    # Open in Xcode
```

### Build from Xcode

1. Open `apps/app/ios/App/App.xcworkspace` (not `.xcodeproj`)
2. Select the **App** scheme and your target device/simulator
3. Product > Build (Cmd+B) or Product > Run (Cmd+R)

### Build from Command Line

```bash
# Debug (simulator)
xcodebuild -workspace apps/app/ios/App/App.xcworkspace \
  -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro'

# Debug (device, no signing)
xcodebuild -workspace apps/app/ios/App/App.xcworkspace \
  -scheme App -sdk iphoneos -configuration Debug \
  CODE_SIGN_IDENTITY=- CODE_SIGNING_REQUIRED=NO CODE_SIGNING_ALLOWED=NO \
  ARCHS=arm64
```

### Code Signing & Distribution

Milady uses **Fastlane Match** for certificate management. Certificates and profiles are stored in a private Git repository.

**One-time setup (team lead):**
1. Create a private Git repo for certificates
2. Run `bundle exec fastlane match init` in `apps/app/ios/`
3. Run `bundle exec fastlane match appstore` to generate and store certs

**For CI**, set these GitHub secrets:

| Secret | Description |
|--------|-------------|
| `MATCH_GIT_URL` | HTTPS URL of the certificates Git repo |
| `MATCH_PASSWORD` | Encryption password for the certificates repo |
| `MATCH_GIT_BASIC_AUTHORIZATION` | Base64-encoded `user:token` for the certificates repo |
| `APPLE_ID` | Apple ID email address |
| `APPLE_TEAM_ID` | 10-character Apple Developer Team ID |
| `ITC_TEAM_ID` | iTunes Connect team ID (often same as Team ID) |
| `APP_STORE_APP_ID` | Numeric App Store app ID (from App Store Connect) |
| `APPLE_APP_SPECIFIC_PASSWORD` | Generated at [appleid.apple.com](https://appleid.apple.com) > App-Specific Passwords |

### Deploy to TestFlight

**From CI (recommended):**
- Push a GitHub Release or trigger `apple-store-release.yml` manually with `track: testflight`

**Locally:**
```bash
cd apps/app/ios
bundle install
bundle exec fastlane beta
```

### Deploy to App Store

Trigger `apple-store-release.yml` with `track: app-store`, or locally:
```bash
cd apps/app/ios
bundle exec fastlane release
```

### Fastlane Lanes (iOS)

| Lane | What it does |
|------|-------------|
| `certs` | Sync signing certificates via Match |
| `build` | Build IPA for App Store |
| `beta` | Build + upload to TestFlight |
| `release` | Build + submit for App Store review |
| `metadata` | Upload screenshots and metadata only |

---

## Android

### Local Requirements

| Tool | Version | Install |
|------|---------|---------|
| JDK | 21 | `brew install openjdk@21` |
| Android SDK | API 35 | Via Android Studio SDK Manager |
| Android Build Tools | 35.0.0 | Via Android Studio SDK Manager |
| Bun | 1.3+ | `brew install oven-sh/bun/bun` |

Set environment variables (add to `~/.zshrc`):
```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
export PATH=$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
```

### Build Commands

```bash
# From repo root:
bun run build:android      # Build web assets + sync to Android project
bun run dev:android        # Build + open in Android Studio

# From apps/app/:
bunx capacitor sync android    # Sync web assets to native project
bunx capacitor open android    # Open in Android Studio
```

### Build Debug APK

```bash
cd apps/app/android
./gradlew assembleDebug
# Output: app/build/outputs/apk/debug/app-debug.apk
```

### Build Release AAB (Signed)

```bash
cd apps/app/android

# Set signing environment
export MILADY_KEYSTORE_PATH=/path/to/your/upload-keystore.jks
export MILADY_KEYSTORE_PASSWORD=your-keystore-password
export MILADY_KEY_ALIAS=your-key-alias
export MILADY_KEY_PASSWORD=your-key-password
export MILADY_VERSION_NAME=2.0.0-alpha.92
export MILADY_VERSION_CODE=2000092

./gradlew bundleRelease
# Output: app/build/outputs/bundle/release/app-release.aab
```

### Create a Signing Keystore

If you don't have one yet:
```bash
keytool -genkey -v -keystore milady-upload.jks -keyalg RSA -keysize 2048 \
  -validity 10000 -alias milady-upload \
  -dname "CN=Milady AI, OU=Mobile, O=Milady AI, L=San Francisco, S=CA, C=US"
```

**Important:** Back up this keystore securely. If lost, you cannot update the app on Google Play.

### Deploy to Google Play

**CI secrets required:**

| Secret | Description |
|--------|-------------|
| `ANDROID_KEYSTORE_BASE64` | Base64-encoded upload keystore: `base64 -i milady-upload.jks` |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Key alias (e.g., `milady-upload`) |
| `ANDROID_KEY_PASSWORD` | Key password |
| `PLAY_STORE_SERVICE_ACCOUNT_JSON` | Base64-encoded Google Play service account JSON key |

**Creating a Play Store service account:**
1. Go to [Google Cloud Console](https://console.cloud.google.com) > IAM > Service Accounts
2. Create a service account with no roles
3. Download JSON key
4. In Google Play Console > Setup > API access, link the service account
5. Grant "Release manager" or "Admin" permissions
6. Base64-encode the JSON: `base64 -i service-account.json`

**Trigger from CI:**
- Push a GitHub Release, or trigger `android-release.yml` manually with `track: internal|beta|production`

**Locally via Fastlane:**
```bash
cd apps/app/android
bundle install
export PLAY_STORE_JSON_KEY=/path/to/service-account.json
bundle exec fastlane internal    # Upload to internal testing
bundle exec fastlane beta        # Promote internal -> beta
bundle exec fastlane production  # Promote beta -> production
```

### Version Code Calculation

The CI calculates `versionCode` from the semver string:
```
MAJOR * 1000000 + MINOR * 10000 + PATCH * 100 + PRE
Example: 2.0.0-alpha.92 -> 2000092
```

---

## macOS (Mac App Store)

### Local Requirements

| Tool | Version | Install |
|------|---------|---------|
| macOS | 13+ | - |
| Xcode | 16+ | Mac App Store |
| Bun | 1.3+ | `brew install oven-sh/bun/bun` |

### Build Commands

```bash
# Direct distribution (Electrobun)
bun run build:desktop

# Development
bun run dev:desktop
```

### Signing for Mac App Store

The Mac App Store requires two certificates:
1. **Apple Distribution** (code signing) — signs the app binary
2. **3rd Party Mac Developer Installer** — signs the `.pkg` installer

**CI secrets required:**

| Secret | Description |
|--------|-------------|
| `MAS_CSC_LINK` | Base64-encoded Apple Distribution .p12 certificate |
| `MAS_CSC_KEY_PASSWORD` | Password for the .p12 |
| `MAS_INSTALLER_CERT` | Base64-encoded 3rd Party Mac Developer Installer .p12 |
| `MAS_INSTALLER_KEY_PASSWORD` | Password for the installer .p12 |
| `APP_STORE_API_KEY_ID` | App Store Connect API key ID |
| `APP_STORE_API_ISSUER_ID` | App Store Connect API issuer ID |
| `APPLE_ID` | Apple ID email |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password |

**Exporting certificates:**
1. Open Keychain Access
2. Find your "Apple Distribution" certificate > Export as .p12
3. Find "3rd Party Mac Developer Installer" certificate > Export as .p12
4. Base64-encode both: `base64 -i certificate.p12`

### Direct Distribution (Developer ID)

For distributing outside the Mac App Store:

| Secret | Description |
|--------|-------------|
| `CSC_LINK` | Base64-encoded Developer ID Application .p12 |
| `CSC_KEY_PASSWORD` | Password for the .p12 |

The Electrobun build handles notarization automatically when `ELECTROBUN_SKIP_CODESIGN` is not set.

---

## Windows

### Direct Distribution

Windows builds use Electrobun with code signing via either a PFX certificate or Azure Trusted Signing.

**PFX Signing secrets:**

| Secret | Description |
|--------|-------------|
| `WINDOWS_SIGN_CERT_BASE64` | Base64-encoded PFX code signing certificate |
| `WINDOWS_SIGN_CERT_PASSWORD` | PFX password |
| `WINDOWS_SIGN_TIMESTAMP_URL` | Timestamp server (defaults to DigiCert) |

**Azure Trusted Signing (alternative, ~$10/month):**

| Secret | Description |
|--------|-------------|
| `AZURE_TENANT_ID` | Azure AD tenant ID |
| `AZURE_CLIENT_ID` | Service principal client ID |
| `AZURE_CLIENT_SECRET` | Service principal secret |
| `AZURE_SIGN_ENDPOINT` | e.g., `https://eus.codesigning.azure.net/` |
| `AZURE_SIGN_ACCOUNT_NAME` | Trusted Signing account name |
| `AZURE_SIGN_PROFILE_NAME` | Certificate profile name |

See `docs/azure-trusted-signing-setup.md` for full Azure setup instructions and `docs/windows-signing.md` for PFX setup.

---

## Linux

Linux builds are unsigned and distributed as `.tar.zst` archives via GitHub Releases.

```bash
bun run build:desktop   # Builds for current platform
```

---

## CI/CD Workflows

### Trigger Methods

| Workflow | Auto Trigger | Manual Trigger |
|----------|-------------|----------------|
| `apple-store-release.yml` | On GitHub Release publish | Actions > Run workflow (choose platform + track) |
| `android-release.yml` | On GitHub Release publish | Actions > Run workflow (choose track + version) |
| `release-electrobun.yml` | On `v*` tag push | Actions > Run workflow (choose tag) |

### Release Flow

1. Update version in `package.json`
2. Create a GitHub Release with tag `v2.0.0-alpha.93` (for example)
3. iOS and Android workflows trigger automatically
4. Desktop builds trigger on the tag push
5. Artifacts are uploaded to GitHub Releases and (optionally) `milady.ai/releases/`

### Version Management

Versions are synchronized across files at build time:
- `package.json` (root) — source of truth
- `apps/app/package.json` — app version
- `apps/app/electrobun/electrobun.config.ts` — desktop version
- `apps/app/ios/App/App.xcodeproj/project.pbxproj` — iOS version (updated by CI via `sed`)
- Android uses env vars (`MILADY_VERSION_NAME`, `MILADY_VERSION_CODE`) — no file edits needed

### All Secrets Reference

<details>
<summary>Complete list of GitHub secrets needed for full CI/CD</summary>

**Apple (iOS + macOS):**
- `APPLE_ID`
- `APPLE_TEAM_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `ITC_TEAM_ID`
- `APP_STORE_APP_ID`
- `APP_STORE_API_KEY_ID`
- `APP_STORE_API_ISSUER_ID`
- `MATCH_GIT_URL`
- `MATCH_PASSWORD`
- `MATCH_GIT_BASIC_AUTHORIZATION`
- `MAS_CSC_LINK`
- `MAS_CSC_KEY_PASSWORD`
- `MAS_INSTALLER_CERT`
- `MAS_INSTALLER_KEY_PASSWORD`
- `CSC_LINK`
- `CSC_KEY_PASSWORD`

**Android:**
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `PLAY_STORE_SERVICE_ACCOUNT_JSON`

**Windows:**
- `WINDOWS_SIGN_CERT_BASE64`
- `WINDOWS_SIGN_CERT_PASSWORD`
- `WINDOWS_SIGN_TIMESTAMP_URL`

**Windows (Azure alternative):**
- `AZURE_TENANT_ID`
- `AZURE_CLIENT_ID`
- `AZURE_CLIENT_SECRET`
- `AZURE_SIGN_ENDPOINT`
- `AZURE_SIGN_ACCOUNT_NAME`
- `AZURE_SIGN_PROFILE_NAME`

**Release hosting:**
- `RELEASE_UPLOAD_KEY`
- `RELEASE_HOST_FINGERPRINT`

</details>

---

## Ports

| Service | Dev Port | Env Override |
|---------|----------|--------------|
| API + WebSocket | 31337 | `MILADY_API_PORT` |
| Dashboard UI | 2138 | `MILADY_PORT` |
| Gateway | 18789 | `MILADY_GATEWAY_PORT` |

---

## Troubleshooting

### iOS: "Failed to launch AssetCatalogSimulatorAgent"
Update Xcode to 16.2+. If stuck on 16.1, boot a simulator before building:
```bash
xcrun simctl boot "iPhone 16 Pro"
```

### iOS: CocoaPods UTF-8 error
```bash
export LANG=en_US.UTF-8
export LC_ALL=en_US.UTF-8
```

### Android: "Plugin not found at runtime"
Ensure `NODE_PATH` is set. Run `bun run repair` from the repo root.

### Android: Gradle build fails with Java errors
Verify JDK 21 is active: `java -version` should show 21.x. Set `JAVA_HOME` explicitly.

### Capacitor version mismatch warning
Run `bun install` from the repo root to ensure all `@capacitor/*` packages are aligned.

### macOS: Notarization fails
Ensure `APPLE_APP_SPECIFIC_PASSWORD` is set and the Apple ID has accepted the latest developer agreement at [developer.apple.com](https://developer.apple.com).
