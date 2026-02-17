## Table of Contents

1. [Prerequisites](#prerequisites)
2. [macOS Electron -- Signing and Notarization](#macos-electron----signing-and-notarization)
3. [Windows Electron -- Signing](#windows-electron----signing)
4. [Linux Electron](#linux-electron)
5. [iOS -- App Store](#ios----app-store)
6. [Android -- Play Store](#android----play-store)
7. [GitHub Actions Secrets (Complete List)](#github-actions-secrets-complete-list)
8. [Local Development Signing](#local-development-signing)
9. [Cutting a Release](#cutting-a-release)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

- Node.js >= 22 and bun installed
- Apple Developer Program membership ($99/year) -- required for macOS notarization and iOS distribution
- Google Play Developer account ($25 one-time) -- required for Android distribution
- (Optional) Windows code signing certificate -- EV or OV cert from DigiCert, Sectigo, etc.

---

## macOS Electron -- Signing and Notarization

Without signing and notarization, macOS Gatekeeper blocks the app with:
"macOS cannot verify that this app is free from malware."

The config in `apps/app/electron/electron-builder.config.json` is already set up with:
- `hardenedRuntime: true`
- `entitlements: "entitlements.mac.plist"`
- `notarize: true`
- Targets: DMG + ZIP (zip is required for Electron auto-updater)

All you need to do is set up the certificate and add GitHub secrets.

### Step 1: Get a Developer ID Application Certificate

1. Open Keychain Access on your Mac
2. Go to Keychain Access > Certificate Assistant > Request a Certificate from a Certificate Authority
3. Fill in your email (`shawmakesmusic@gmail.com`) and name, select "Saved to disk", save the CSR
4. Log into https://developer.apple.com/account
5. Go to Certificates, Identifiers & Profiles > Certificates > +
6. Choose **Developer ID Application** (NOT "Mac App Distribution")
7. Upload your CSR and download the certificate
8. Double-click to install it in your Keychain

### Step 2: Export the Certificate as .p12

1. In Keychain Access, find the "Developer ID Application: ..." certificate
2. Expand it to reveal the private key
3. Select BOTH the certificate AND the private key
4. Right-click > Export 2 items... > save as `milady-mac-cert.p12`
5. Set a strong password (this becomes `CSC_KEY_PASSWORD`)

### Step 3: Base64-encode the .p12

```bash
base64 -i milady-mac-cert.p12 | tr -d '\n' > milady-mac-cert.b64
cat milady-mac-cert.b64
# Copy the entire output -- this is your CSC_LINK value
```

### Step 4: Generate an App-Specific Password

1. Go to https://appleid.apple.com > Sign-In and Security > App-Specific Passwords
2. Click Generate and name it "Milady Notarization"
3. Copy the generated password (format: `xxxx-xxxx-xxxx-xxxx`)

### Step 5: Add GitHub Secrets for macOS

Go to your repo Settings > Secrets and variables > Actions > New repository secret:

- `CSC_LINK` -- the base64-encoded `.p12` from Step 3
- `CSC_KEY_PASSWORD` -- the password you set when exporting the `.p12`
- `APPLE_ID` -- `shawmakesmusic@gmail.com`
- `APPLE_APP_SPECIFIC_PASSWORD` -- the app-specific password from Step 4
- `APPLE_TEAM_ID` -- `25877RY2EH`

---

## Windows Electron -- Signing

Unsigned Windows apps trigger SmartScreen warnings ("Windows protected your PC").

### Option A: EV Code Signing Certificate (recommended)

- ~$200-400/year from DigiCert, Sectigo, GlobalSign, or SSL.com
- Immediate SmartScreen trust (no reputation building)
- Usually ships on a hardware token; cloud signing options available

### Option B: OV (Organization Validation) Certificate

- ~$70-200/year
- Requires building SmartScreen reputation over time

### Option C: Azure Trusted Signing

- ~$10/month via Azure
- Microsoft's cloud-based signing service

### Setup (Options A or B)

1. Purchase and export the certificate as `.pfx` (PKCS#12)
2. Base64-encode it:

```bash
base64 -i milady-win-cert.pfx | tr -d '\n' > milady-win-cert.b64
```

3. Add GitHub secrets:
   - `WIN_CSC_LINK` -- base64-encoded `.pfx`
   - `WIN_CSC_KEY_PASSWORD` -- password for the `.pfx`

---

## Linux Electron

No code signing required. AppImage and .deb targets work as-is.

---

## iOS -- App Store

The bundle ID `com.miladyai.milady` is already registered in the Apple Developer portal.
The Xcode project is configured with `DEVELOPMENT_TEAM = 25877RY2EH` and automatic signing.

### Build and Upload

```bash
# Build web assets and sync to iOS
cd apps/app
bun run build:ios

# Open in Xcode
npx cap open ios
```

In Xcode:
1. Product > Archive
2. Distribute App > App Store Connect
3. Follow the prompts to upload

### App Store Connect Setup

1. Go to https://appstoreconnect.apple.com
2. Click + > New App
3. Fill in:
   - Platform: iOS
   - Name: Milady
   - Bundle ID: `com.miladyai.milady`
   - SKU: `milady`
4. Set up your app listing (description, screenshots, etc.)

---

## Android -- Play Store

### Step 1: Generate a Signing Keystore

```bash
keytool -genkey -v \
  -keystore milady-release.keystore \
  -alias milady \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass <your-store-password> \
  -keypass <your-key-password> \
  -dname "CN=Milady, O=milady-ai"
```

BACK UP THIS KEYSTORE. If you lose it, you cannot push updates to the same Play Store listing.

### Step 2: Base64-encode the Keystore

```bash
base64 -i milady-release.keystore | tr -d '\n' > milady-release.b64
```

### Step 3: Add GitHub Secrets

- `ANDROID_KEYSTORE` -- base64-encoded keystore
- `ANDROID_KEYSTORE_PASSWORD` -- the storepass
- `ANDROID_KEY_ALIAS` -- `milady`
- `ANDROID_KEY_PASSWORD` -- the keypass

### Step 4: Configure Gradle Signing

Add a signing config to `apps/app/android/app/build.gradle` inside the `android` block:

```groovy
signingConfigs {
    release {
        def ksPath = System.getenv("ANDROID_KEYSTORE_PATH")
        if (ksPath) {
            storeFile file(ksPath)
            storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
            keyAlias System.getenv("ANDROID_KEY_ALIAS") ?: "milady"
            keyPassword System.getenv("ANDROID_KEY_PASSWORD")
        }
    }
}

buildTypes {
    release {
        minifyEnabled false
        proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'
        if (signingConfigs.release.storeFile) {
            signingConfig signingConfigs.release
        }
    }
}
```

### Step 5: Google Play Console

1. Go to https://play.google.com/console and create a developer account ($25)
2. Create a new app with package name `com.miladyai.milady`
3. Enable Play App Signing (recommended)
4. Build and upload your first AAB:

```bash
cd apps/app
bun run build:android
npx cap open android
# In Android Studio: Build > Generate Signed Bundle / APK > Android App Bundle
```

---

## GitHub Actions Secrets (Complete List)

Add these at **Settings > Secrets and variables > Actions** in the `milady-ai/milady` repo.

### macOS Signing + Notarization (required for clean macOS builds)

| Secret | Value |
|---|---|
| `CSC_LINK` | Base64 `.p12` Developer ID Application certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` |
| `APPLE_ID` | `shawmakesmusic@gmail.com` |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password from appleid.apple.com |
| `APPLE_TEAM_ID` | `25877RY2EH` |

### Windows Signing (optional)

| Secret | Value |
|---|---|
| `WIN_CSC_LINK` | Base64 `.pfx` code signing certificate |
| `WIN_CSC_KEY_PASSWORD` | Password for the `.pfx` |

### Android Signing (optional)

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE` | Base64 keystore file |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | `milady` |
| `ANDROID_KEY_PASSWORD` | Key password |

### iOS CI/CD (optional, for automated App Store uploads)

| Secret | Value |
|---|---|
| `IOS_CERTIFICATE_P12` | Base64 Apple Distribution certificate |
| `IOS_CERTIFICATE_PASSWORD` | Certificate password |
| `IOS_PROVISIONING_PROFILE` | Base64 provisioning profile |
| `APPSTORE_CONNECT_API_KEY_ID` | App Store Connect API key ID |
| `APPSTORE_CONNECT_API_ISSUER_ID` | API issuer ID |
| `APPSTORE_CONNECT_API_KEY` | Base64 `.p8` private key |

---

## Local Development Signing

To test signed macOS builds locally:

```bash
# Set env vars (or add to .env / shell profile)
export CSC_LINK="$(base64 -i ~/path/to/milady-mac-cert.p12 | tr -d '\n')"
export CSC_KEY_PASSWORD="your-password"
export APPLE_ID="shawmakesmusic@gmail.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="25877RY2EH"

# Build and package
cd apps/app
bun run build:electron
cd electron
bun install
bunx electron-builder build --mac -c ./electron-builder.config.json
```

The DMG in `electron/dist/` will be signed and notarized.

---

## Cutting a Release

### Via GitHub Actions (recommended)

**Option A: Tag push**

```bash
# Bump version in package.json first, then:
git tag v2.0.0-alpha.3
git push origin v2.0.0-alpha.3
```

The `Build & Release` workflow triggers automatically. It builds for macOS (Intel + Apple Silicon), Windows, and Linux, signs/notarizes the macOS builds, and creates a GitHub Release with all artifacts and SHA256 checksums.

**Option B: Manual dispatch**

1. Go to Actions > Build & Release > Run workflow
2. Enter the tag (e.g. `v2.0.0-alpha.3`)
3. Check "Create as draft release" if you want to review before publishing

### Release Artifacts

Each release includes:
- `Milady-X.Y.Z-arm64.dmg` -- macOS Apple Silicon (signed + notarized)
- `Milady-X.Y.Z.dmg` -- macOS Intel (signed + notarized)
- `Milady-X.Y.Z-arm64-mac.zip` -- macOS Apple Silicon (for auto-updater)
- `Milady-X.Y.Z-mac.zip` -- macOS Intel (for auto-updater)
- `Milady-Setup-X.Y.Z.exe` -- Windows installer
- `Milady-X.Y.Z.AppImage` -- Linux AppImage
- `milady_X.Y.Z_amd64.deb` -- Debian/Ubuntu package
- `SHA256SUMS.txt` -- checksums for all files

### Serving via GitHub Pages

The install scripts at `milady-ai.github.io/milady/` point to these releases. Users can install with:

```bash
curl -fsSL https://milady-ai.github.io/milady/install.sh | bash
```

---

## Troubleshooting

### "The application is damaged and can't be opened"
The app was signed but not notarized. Check `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`.

### "macOS cannot verify that this app is free from malware"
The app is not signed at all. Check `CSC_LINK` and `CSC_KEY_PASSWORD`. The certificate must be a **Developer ID Application** certificate.

### Notarization fails with "The signature of the binary is invalid"
Missing entitlements. Verify `entitlements.mac.plist` exists in `apps/app/electron/` and `hardenedRuntime` is `true` in electron-builder config.

### Notarization fails with "You must first sign the relevant contracts"
Log into https://developer.apple.com and accept any pending license agreements.

### electron-builder can't find the certificate
In CI, `CSC_LINK` must be the raw base64 string with no line breaks (`base64 | tr -d '\n'`). Locally, make sure the cert is in your login keychain.

### SmartScreen blocks the Windows installer
Without an EV cert, SmartScreen reputation builds over time. Users click "More info > Run anyway". An EV cert gives immediate trust.

### Android "No key with alias found"
Verify `ANDROID_KEY_ALIAS` matches the alias from keytool (default: `milady`).

### iOS "No signing certificate found"
Open Xcode > Preferences > Accounts, ensure your Apple ID is added and team `25877RY2EH` is visible. Click Manage Certificates.

### Build fails on GitHub Actions
Check that all required secrets are set. Missing secrets result in empty env vars which cause electron-builder to skip signing silently (macOS builds will still produce DMGs, just unsigned).
