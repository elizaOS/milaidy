// @vitest-environment jsdom

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  clientMock,
  dispatchWindowEventMock,
  useAppMock,
  audioConstructorMock,
} = vi.hoisted(() => ({
  clientMock: {
    generateCharacterField: vi.fn(),
    getConfig: vi.fn(),
    streamVoiceSpeak: vi.fn(),
    updateConfig: vi.fn(),
  },
  dispatchWindowEventMock: vi.fn(),
  useAppMock: vi.fn(),
  audioConstructorMock: vi.fn(),
}));

vi.mock("@miladyai/app-core/api", () => ({
  client: clientMock,
}));

vi.mock("@miladyai/app-core/events", () => ({
  APP_EMOTE_EVENT: "app:emote",
  VOICE_CONFIG_UPDATED_EVENT: "voice-config-updated",
  VRM_TELEPORT_COMPLETE_EVENT: "vrm:teleport-complete",
  dispatchWindowEvent: dispatchWindowEventMock,
}));

vi.mock("@miladyai/app-core/state", () => ({
  useApp: useAppMock,
  CUSTOM_ONBOARDING_STEPS: [],
  getVrmPreviewUrl: (index: number) => `/avatars/preview-${index}.png`,
}));

vi.mock("@miladyai/app-core/voice", () => ({
  PREMADE_VOICES: [
    {
      id: "voice-preset-1",
      name: "Preview Voice",
      gender: "female",
      voiceId: "voice-123",
      previewUrl: "https://cdn.example.com/preview.mp3",
    },
  ],
  EDGE_BACKUP_VOICES: [],
  sanitizeApiKey: (value: string | undefined) => value?.trim() ?? "",
}));

