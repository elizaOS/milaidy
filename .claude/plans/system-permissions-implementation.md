# System Permissions Implementation Plan

## Executive Summary

Implement a comprehensive system permissions management system for Milady that enables full computer control capabilities (accessibility, browser automation, voice I/O, camera, shell access) with cross-platform support (macOS, Windows, Linux) and a guided onboarding/settings experience.

---

## 1. Current State Analysis

### 1.1 What Exists

**Capability Toggles (PluginsView.tsx:201-205)**
```typescript
const CAPABILITY_TOGGLE_IDS = [
  { id: "browser", label: "Browser" },
  { id: "vision", label: "Vision" },
  { id: "computeruse", label: "Computer Use" },
];
```
These toggle plugins on/off but don't check actual OS-level permissions.

**Onboarding (13 steps, no permissions)**
- welcome → name → avatar → style → theme → runMode → ...
- No step for system permissions setup
- Docker setup exists for sandbox mode, but no accessibility/camera/mic permissions

**Permission Handling (Limited)**
- Camera/Microphone: Web APIs only (`navigator.mediaDevices.getUserMedia`)
- iOS/Android: Native permission APIs (AVCaptureDevice, PHPhotoLibrary)
- Electron: Auto-approves media permissions in hidden windows
- **Missing**: macOS Accessibility, Screen Recording, Automation permissions

### 1.2 What's Missing

| Permission Type | macOS | Windows | Linux | Current Status |
|-----------------|-------|---------|-------|----------------|
| Accessibility (Computer Use) | System Prefs > Privacy > Accessibility | N/A (built-in) | N/A | NOT IMPLEMENTED |
| Screen Recording | System Prefs > Privacy > Screen Recording | N/A | N/A | NOT IMPLEMENTED |
| Microphone | System Prefs > Privacy > Microphone | Settings > Privacy | PulseAudio/pipewire | Web API only |
| Camera | System Prefs > Privacy > Camera | Settings > Privacy | v4l2 | Web API only |
| Automation (AppleScript) | System Prefs > Privacy > Automation | N/A | N/A | NOT IMPLEMENTED |
| Full Disk Access | System Prefs > Privacy > Full Disk Access | N/A | N/A | NOT IMPLEMENTED |

---

## 2. Architecture Design

### 2.1 System Permission Types

```typescript
// New file: src/permissions/types.ts

export type SystemPermissionId =
  | "accessibility"    // macOS: control mouse/keyboard, windows: built-in
  | "screen-recording" // macOS: capture screen content
  | "microphone"       // Audio input for STT
  | "camera"           // Video input for vision
  | "automation"       // macOS: AppleScript/System Events
  | "shell"            // Execute shell commands (implicit)
  | "full-disk"        // Optional: access all files
  ;

export type PermissionStatus =
  | "granted"          // Permission allowed
  | "denied"           // User explicitly denied
  | "not-determined"   // Never asked
  | "restricted"       // System policy prevents (MDM, parental)
  | "not-applicable"   // N/A on this platform
  ;

export interface SystemPermission {
  id: SystemPermissionId;
  name: string;
  description: string;
  required: boolean;        // Required for feature to work
  platforms: ("darwin" | "win32" | "linux")[];
  checkMethod: "native" | "electron" | "web";
}

export interface PermissionState {
  id: SystemPermissionId;
  status: PermissionStatus;
  lastChecked: number;      // Timestamp
  canRequest: boolean;      // Can programmatically request
  settingsPath?: string;    // How to open settings (macOS: tccutil, etc.)
}
```

### 2.2 Permission Registry

