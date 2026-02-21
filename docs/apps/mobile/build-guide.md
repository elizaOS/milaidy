---
title: "Build Guide"
sidebarTitle: "Build Guide"
description: "Compile, sign, and distribute the Milady mobile app for iOS and Android."
---

The Milady mobile app (`apps/app`) is a Capacitor project that wraps the shared web UI in a native shell. Building it requires three steps: compiling the nine custom Capacitor plugins, bundling the Vite web assets, and syncing them into the native iOS or Android project. Distribution builds additionally require code signing — Apple certificates and provisioning profiles for iOS, a keystore for Android.

All build commands are invoked via the `scripts/rt.sh` runtime wrapper from inside the `apps/app` directory. The script selects the correct package manager (Bun) and ensures environment variables are sourced before running.

## Features

- Single-command builds for iOS (`build:ios`) and Android (`build:android`) that compile plugins, bundle assets, and sync to the native project in one step
- Separate plugin build step (`plugin:build`) for faster iteration when only plugin code has changed
- Capacitor sync commands to push already-built web assets to native projects without a full rebuild
- Live reload support by pointing the Capacitor server config at a local Vite dev server
- Xcode and Android Studio integration via `cap:open:ios` and `cap:open:android`

## Configuration

**Prerequisites by platform:**

| Requirement | iOS | Android |
|-------------|-----|---------|
| Operating system | macOS only | macOS, Linux, or Windows |
| IDE | Xcode 15+ | Android Studio (recent) |
| SDK | iOS platform tools via Xcode | Android SDK API 35 via SDK Manager |
| Dependency manager | CocoaPods (`sudo gem install cocoapods`) | JDK 17+ (bundled with Android Studio) |
| Apple Developer account | Required for device/distribution builds | — |
| Keystore file | — | Required for release APK/AAB signing |

**Build commands:**

```bash
# From apps/app — build everything and sync to iOS
../../scripts/rt.sh run build:ios

# Build everything and sync to Android
../../scripts/rt.sh run build:android

# Build all nine custom Capacitor plugins only
../../scripts/rt.sh run plugin:build

# Push already-built web assets to both native projects
../../scripts/rt.sh run cap:sync

# Open native project in IDE
../../scripts/rt.sh run cap:open:ios      # Xcode
../../scripts/rt.sh run cap:open:android  # Android Studio
```

**iOS signing:** Open `apps/app/ios/App/App.xcworkspace` in Xcode, select the App target, go to Signing & Capabilities, and choose your development team. For App Store distribution, select a distribution certificate and a matching provisioning profile.

**Android signing:** Create a release keystore and configure it in `apps/app/android/app/build.gradle` under `signingConfigs`. Use `./gradlew bundleRelease` (AAB for Play Store) or `./gradlew assembleRelease` (APK for direct distribution) from the `android/` directory.

## Live Reload Development

Live reload lets you see web-layer changes on a physical device or simulator without rebuilding native code. Capacitor achieves this by loading the app from your local Vite dev server instead of the bundled assets.

**Setup:**

1. Find your machine's local IP address (e.g., `192.168.1.42`). On macOS, check System Settings → Wi-Fi → Details → IP Address, or run `ipconfig getifaddr en0`.

2. Edit `apps/app/capacitor.config.ts` and add a `server` block pointing at the Vite dev server:

```typescript
const config: CapacitorConfig = {
  // ...existing config
  server: {
    url: "http://192.168.1.42:5173",
    cleartext: true, // required for plain HTTP on Android
  },
};
```

3. Start the Vite dev server from the web project root:

```bash
bun run dev
```

4. Sync and launch on device:

```bash
../../scripts/rt.sh run cap:sync
../../scripts/rt.sh run cap:open:ios    # or cap:open:android
```

5. Run the app from Xcode or Android Studio. The app loads from Vite, and edits to web code hot-reload instantly.

<Warning>
Remove the `server` override from `capacitor.config.ts` before building for distribution. Shipping a release build that points at `localhost` will show a blank screen for end users.
</Warning>

## iOS Build Walkthrough

**Step-by-step debug build:**

1. Compile plugins, bundle web assets, and sync to the iOS project:

```bash
../../scripts/rt.sh run build:ios
```

2. Open the workspace in Xcode:

```bash
open apps/app/ios/App/App.xcworkspace
```

3. In Xcode, select the **App** target, go to **Signing & Capabilities**, and choose your development team.

4. Select your target device or simulator from the device toolbar.

5. Press **Cmd+R** (Product → Run) to build and launch a debug build.

**Distribution via TestFlight:**

