declare module "@milaidy/capacitor-agent" {
  export * from "../plugins/agent/src/definitions";
  import type { AgentPlugin as AgentPluginType } from "../plugins/agent/src/definitions";
  export type { AgentPlugin } from "../plugins/agent/src/definitions";
  export const Agent: AgentPluginType;
}

declare module "@milaidy/capacitor-camera" {
  export * from "../plugins/camera/src/definitions";
  import type { CameraPlugin as CameraPluginType } from "../plugins/camera/src/definitions";
  export type { CameraPlugin } from "../plugins/camera/src/definitions";
  export const Camera: CameraPluginType;
}

declare module "@milaidy/capacitor-canvas" {
  export * from "../plugins/canvas/src/definitions";
  import type { CanvasPlugin as CanvasPluginType } from "../plugins/canvas/src/definitions";
  export type { CanvasPlugin } from "../plugins/canvas/src/definitions";
  export const Canvas: CanvasPluginType;
}

declare module "@milaidy/capacitor-desktop" {
  export * from "../plugins/desktop/src/definitions";
  import type { DesktopPlugin as DesktopPluginType } from "../plugins/desktop/src/definitions";
  export type { DesktopPlugin } from "../plugins/desktop/src/definitions";
  export const Desktop: DesktopPluginType;
}

declare module "@milaidy/capacitor-gateway" {
  export * from "../plugins/gateway/src/definitions";
  import type { GatewayPlugin as GatewayPluginType } from "../plugins/gateway/src/definitions";
  export type { GatewayPlugin } from "../plugins/gateway/src/definitions";
  export const Gateway: GatewayPluginType;
}

declare module "@milaidy/capacitor-location" {
  export * from "../plugins/location/src/definitions";
  import type { LocationPlugin as LocationPluginType } from "../plugins/location/src/definitions";
  export type { LocationPlugin } from "../plugins/location/src/definitions";
  export const Location: LocationPluginType;
}

declare module "@milaidy/capacitor-screencapture" {
  export * from "../plugins/screencapture/src/definitions";
  import type { ScreenCapturePlugin as ScreenCapturePluginType } from "../plugins/screencapture/src/definitions";
  export type { ScreenCapturePlugin } from "../plugins/screencapture/src/definitions";
  export const ScreenCapture: ScreenCapturePluginType;
}

declare module "@milaidy/capacitor-swabble" {
  export * from "../plugins/swabble/src/definitions";
  import type { SwabblePlugin as SwabblePluginType } from "../plugins/swabble/src/definitions";
  export type { SwabblePlugin } from "../plugins/swabble/src/definitions";
  export const Swabble: SwabblePluginType;
}

declare module "@milaidy/capacitor-talkmode" {
  export * from "../plugins/talkmode/src/definitions";
  import type { TalkModePlugin as TalkModePluginType } from "../plugins/talkmode/src/definitions";
  export type { TalkModePlugin } from "../plugins/talkmode/src/definitions";
  export const TalkMode: TalkModePluginType;
}
