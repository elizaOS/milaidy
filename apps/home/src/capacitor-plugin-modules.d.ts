/**
 * Type augmentation for Capacitor plugin modules used by Eliza Home.
 *
 * Only the agent and desktop plugins are needed for the chat-only app.
 */

declare module "@miladyai/capacitor-agent" {
  export * from "../../../apps/app/plugins/agent/src/definitions";
}

declare module "@miladyai/capacitor-desktop" {
  export * from "../../../apps/app/plugins/desktop/src/definitions";
}