```typescript
// src/permissions/registry.ts

export const SYSTEM_PERMISSIONS: SystemPermission[] = [
  {
    id: "accessibility",
    name: "Accessibility",
    description: "Control mouse, keyboard, and interact with other apps",
    required: true,          // Required for Computer Use
    platforms: ["darwin"],   // macOS only, Windows has this built-in
    checkMethod: "native",
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    description: "Capture screen content for screenshots and screen sharing",
    required: true,          // Required for Vision/Computer Use
    platforms: ["darwin"],
    checkMethod: "native",
  },
  {
    id: "microphone",
    name: "Microphone",
    description: "Listen to voice commands and enable talk mode",
    required: false,         // Optional, for voice features
    platforms: ["darwin", "win32", "linux"],
    checkMethod: "web",      // Can use navigator.permissions.query
  },
  {
    id: "camera",
    name: "Camera",
    description: "Enable video input for vision capabilities",
    required: false,
    platforms: ["darwin", "win32", "linux"],
    checkMethod: "web",
  },
  {
    id: "automation",
    name: "Automation",
    description: "Control other applications via AppleScript",
    required: false,         // Optional, enhances Computer Use
    platforms: ["darwin"],
    checkMethod: "native",
  },
  {
    id: "shell",
    name: "Shell Access",
    description: "Execute terminal commands",
    required: false,         // Always available, but can be disabled
    platforms: ["darwin", "win32", "linux"],
    checkMethod: "native",
  },
];
```

### 2.3 Permission Checker Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Permission Manager (API)                      │
├─────────────────────────────────────────────────────────────────┤
│  checkPermission(id)    requestPermission(id)    openSettings() │
└───────────────────────────┬─────────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│  macOS Native │   │ Windows Native│   │  Linux Native │
│    Checker    │   │    Checker    │   │    Checker    │
├───────────────┤   ├───────────────┤   ├───────────────┤
│ - CGPreflightX│   │ - Privacy API │   │ - /dev checks │
│ - AXIsProc... │   │ - Registry    │   │ - D-Bus       │
│ - TCC Database│   │               │   │ - PipeWire    │
└───────────────┘   └───────────────┘   └───────────────┘
```

---

## 3. Implementation Plan

### Phase 1: Permission Detection Layer

**New Files:**
- `apps/app/electron/src/native/permissions.ts` - Main permission manager
- `apps/app/electron/src/native/permissions-darwin.ts` - macOS-specific
- `apps/app/electron/src/native/permissions-win32.ts` - Windows-specific
- `apps/app/electron/src/native/permissions-linux.ts` - Linux-specific
- `apps/app/plugins/permissions/` - Capacitor plugin for mobile

**macOS Implementation (Critical)**

```typescript
// permissions-darwin.ts

import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

/**
 * Check if Accessibility permission is granted.
 * Uses the Accessibility API AXIsProcessTrusted.
 */
export async function checkAccessibility(): Promise<PermissionStatus> {
  // Method 1: Use osascript to check
  try {
    const { stdout } = await execAsync(`
      osascript -e 'tell application "System Events" to return true'
    `);
    return stdout.trim() === "true" ? "granted" : "denied";
  } catch {
    return "denied";
  }
}

/**
 * Check Screen Recording permission.
 * Must attempt a screen capture to verify.
 */
export async function checkScreenRecording(): Promise<PermissionStatus> {
  // On macOS 10.15+, need to check TCC database or attempt capture
  try {
    const { stdout } = await execAsync(`
      sqlite3 ~/Library/Application\\ Support/com.apple.TCC/TCC.db \
        "SELECT allowed FROM access WHERE service='kTCCServiceScreenCapture' AND client='${process.execPath}'"
    `);
    return stdout.trim() === "1" ? "granted" : "denied";
  } catch {
    // TCC database not accessible - need to try actual capture
    return "not-determined";
  }
}

/**
 * Open System Preferences to the appropriate privacy pane.
 */
export async function openPrivacySettings(permission: SystemPermissionId): Promise<void> {
  const panes: Record<string, string> = {
    accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera",
    automation: "x-apple.systempreferences:com.apple.preference.security?Privacy_Automation",
    "full-disk": "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
  };

  const url = panes[permission];
  if (url) {
    await execAsync(`open "${url}"`);
  }
}
```

**Windows Implementation**

```typescript
// permissions-win32.ts

export async function checkAccessibility(): Promise<PermissionStatus> {
  // Windows doesn't require accessibility permission
  return "not-applicable";
}

export async function checkMicrophone(): Promise<PermissionStatus> {
  // Check Windows privacy settings via Registry or WinRT
  // HKCU\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone
  return "granted"; // Simplified - needs actual implementation
}

