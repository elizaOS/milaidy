---
title: "Build Guide"
sidebarTitle: "Build Guide"
description: "Compile, sign, and distribute the Milaidy mobile app for iOS and Android."
---

The Milaidy mobile app (`apps/app`) is a Capacitor project that wraps the shared web UI in a native shell. Building it requires three steps: compiling the nine custom Capacitor plugins, bundling the Vite web assets, and syncing them into the native iOS or Android project. Distribution builds additionally require code signing — Apple certificates and provisioning profiles for iOS, a keystore for Android.

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

## Related

- [Mobile App](/apps/mobile) — full platform configuration, plugin overview, and troubleshooting
- [Capacitor Plugins](/apps/mobile/capacitor-plugins) — custom plugin details and capability detection
- [Desktop App](/apps/desktop) — Electron build and auto-updater configuration
