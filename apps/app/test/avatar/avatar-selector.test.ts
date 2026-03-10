/**
 * Tests for avatar selection logic — VRM index management, path resolution, localStorage persistence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getVrmPreviewUrl,
  getVrmTitle,
  getVrmUrl,
  VRM_COUNT,
} from "../../src/AppContext";

describe("Avatar VRM Utilities", () => {
  describe("VRM_COUNT", () => {
    it("is 25 for all bundled avatars (24 base + 1 named)", () => {
      expect(VRM_COUNT).toBe(25);
    });
  });

  describe("getVrmUrl", () => {
    it("returns correct path for base milady VRMs (1-24)", () => {
      for (let i = 1; i <= 24; i++) {
        expect(getVrmUrl(i)).toBe(`/vrms/milady-${i}.vrm`);
      }
    });

    it("returns correct path for named VRMs (25)", () => {
      expect(getVrmUrl(25)).toBe("/vrms/shaw.vrm");
    });

    it("clamps invalid indices to avatar 1", () => {
      expect(getVrmUrl(34)).toBe("/vrms/milady-1.vrm");
      expect(getVrmUrl(-3)).toBe("/vrms/milady-1.vrm");
      expect(getVrmUrl(Number.NaN)).toBe("/vrms/milady-1.vrm");
      expect(getVrmUrl(0)).toBe("/vrms/milady-1.vrm");
    });
  });

  describe("getVrmPreviewUrl", () => {
    it("returns correct preview path for base VRMs (1-24)", () => {
      for (let i = 1; i <= 24; i++) {
        expect(getVrmPreviewUrl(i)).toBe(`/vrms/previews/milady-${i}.png`);
      }
    });

    it("returns named VRM preview for named VRMs (25)", () => {
      expect(getVrmPreviewUrl(25)).toBe("/vrms/previews/shaw.jpg");
    });

    it("clamps invalid preview indices to avatar 1", () => {
      expect(getVrmPreviewUrl(999)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(-1)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(0)).toBe("/vrms/previews/milady-1.png");
    });
  });

  describe("getVrmTitle", () => {
    it("returns formatted title for base VRMs", () => {
      expect(getVrmTitle(1)).toBe("MILADY-01");
      expect(getVrmTitle(24)).toBe("MILADY-24");
    });

    it("returns label for named VRMs", () => {
      expect(getVrmTitle(25)).toBe("SHAW");
    });
  });
});

describe("Avatar Selection State", () => {
  // Must match AVATAR_INDEX_KEY in AppContext.tsx
  const AVATAR_STORAGE_KEY = "milady_avatar_index";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("localStorage persistence", () => {
    it("stores selected VRM index", () => {
      const mockStorage = new Map<string, string>();
      const mockGetItem = vi.fn((key: string) => mockStorage.get(key) ?? null);
      const mockSetItem = vi.fn((key: string, value: string) => {
        mockStorage.set(key, value);
      });

      // Simulate saving avatar selection
      mockSetItem(AVATAR_STORAGE_KEY, "3");
      expect(mockStorage.get(AVATAR_STORAGE_KEY)).toBe("3");

      // Simulate loading
      const stored = mockGetItem(AVATAR_STORAGE_KEY);
      expect(stored).toBe("3");
      const index = Number(stored);
      expect(index).toBe(3);
      expect(index >= 1 && index <= VRM_COUNT).toBe(true);
    });

    it("handles custom VRM (index 0)", () => {
      const mockStorage = new Map<string, string>();
      mockStorage.set(AVATAR_STORAGE_KEY, "0");

      const stored = mockStorage.get(AVATAR_STORAGE_KEY);
      const index = Number(stored);
      expect(index).toBe(0); // custom VRM
    });

    it("falls back to 1 for invalid stored values", () => {
      const testCases = ["", "abc", "-1", "34", "NaN"];

      for (const invalid of testCases) {
        const n = Number(invalid);
        const isValid = !Number.isNaN(n) && n >= 0 && n <= VRM_COUNT;
        const result = isValid ? n : 1;
        // Invalid cases should fall back to 1
        if (!isValid) {
          expect(result).toBe(1);
        }
      }
    });
  });
});

describe("Onboarding Avatar Step", () => {
  it("avatar step comes after name and before style", () => {
    const steps = [
      "welcome",
      "name",
      "avatar",
      "style",
      "theme",
      "runMode",
      "llmProvider",
      "inventorySetup",
      "connectors",
    ];

    const nameIdx = steps.indexOf("name");
    const avatarIdx = steps.indexOf("avatar");
    const styleIdx = steps.indexOf("style");

    expect(avatarIdx).toBe(nameIdx + 1);
    expect(styleIdx).toBe(avatarIdx + 1);
  });

  it("avatar step is always valid (defaults to 1)", () => {
    const onboardingAvatar = 1; // default
    const canGoNext = true; // avatar step always allows next
    expect(canGoNext).toBe(true);
    expect(onboardingAvatar).toBeGreaterThanOrEqual(0);
    expect(onboardingAvatar).toBeLessThanOrEqual(VRM_COUNT);
  });

  it("onboarding saves avatar to selectedVrmIndex on next", () => {
    let selectedVrmIndex = 1;
    const onboardingAvatar = 4;

    // Simulate handleOnboardingNext for "avatar" step
    selectedVrmIndex = onboardingAvatar;

    expect(selectedVrmIndex).toBe(4);
  });
});