vi.mock("@miladyai/ui", () => {
  const React = require("react") as typeof import("react");

  return {
    Button: ({
      children,
      ...props
    }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement("button", props, children),
    Input: (props: React.InputHTMLAttributes<HTMLInputElement>) =>
      React.createElement("input", props),
    Textarea: (props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) =>
      React.createElement("textarea", props),
    ThemedSelect: ({
      groups,
      onChange,
      value,
      ...props
    }: {
      groups: Array<{ items: Array<{ id: string; text: string }> }>;
      onChange: (value: string) => void;
      value: string | null;
    }) =>
      React.createElement(
        "select",
        {
          ...props,
          onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
            onChange(event.target.value),
          value: value ?? "",
        },
        groups.flatMap((group) =>
          group.items.map((item) =>
            React.createElement(
              "option",
              { key: item.id, value: item.id },
              item.text,
            ),
          ),
        ),
      ),
  };
});

vi.mock("@miladyai/app-core/components", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@miladyai/app-core/components")>();
  const ReactMock = await import("react");

  return {
    ...actual,
    CharacterRoster: () =>
      ReactMock.createElement("div", { "data-testid": "character-roster" }),
    resolveRosterEntries: () => [
      {
        id: "chen",
        name: "Chen",
        avatarIndex: 1,
        catchphrase: "chaotic",
        preset: {
          bio: ["bio"],
          system: "You are {{name}}",
          adjectives: ["curious"],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      },
    ],
  };
});

import { CharacterEditor } from "@miladyai/app-core/components";

function createAppState() {
  return {
    tab: "character",
    setTab: vi.fn(),
    characterData: { name: "Chen" },
    characterDraft: {
      name: "Chen",
      bio: "bio",
      system: "system",
      style: { all: [], chat: [], post: [] },
      messageExamples: [],
      postExamples: [],
      adjectives: [],
    },
    characterLoading: false,
    characterSaving: false,
    characterSaveSuccess: null,
    characterSaveError: null,
    handleCharacterFieldInput: vi.fn(),
    handleCharacterArrayInput: vi.fn(),
    handleCharacterStyleInput: vi.fn(),
    handleSaveCharacter: vi.fn(),
    loadCharacter: vi.fn(async () => {}),
    setState: vi.fn(),
    onboardingOptions: {
      styles: [
        {
          catchphrase: "chaotic",
          bio: ["bio"],
          system: "You are {{name}}",
          adjectives: ["curious"],
          style: { all: [], chat: [], post: [] },
          messageExamples: [],
          postExamples: [],
        },
      ],
    },
    selectedVrmIndex: 0,
    t: vi.fn(
      (value: string, options?: { defaultValue?: string }) =>
        options?.defaultValue ?? value,
    ),
    registryStatus: null,
    registryLoading: false,
    registryRegistering: false,
    registryError: null,
    dropStatus: null,
    loadRegistryStatus: vi.fn(async () => {}),
    registerOnChain: vi.fn(async () => {}),
    syncRegistryProfile: vi.fn(async () => {}),
    loadDropStatus: vi.fn(async () => {}),
    walletConfig: null,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("CharacterEditor regressions", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    clientMock.generateCharacterField.mockReset();
    clientMock.getConfig.mockReset();
    clientMock.streamVoiceSpeak.mockReset();
    clientMock.updateConfig.mockReset();
    dispatchWindowEventMock.mockReset();
    useAppMock.mockReset();
    audioConstructorMock.mockReset();

    useAppMock.mockReturnValue(createAppState());
    clientMock.getConfig.mockResolvedValue({
      messages: {
        tts: {
          elevenlabs: {
            voiceId: "voice-123",
          },
        },
      },
    });
    clientMock.streamVoiceSpeak.mockResolvedValue(undefined);
    clientMock.updateConfig.mockResolvedValue(undefined);

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: audioConstructorMock,
    });
  });

  it("surfaces generation errors instead of failing silently", async () => {
    clientMock.generateCharacterField.mockRejectedValue(
      new Error("Generation exploded"),
    );

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CharacterEditor));
    });

    await flushEffects();
    expect(tree).not.toBeNull();
    if (!tree) {
      throw new Error("expected CharacterEditor to render");
    }

    const customizeBtn = tree.root.find(
      (node) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("charactereditor.CustomizeBtn"),
    );
    await act(async () => {
      customizeBtn.props.onClick();
    });
    await flushEffects();

    const regenerateButtons = tree.root.findAll(
      (node) =>
        node.type === "button" &&
        node.props.className &&
        typeof node.props.className === "string" &&
        node.props.className.includes("ce-regen-btn"),
    );
    const regenerateButton = regenerateButtons[0];
    expect(regenerateButton).toBeDefined();
    if (!regenerateButton) {
      throw new Error("expected a regenerate button");
    }

    await act(async () => {
      await regenerateButton.props.onClick();
    });
    await flushEffects();

    expect(clientMock.generateCharacterField).toHaveBeenCalled();
    expect(JSON.stringify(tree.toJSON())).toContain("Generation exploded");
  });

  it("uses cached preview audio instead of triggering TTS generation", async () => {
    let createdAudio: {
      currentTime: number;
      onended: (() => void) | undefined;
      onerror: (() => void) | undefined;
      pause: ReturnType<typeof vi.fn>;
      play: ReturnType<typeof vi.fn>;
    } | null = null;

    Object.defineProperty(globalThis, "Audio", {
      configurable: true,
      value: class MockAudio {
        currentTime = 0;
        onended: (() => void) | undefined;
        onerror: (() => void) | undefined;
        pause = vi.fn();
        play = vi.fn(() => Promise.resolve());

        constructor(url: string) {
          audioConstructorMock(url);
          createdAudio = this;
        }
      },
    });

    let tree: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(CharacterEditor));
    });

    await flushEffects();
    expect(tree).not.toBeNull();
    if (!tree) {
      throw new Error("expected CharacterEditor to render");
    }

    const customizeBtn = tree.root.find(
      (node) =>
        node.type === "button" &&
        Array.isArray(node.children) &&
        node.children.includes("charactereditor.CustomizeBtn"),
    );
    await act(async () => {
      customizeBtn.props.onClick();
    });
    await flushEffects();

    // Character auto-selection speaks the catchphrase on mount; this test only
    // verifies the dedicated preview button path.
    clientMock.streamVoiceSpeak.mockClear();

    const previewButton = tree.root.find(
      (node) =>
        node.type === "button" && node.props["aria-label"] === "Preview voice",
    );

    await act(async () => {
      previewButton.props.onClick();
    });
    await flushEffects();

    expect(audioConstructorMock).toHaveBeenCalledWith(
      "https://cdn.example.com/preview.mp3",
    );
    expect(createdAudio).not.toBeNull();
    if (!createdAudio) {
      throw new Error("expected preview audio to be created");
    }

    expect(createdAudio.play).toHaveBeenCalled();
    expect(clientMock.streamVoiceSpeak).not.toHaveBeenCalled();
    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"] === "Stop voice preview",
      ),
    ).toHaveLength(1);

    await act(async () => {
      createdAudio.onended?.();
    });
    await flushEffects();

    expect(
      tree.root.findAll(
        (node) =>
          node.type === "button" &&
          node.props["aria-label"] === "Preview voice",
      ),
    ).toHaveLength(1);
  });
});
