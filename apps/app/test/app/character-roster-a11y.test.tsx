// @vitest-environment jsdom

/**
 * P10-02 regression test: CharacterRoster selection buttons must have
 * aria-label and aria-pressed attributes for screen reader accessibility.
 *
 * See issue #1172 — UX Persona Audit.
 */

import TestRenderer, { act } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

vi.mock("@miladyai/app-core/state", () => ({
  getVrmPreviewUrl: (index: number) => `/avatars/preview-${index}.png`,
}));

// Stub out the onboarding-presets to avoid pulling in the full preset data
vi.mock("@miladyai/app-core/onboarding-presets", () => ({
  CHARACTER_PRESET_META: {
    chaotic: {
      name: "Chen",
      avatarIndex: 1,
      catchphrase: "chaotic",
      voicePresetId: undefined,
    },
    calm: {
      name: "Luna",
      avatarIndex: 2,
      catchphrase: "calm",
      voicePresetId: undefined,
    },
  },
}));

import {
  CharacterRoster,
  type CharacterRosterEntry,
} from "@miladyai/app-core/src/components/CharacterRoster";

const ENTRIES: CharacterRosterEntry[] = [
  {
    id: "chaotic",
    name: "Chen",
    avatarIndex: 1,
    catchphrase: "chaotic",
    preset: {},
  },
  {
    id: "calm",
    name: "Luna",
    avatarIndex: 2,
    catchphrase: "calm",
    preset: {},
  },
];

describe("CharacterRoster — accessibility attributes (P10-02)", () => {
  it("renders a button for each entry", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={ENTRIES}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    expect(buttons).toHaveLength(2);
  });

  it("each button has an aria-label containing the character name", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={ENTRIES}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    for (const button of buttons) {
      const label = button.props["aria-label"] as string | undefined;
      expect(typeof label).toBe("string");
      if (typeof label !== "string") {
        throw new Error("expected aria-label to be a string");
      }
      expect(label.length).toBeGreaterThan(0);
    }

    const labels = buttons.map((b) => b.props["aria-label"] as string);
    expect(labels.some((l) => l.includes("Chen"))).toBe(true);
    expect(labels.some((l) => l.includes("Luna"))).toBe(true);
  });

  it("aria-label includes the character catchphrase when present", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={ENTRIES}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    const chenButton = buttons.find((b) =>
      (b.props["aria-label"] as string).includes("Chen"),
    );
    expect(chenButton).toBeDefined();
    if (!chenButton) {
      throw new Error("expected Chen button to exist");
    }
    expect(chenButton.props["aria-label"]).toContain("chaotic");
  });

  it("unselected buttons have aria-pressed=false", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={ENTRIES}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    for (const button of buttons) {
      expect(button.props["aria-pressed"]).toBe(false);
    }
  });

  it("selected button has aria-pressed=true, others have aria-pressed=false", () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={ENTRIES}
          selectedId="chaotic"
          onSelect={() => {}}
        />,
      );
    });

    const buttons = renderer.root.findAllByType("button");
    const chenButton = buttons.find((b) =>
      (b.props["aria-label"] as string).includes("Chen"),
    );
    const lunaButton = buttons.find((b) =>
      (b.props["aria-label"] as string).includes("Luna"),
    );

    expect(chenButton).toBeDefined();
    expect(lunaButton).toBeDefined();
    if (!chenButton || !lunaButton) {
      throw new Error("expected both Chen and Luna buttons to exist");
    }

    expect(chenButton.props["aria-pressed"]).toBe(true);
    expect(lunaButton.props["aria-pressed"]).toBe(false);
  });

  it("button without catchphrase still has a valid aria-label", () => {
    const entries: CharacterRosterEntry[] = [
      {
        id: "no-catchphrase",
        name: "Momo",
        avatarIndex: 3,
        catchphrase: "",
        preset: {},
      },
    ];
    let renderer!: TestRenderer.ReactTestRenderer;
    act(() => {
      renderer = TestRenderer.create(
        <CharacterRoster
          entries={entries}
          selectedId={null}
          onSelect={() => {}}
        />,
      );
    });

    const [button] = renderer.root.findAllByType("button");
    const label = button.props["aria-label"] as string;
    expect(label).toContain("Momo");
  });
});