export async function openPrivacySettings(permission: SystemPermissionId): Promise<void> {
  const settings: Record<string, string> = {
    microphone: "ms-settings:privacy-microphone",
    camera: "ms-settings:privacy-webcam",
  };

  const url = settings[permission];
  if (url) {
    await execAsync(`start ${url}`);
  }
}
```

**Linux Implementation**

```typescript
// permissions-linux.ts

export async function checkMicrophone(): Promise<PermissionStatus> {
  // Check if PulseAudio/PipeWire can access microphone
  try {
    await execAsync("pactl info");
    return "granted";
  } catch {
    return "denied";
  }
}

export async function checkCamera(): Promise<PermissionStatus> {
  // Check /dev/video* access
  try {
    const { stdout } = await execAsync("ls /dev/video* 2>/dev/null");
    return stdout.trim() ? "granted" : "denied";
  } catch {
    return "denied";
  }
}
```

### Phase 2: Electron IPC Integration

**Add to `apps/app/electron/src/native/permissions.ts`**

```typescript
import { ipcMain, systemPreferences, shell } from "electron";
import * as darwin from "./permissions-darwin";
import * as win32 from "./permissions-win32";
import * as linux from "./permissions-linux";

const platform = process.platform;

export function registerPermissionsIPC(): void {
  // Check all permissions
  ipcMain.handle("permissions:getAll", async () => {
    const results: Record<string, PermissionState> = {};

    for (const perm of SYSTEM_PERMISSIONS) {
      if (!perm.platforms.includes(platform as any)) {
        results[perm.id] = {
          id: perm.id,
          status: "not-applicable",
          lastChecked: Date.now(),
          canRequest: false,
        };
        continue;
      }

      results[perm.id] = await checkPermission(perm.id);
    }

    return results;
  });

  // Check single permission
  ipcMain.handle("permissions:check", async (_e, id: SystemPermissionId) => {
    return checkPermission(id);
  });

  // Request permission (triggers system prompt where possible)
  ipcMain.handle("permissions:request", async (_e, id: SystemPermissionId) => {
    return requestPermission(id);
  });

  // Open system settings for permission
  ipcMain.handle("permissions:openSettings", async (_e, id: SystemPermissionId) => {
    if (platform === "darwin") {
      await darwin.openPrivacySettings(id);
    } else if (platform === "win32") {
      await win32.openPrivacySettings(id);
    }
    // Linux typically doesn't have a unified privacy settings
  });
}

async function checkPermission(id: SystemPermissionId): Promise<PermissionState> {
  let status: PermissionStatus = "not-determined";
  let canRequest = false;

  switch (id) {
    case "accessibility":
      if (platform === "darwin") {
        status = await darwin.checkAccessibility();
      } else {
        status = "not-applicable";
      }
      break;

    case "screen-recording":
      if (platform === "darwin") {
        status = await darwin.checkScreenRecording();
      } else {
        status = "not-applicable";
      }
      break;

    case "microphone":
      // Use Electron's built-in check
      if (platform === "darwin") {
        const mediaStatus = systemPreferences.getMediaAccessStatus("microphone");
        status = mediaStatus === "granted" ? "granted" :
                 mediaStatus === "denied" ? "denied" : "not-determined";
        canRequest = status === "not-determined";
      }
      break;

    case "camera":
      if (platform === "darwin") {
        const mediaStatus = systemPreferences.getMediaAccessStatus("camera");
        status = mediaStatus === "granted" ? "granted" :
                 mediaStatus === "denied" ? "denied" : "not-determined";
        canRequest = status === "not-determined";
      }
      break;
  }

  return {
    id,
    status,
    lastChecked: Date.now(),
    canRequest,
  };
}

async function requestPermission(id: SystemPermissionId): Promise<PermissionState> {
  if (platform === "darwin") {
    if (id === "microphone" || id === "camera") {
      const granted = await systemPreferences.askForMediaAccess(
        id === "microphone" ? "microphone" : "camera"
      );
      return {
        id,
        status: granted ? "granted" : "denied",
        lastChecked: Date.now(),
        canRequest: false,
      };
    }
  }

  // For permissions that can't be programmatically requested, open settings
  if (platform === "darwin") {
    await darwin.openPrivacySettings(id);
  }

  // Re-check after attempting
  return checkPermission(id);
}
```

### Phase 3: UI Components

**New File: `apps/app/src/components/PermissionsSection.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useApp } from "../AppContext";

