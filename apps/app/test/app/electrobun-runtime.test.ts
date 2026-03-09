// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";

import {
  getBackendStartupTimeoutMs,
  isElectrobunRuntime,
} from "../../src/bridge/electrobun-runtime";

describe("electrobun runtime helpers", () => {
  afterEach(() => {
    delete (
      window as typeof window & {
        __electrobunWindowId?: number;
        __electrobunWebviewId?: number;
      }
    ).__electrobunWindowId;
    delete (
      window as typeof window & {
        __electrobunWindowId?: number;
        __electrobunWebviewId?: number;
      }
    ).__electrobunWebviewId;
  });

  it("uses the default backend timeout outside Electrobun", () => {
    expect(isElectrobunRuntime()).toBe(false);
    expect(getBackendStartupTimeoutMs()).toBe(30_000);
  });

  it("extends the backend timeout inside Electrobun windows", () => {
    (
      window as typeof window & {
        __electrobunWindowId?: number;
      }
    ).__electrobunWindowId = 7;

    expect(isElectrobunRuntime()).toBe(true);
    expect(getBackendStartupTimeoutMs()).toBe(180_000);
  });

  it("detects Electrobun webviews", () => {
    (
      window as typeof window & {
        __electrobunWebviewId?: number;
      }
    ).__electrobunWebviewId = 11;

    expect(isElectrobunRuntime()).toBe(true);
  });
});
