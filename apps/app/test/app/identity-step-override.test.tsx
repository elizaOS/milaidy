// @vitest-environment jsdom

import { APP_EMOTE_EVENT } from "@elizaos/app-core/events";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CHARACTER_SELECTION_EMOTE_DELAY_MS,
  resolveCharacterSelectionEmote,
} from "../../src/character-selection-emotes";
import { CHARACTER_PRESET_META } from "../../src/components/CharacterRoster";

const { useAppMock, getVrmPreviewUrlMock, dispatchWindowEventMock } =
  vi.hoisted(() => ({
    useAppMock: vi.fn(),
    getVrmPreviewUrlMock: vi.fn((index: number) => `/vrms/${index}.png`),
    dispatchWindowEventMock: vi.fn(),
  }));

vi.mock("@elizaos/app-core/state", () => ({
  useApp: useAppMock,
  getVrmPreviewUrl: getVrmPreviewUrlMock,
}));

vi.mock("@elizaos/app-core/events", async () => {
  const actual = await vi.importActual<
    typeof import("@elizaos/app-core/events")
  >("@elizaos/app-core/events");
  return {
    ...actual,
    dispatchWindowEvent: dispatchWindowEventMock,
  };
});

import { IdentityStep } from "../../src/components/IdentityStep";

const PRESET_ENTRIES = Object.entries(CHARACTER_PRESET_META).map(
  ([catchphrase, meta]) => ({
    id: catchphrase,
    catchphrase,
    name: meta.name,
    avatarIndex: meta.avatarIndex,
  }),
);

describe("IdentityStep override", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    dispatchWindowEventMock.mockReset();
    useAppMock.mockReset();
  });

  it("plays a deterministic character-specific emote when users pick another preset", async () => {
    const setState = vi.fn();
    useAppMock.mockReturnValue({
      onboardingStyle: PRESET_ENTRIES[0]?.catchphrase ?? "",
      handleOnboardingNext: vi.fn(),
      setState,
      t: (key: string) => key,
    });

    let tree!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(IdentityStep));
    });

    const target = PRESET_ENTRIES[1];
    expect(target).toBeDefined();
    if (!target) {
      throw new Error("Expected a second preset entry");
    }

    const targetButton = tree.root.findByProps({
      "data-testid": `onboarding-preset-${target.catchphrase}`,
    });

    await act(async () => {
      targetButton.props.onClick();
    });

    expect(setState).toHaveBeenCalledWith(
      "onboardingStyle",
      target.catchphrase,
    );
    expect(setState).toHaveBeenCalledWith("onboardingName", target.name);
    expect(setState).toHaveBeenCalledWith(
      "selectedVrmIndex",
      target.avatarIndex,
    );

    expect(dispatchWindowEventMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(CHARACTER_SELECTION_EMOTE_DELAY_MS);
    });

    expect(dispatchWindowEventMock).toHaveBeenCalledWith(
      APP_EMOTE_EVENT,
      resolveCharacterSelectionEmote(target),
    );

    await act(async () => {
      tree.unmount();
    });

    vi.useRealTimers();
  });
});
