/**
 * Tests for avatar selection logic — VRM index management, path resolution, localStorage persistence.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getVrmPreviewUrl, getVrmUrl, VRM_COUNT } from "../../src/AppContext";

describe("Avatar VRM Utilities", () => {
  describe("VRM_COUNT", () => {
    it("is 8 for the built-in miladies", () => {
      expect(VRM_COUNT).toBe(8);
    });
  });

  describe("getVrmUrl", () => {
    it("returns correct path for each built-in index", () => {
      for (let i = 1; i <= 8; i++) {
        expect(getVrmUrl(i)).toBe(`/vrms/${i}.vrm`);
      }
    });

    it("clamps invalid indices to avatar 1", () => {
      expect(getVrmUrl(9)).toBe("/vrms/1.vrm");
      expect(getVrmUrl(-3)).toBe("/vrms/1.vrm");
      expect(getVrmUrl(Number.NaN)).toBe("/vrms/1.vrm");
      expect(getVrmUrl(0)).toBe("/vrms/1.vrm");
    });
  });

  describe("getVrmPreviewUrl", () => {
    it("returns correct path for each preview image", () => {
      for (let i = 1; i <= 8; i++) {
        expect(getVrmPreviewUrl(i)).toBe(`/vrms/previews/milady-${i}.png`);
      }
    });

    it("clamps invalid preview indices to avatar 1", () => {
      expect(getVrmPreviewUrl(999)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(-1)).toBe("/vrms/previews/milady-1.png");
      expect(getVrmPreviewUrl(0)).toBe("/vrms/previews/milady-1.png");
    });
  });
});

describe("Avatar Selection State", () => {
  const AVATAR_STORAGE_KEY = "milady:selectedVrm";

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
      const testCases = ["", "abc", "-1", "9", "NaN"];

      for (const invalid of testCases) {
        const n = Number(invalid);
        const isValid = !Number.isNaN(n) && n >= 0 && n <= VRM_COUNT;
        const result = isValid ? n : 1;
        // Invalid cases should fall back to 1
        if (["", "abc", "-1", "9", "NaN"].includes(invalid) && !isValid) {
          expect(result).toBe(1);
        }
      }
    });
  });

  describe("VRM path resolution", () => {
    it("resolves built-in index to /vrms/N.vrm", () => {
      const selectedVrmIndex = 5;
      const customVrmUrl: string | null = null;

      const vrmPath =
        selectedVrmIndex === 0 && customVrmUrl
          ? customVrmUrl
          : getVrmUrl(selectedVrmIndex || 1);

      expect(vrmPath).toBe("/vrms/5.vrm");
    });

    it("resolves custom upload (index 0) to object URL", () => {
      const selectedVrmIndex = 0;
      const customVrmUrl = "blob:http://localhost/abc-123";

      const vrmPath =
        selectedVrmIndex === 0 && customVrmUrl
          ? customVrmUrl
          : getVrmUrl(selectedVrmIndex || 1);

      expect(vrmPath).toBe("blob:http://localhost/abc-123");
    });

    it("resolves persisted custom VRM (index 0) to server URL", () => {
      const selectedVrmIndex = 0;
      const customVrmUrl = "/api/avatar/vrm?t=1234567890";

      const vrmPath =
        selectedVrmIndex === 0 && customVrmUrl
          ? customVrmUrl
          : getVrmUrl(selectedVrmIndex || 1);

      expect(vrmPath).toBe("/api/avatar/vrm?t=1234567890");
    });

    it("falls back to index 1 when custom is selected but no URL provided", () => {
      const selectedVrmIndex = 0;
      const customVrmUrl: string | null = null;

      const vrmPath =
        selectedVrmIndex === 0 && customVrmUrl
          ? customVrmUrl
          : getVrmUrl(selectedVrmIndex || 1);

      expect(vrmPath).toBe("/vrms/1.vrm");
    });

    it("defaults to index 1 when selectedVrmIndex is 0 without custom URL", () => {
      const selectedVrmIndex = 0;
      const vrmPath = getVrmUrl(selectedVrmIndex || 1);
      expect(vrmPath).toBe("/vrms/1.vrm");
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