interface PermissionState {
  id: string;
  status: "granted" | "denied" | "not-determined" | "restricted" | "not-applicable";
  canRequest: boolean;
}

const PERMISSION_INFO: Record<string, { name: string; description: string; icon: string }> = {
  accessibility: {
    name: "Accessibility",
    description: "Control mouse and keyboard for Computer Use",
    icon: "🖱️",
  },
  "screen-recording": {
    name: "Screen Recording",
    description: "Capture screen for vision and screenshots",
    icon: "📸",
  },
  microphone: {
    name: "Microphone",
    description: "Voice input for talk mode and speech recognition",
    icon: "🎤",
  },
  camera: {
    name: "Camera",
    description: "Video input for vision features",
    icon: "📷",
  },
  shell: {
    name: "Shell Access",
    description: "Execute terminal commands",
    icon: "💻",
  },
};

export function PermissionsSection() {
  const { client } = useApp();
  const [permissions, setPermissions] = useState<Record<string, PermissionState>>({});
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);

  useEffect(() => {
    loadPermissions();
  }, []);

  const loadPermissions = async () => {
    setLoading(true);
    try {
      const perms = await client.getSystemPermissions();
      setPermissions(perms);
    } catch (err) {
      console.error("Failed to load permissions:", err);
    }
    setLoading(false);
  };

  const handleRequest = async (id: string) => {
    setRequesting(id);
    try {
      const result = await client.requestPermission(id);
      setPermissions((prev) => ({ ...prev, [id]: result }));
    } finally {
      setRequesting(null);
    }
  };

  const handleOpenSettings = async (id: string) => {
    await client.openPermissionSettings(id);
  };

  const getStatusBadge = (status: PermissionState["status"]) => {
    const styles: Record<string, { bg: string; text: string; label: string }> = {
      granted: { bg: "bg-green-500/20", text: "text-green-500", label: "Granted" },
      denied: { bg: "bg-red-500/20", text: "text-red-500", label: "Denied" },
      "not-determined": { bg: "bg-yellow-500/20", text: "text-yellow-500", label: "Not Set" },
      restricted: { bg: "bg-gray-500/20", text: "text-gray-500", label: "Restricted" },
      "not-applicable": { bg: "bg-gray-500/20", text: "text-gray-400", label: "N/A" },
    };
    const s = styles[status] || styles["not-determined"];
    return (
      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded ${s.bg} ${s.text}`}>
        {s.label}
      </span>
    );
  };

  if (loading) {
    return <div className="text-sm text-muted">Loading permissions...</div>;
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-muted mb-2">
        System permissions required for full functionality. Click to configure.
      </div>

      {Object.entries(permissions)
        .filter(([_, state]) => state.status !== "not-applicable")
        .map(([id, state]) => {
          const info = PERMISSION_INFO[id];
          if (!info) return null;

          return (
            <div
              key={id}
              className="flex items-center justify-between p-3 border border-border bg-card hover:bg-bg-hover transition-colors"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg">{info.icon}</span>
                <div>
                  <div className="text-sm font-semibold">{info.name}</div>
                  <div className="text-xs text-muted">{info.description}</div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {getStatusBadge(state.status)}

                {state.status !== "granted" && state.status !== "not-applicable" && (
                  <button
                    className="px-3 py-1 text-xs font-semibold bg-accent text-accent-fg hover:opacity-90 transition-opacity"
                    onClick={() => state.canRequest ? handleRequest(id) : handleOpenSettings(id)}
                    disabled={requesting === id}
                  >
                    {requesting === id ? "..." : state.canRequest ? "Allow" : "Open Settings"}
                  </button>
                )}
              </div>
            </div>
          );
        })}

      <button
        className="w-full px-3 py-2 text-xs font-semibold border border-border hover:bg-bg-hover transition-colors"
        onClick={loadPermissions}
      >
        Refresh Permission Status
      </button>
    </div>
  );
}
```

### Phase 4: Onboarding Step

**Add new step to `apps/app/src/AppContext.tsx`**

```typescript
// Add to OnboardingStep type (line ~142)
export type OnboardingStep =
  | "welcome"
  | "name"
  | "avatar"
  | "style"
  | "theme"
  | "runMode"
  | "permissions"  // NEW
  | "dockerSetup"
  // ... rest
```

**Add step rendering to `OnboardingWizard.tsx`**

```tsx
case "permissions":
  return (
    <>
      <AgentImage />
      <SpeechBubble>
        I need a few system permissions to work properly. These let me control your computer,
        see your screen, and hear your voice when you want to talk.
      </SpeechBubble>

      <div className="space-y-4 w-full max-w-md">
        <PermissionsOnboardingSection
          onComplete={() => advanceOnboarding()}
          onSkip={() => advanceOnboarding()}
        />
      </div>
    </>
  );
```

**New Component: `PermissionsOnboardingSection.tsx`**

Shows essential permissions in a friendly onboarding format with:
- Visual indicators for each permission
- "Grant All" button for quick setup
- Platform-specific instructions
- Skip option for users who want to configure later

### Phase 5: Settings Integration

**Add to `SettingsView.tsx` after Media Generation section:**

```tsx
{/* System Permissions */}
<div className="mt-6 p-4 border border-[var(--border)] bg-[var(--card)]">
  <div className="font-bold text-sm mb-4">System Permissions</div>
  <PermissionsSection />
</div>
```

### Phase 6: Feature Gating

Update capability toggles to respect permission status:

```typescript
// In PluginsView.tsx, enhance CapabilityToggles

function CapabilityToggles() {
  const { plugins, handlePluginToggle, permissions } = useApp();

  const capabilities = useMemo(() =>
    CAPABILITY_TOGGLE_IDS.map((cap) => {
      const requiredPerms = getRequiredPermissions(cap.id);
      const allGranted = requiredPerms.every(
        (p) => permissions[p]?.status === "granted" || permissions[p]?.status === "not-applicable"
      );

      return {
        ...cap,
        plugin: plugins.find((p) => p.id === cap.id) ?? null,
        permissionsGranted: allGranted,
        missingPermissions: requiredPerms.filter(
          (p) => permissions[p]?.status !== "granted" && permissions[p]?.status !== "not-applicable"
        ),
      };
    }),
    [plugins, permissions]
  );

  // Show warning if enabling a capability without required permissions
  // ...
}

function getRequiredPermissions(capabilityId: string): SystemPermissionId[] {
  switch (capabilityId) {
    case "computeruse":
      return ["accessibility", "screen-recording"];
    case "vision":
      return ["camera", "screen-recording"];
    case "browser":
      return ["accessibility"];
    default:
      return [];
  }
}
```

---

## 4. API Endpoints

**New API routes in `src/api/server.ts`**

```typescript
// GET /api/permissions
// Returns all system permission states

// POST /api/permissions/:id/request
// Attempts to request a specific permission

// POST /api/permissions/:id/open-settings
// Opens the system settings for a specific permission

// GET /api/permissions/:id/check
// Re-checks a specific permission status
```

---

## 5. Data Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Settings   │────▶│  API Client │────▶│   API Server    │
│  View       │     │             │     │                 │
└─────────────┘     └─────────────┘     └────────┬────────┘
                                                  │
                                                  ▼
                                        ┌─────────────────┐
                                        │  Permission     │
                                        │  Manager        │
                                        └────────┬────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
          ┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
          │  macOS Native   │           │  Windows Native │           │  Linux Native   │
          │  Permissions    │           │  Permissions    │           │  Permissions    │
          └─────────────────┘           └─────────────────┘           └─────────────────┘
```

---

## 6. Platform-Specific Details

### 6.1 macOS Permissions (Most Complex)

| Permission | Check Method | Request Method | Settings URL |
|------------|--------------|----------------|--------------|
| Accessibility | `AXIsProcessTrusted()` via osascript | Cannot request; must open settings | `Privacy_Accessibility` |
| Screen Recording | TCC.db query or test capture | Cannot request; must open settings | `Privacy_ScreenCapture` |
| Microphone | `systemPreferences.getMediaAccessStatus()` | `systemPreferences.askForMediaAccess()` | `Privacy_Microphone` |
| Camera | `systemPreferences.getMediaAccessStatus()` | `systemPreferences.askForMediaAccess()` | `Privacy_Camera` |
| Automation | Test osascript call | Cannot request; must open settings | `Privacy_Automation` |

**macOS Caveats:**
- Accessibility and Screen Recording cannot be granted programmatically
- App must be in the list and checked in System Preferences
- TCC.db is protected and may not be queryable
- May need to test actual functionality to determine status

### 6.2 Windows Permissions

| Permission | Check Method | Request Method |
|------------|--------------|----------------|
| Microphone | Registry/WinRT | System prompt |
| Camera | Registry/WinRT | System prompt |
| Accessibility | N/A (built-in) | N/A |
| Screen Recording | N/A | N/A |

### 6.3 Linux Permissions

| Permission | Check Method | Request Method |
|------------|--------------|----------------|
| Microphone | PulseAudio/PipeWire | Portal API or prompt |
| Camera | /dev/video* access | Group membership |
| Accessibility | N/A | N/A |
| Screen Recording | Wayland portal | Portal prompt |

---

## 7. Testing Strategy

### 7.1 Unit Tests

```typescript
// test/permissions/permissions-darwin.test.ts
describe("macOS Permissions", () => {
  test("checkAccessibility returns correct status", async () => {
    // Mock osascript execution
  });

  test("openPrivacySettings opens correct pane", async () => {
    // Mock shell.openExternal
  });
});
```

### 7.2 E2E Tests

```typescript
// test/permissions.e2e.test.ts
describe("Permissions E2E", () => {
  test("GET /api/permissions returns all permission states", async () => {
    const res = await fetch(`${BASE_URL}/api/permissions`);
    const perms = await res.json();
    expect(perms.microphone).toBeDefined();
    expect(perms.microphone.status).toMatch(/granted|denied|not-determined|not-applicable/);
  });
});
```

---

## 8. Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| TCC database not accessible | Can't determine permission status | Fall back to testing actual functionality |
| App signature changes | Permissions reset | Document for users; show migration notice |
| macOS version differences | API changes | Test on 10.15, 11, 12, 13, 14 |
| User denies permissions | Features don't work | Clear UI showing which features need which permissions |
| Electron security restrictions | Can't check some permissions | Use native Node modules where needed |

---

## 9. Dependencies

**New packages needed:**

```json
{
  "node-mac-permissions": "^2.3.0"  // Native macOS permission checks
}
```

Or implement via `osascript`/`sqlite3` shell commands (no new dependencies).

---

## 10. Implementation Order

1. **Phase 1**: Permission detection utilities (2-3 files, platform-specific)
2. **Phase 2**: Electron IPC integration (register handlers)
3. **Phase 3**: API endpoints (server routes)
4. **Phase 4**: UI components (PermissionsSection)
5. **Phase 5**: Settings integration (add to SettingsView)
6. **Phase 6**: Onboarding step (add permissions step)
7. **Phase 7**: Feature gating (connect to capability toggles)
8. **Phase 8**: Testing (unit + e2e tests)

---

## 11. Open Questions

1. **Should shell access be toggleable?** Currently always on via `@elizaos/plugin-shell`. Should we add a UI toggle?

2. **Permission persistence**: Should we cache permission states, or always check live?

3. **First-run behavior**: Should we show the permissions step only on first run, or always when permissions are missing?

4. **Electron vs Web**: The app also runs in browser. Should we show a "desktop app required" message for permissions that need native access?

5. **Linux desktop environments**: Wayland vs X11 have different permission models. How much should we support?

---

## 12. Success Criteria

- [ ] All permissions accurately detected on macOS, Windows, Linux
- [ ] Clear UI showing status of each permission
- [ ] One-click path to grant each permission (open settings)
- [ ] Onboarding guides users through permission setup
- [ ] Features gracefully degrade when permissions missing
- [ ] No false positives (showing "granted" when actually denied)
- [ ] Works across Electron and Capacitor (iOS/Android)
