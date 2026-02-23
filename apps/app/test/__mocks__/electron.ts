import { vi } from "vitest";

export const shell = {
  openExternal: vi.fn(),
};

export const desktopCapturer = {
  getSources: vi.fn(),
};

export const systemPreferences = {
  getMediaAccessStatus: vi.fn(),
  askForMediaAccess: vi.fn(),
};

export const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(),
  send: vi.fn(),
  sendSync: vi.fn(),
};

export default {
  shell,
  desktopCapturer,
  systemPreferences,
  ipcRenderer,
};