1. In Xcode, select **Product → Archive**. Wait for the archive to build.
2. When the Organizer window opens, select the archive and click **Distribute App**.
3. Choose **App Store Connect** → **Upload**.
4. Follow the prompts to select your distribution certificate and provisioning profile.
5. Once uploaded, the build appears in App Store Connect under the TestFlight tab after processing (usually 10-30 minutes).

**Common issue — "No signing certificate":**

This means Xcode cannot find a valid development or distribution certificate. Fix it by navigating to **Xcode → Settings → Accounts**, selecting your Apple ID, clicking your team, then **Manage Certificates**. Click the **+** button to create a new Apple Development certificate. For distribution, create an Apple Distribution certificate through the Apple Developer portal.

## Android Build Walkthrough

**Step-by-step debug build:**

1. Compile plugins, bundle web assets, and sync to the Android project:

```bash
../../scripts/rt.sh run build:android
```

2. Open the Android project in Android Studio:

```bash
# Or use the helper:
../../scripts/rt.sh run cap:open:android
```

3. Wait for Gradle sync to complete. Android Studio will download dependencies and index the project. This can take several minutes on first open.

4. Select your target device or emulator from the device dropdown in the toolbar.

5. Click **Run → Run 'app'** (or press Shift+F10) to install and launch a debug build.

**Release builds:**

For Google Play Store distribution (AAB format):

```bash
cd apps/app/android && ./gradlew bundleRelease
```

For direct distribution (APK format):

```bash
cd apps/app/android && ./gradlew assembleRelease
```

**Release signing setup:**

1. Generate a keystore:

```bash
keytool -genkey -v -keystore release.keystore -alias milady -keyalg RSA -keysize 2048 -validity 10000
```

2. Configure the keystore in `apps/app/android/app/build.gradle` under `signingConfigs`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("release.keystore")
            storePassword "your-store-password"
            keyAlias "milady"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
        }
    }
}
```

<Warning>
Never commit keystore files or passwords to version control. Use environment variables or a secrets manager to inject them at build time.
</Warning>

## CI/CD Considerations

Automated builds for both platforms can run in headless environments without opening an IDE.

**iOS (macOS CI runners only):**

```bash
xcodebuild -workspace ios/App/App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath build/App.xcarchive \
  archive
```

Export the archive with an `ExportOptions.plist` that specifies your distribution method and provisioning profile.

**Android:**

```bash
cd apps/app/android && ./gradlew bundleRelease --no-daemon
```

The `--no-daemon` flag ensures Gradle does not leave background processes on ephemeral CI runners.

**Secrets management:**

- Store iOS signing certificates and provisioning profiles as base64-encoded CI secrets. Decode and install them into a temporary keychain before the build.
- Store the Android keystore file and its passwords as CI secrets. Reference them via environment variables in `build.gradle`.
- Both platforms benefit from caching dependency directories (CocoaPods for iOS, Gradle for Android) to speed up subsequent builds.

## Troubleshooting

**"Pod install failed"**

CocoaPods cannot resolve dependencies, often due to a stale spec repo. Run:

```bash
cd apps/app/ios/App && pod install --repo-update
```

If the issue persists, delete `Podfile.lock` and the `Pods/` directory, then run `pod install` again.

**"Android SDK not found"**

The build cannot locate the Android SDK. Set the `ANDROID_HOME` environment variable:

```bash
# macOS / Linux (add to ~/.zshrc or ~/.bashrc)
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/tools:$ANDROID_HOME/platform-tools:$PATH"
```

Then restart your terminal and retry the build.

**"Plugin build failed"**

One or more of the nine custom Capacitor plugin TypeScript sources failed to compile. Isolate the error by building plugins separately:

```bash
../../scripts/rt.sh run plugin:build
```

Review the TypeScript compiler output to identify which plugin has the error. Fix the TypeScript issue, then re-run the full build.

**"White screen on device"**

The native shell launched but no web content is visible. This usually means web assets were not synced to the native project. Run:

```bash
../../scripts/rt.sh run cap:sync
```

Then rebuild and re-run from the IDE. Also verify that the `server` override in `capacitor.config.ts` is removed if you previously used live reload.

**"Permission denied" on macOS**

macOS quarantine flags can prevent Xcode from accessing iOS project files downloaded or generated by tools. Clear them:

```bash
xattr -cr apps/app/ios/
```

Then re-open the workspace in Xcode.

## Related

- [Mobile App](/apps/mobile) — full platform configuration, plugin overview, and troubleshooting
- [Capacitor Plugins](/apps/mobile/capacitor-plugins) — custom plugin details and capability detection
- [Desktop App](/apps/desktop) — Electron build and auto-updater configuration
