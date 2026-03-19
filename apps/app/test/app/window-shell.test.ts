import { describe, expect, it, vi } from "vitest";
import {
  parseWindowShellRoute,
  resolveDetachedShellPathname,
  resolveDetachedShellTarget,
  shouldInstallMainWindowOnboardingPatches,
  syncDetachedShellLocation,
} from "../../src/window-shell";

describe("window shell routing", () => {
  it("parses detached settings and surface routes", () => {
    expect(parseWindowShellRoute("?shell=settings&tab=voice")).toEqual({
      mode: "settings",
      tab: "voice",
    });
    expect(parseWindowShellRoute("?shell=surface&tab=plugins")).toEqual({
      mode: "surface",
      tab: "plugins",
    });
    expect(parseWindowShellRoute("?shell=surface&tab=browser")).toEqual({
      mode: "surface",
      tab: "browser",
    });
    expect(parseWindowShellRoute("?shell=surface&tab=connectors")).toEqual({
      mode: "surface",
      tab: "connectors",
    });
  });

  it("keeps onboarding patches in the main window only", () => {
    expect(
      shouldInstallMainWindowOnboardingPatches(parseWindowShellRoute("")),
    ).toBe(true);
    expect(
      shouldInstallMainWindowOnboardingPatches(
        parseWindowShellRoute("?shell=settings"),
      ),
    ).toBe(false);
    expect(
      shouldInstallMainWindowOnboardingPatches(
        parseWindowShellRoute("?shell=surface&tab=plugins"),
      ),
    ).toBe(false);
  });

  it("maps detached shell routes to the correct in-app tabs", () => {
    expect(
      resolveDetachedShellTarget(
        parseWindowShellRoute("?shell=settings&tab=cloud"),
      ),
    ).toEqual({
      settingsSection: "cloud",
      tab: "settings",
    });
    expect(
      resolveDetachedShellTarget(
        parseWindowShellRoute("?shell=surface&tab=cloud"),
      ),
    ).toEqual({
      settingsSection: "cloud",
      tab: "settings",
    });
    expect(
      resolveDetachedShellTarget(
        parseWindowShellRoute("?shell=surface&tab=triggers"),
      ),
    ).toEqual({
      tab: "triggers",
    });
    expect(
      resolveDetachedShellTarget(
        parseWindowShellRoute("?shell=surface&tab=browser"),
      ),
    ).toEqual({
      tab: "browser",
    });
    expect(
      resolveDetachedShellPathname(
        parseWindowShellRoute("?shell=surface&tab=browser"),
      ),
    ).toBe("/browser");
  });

  it("rewrites detached shell URLs onto real app paths before app-core boots", () => {
    const history = { replaceState: vi.fn() };

    expect(
      syncDetachedShellLocation(
        parseWindowShellRoute(
          "?shell=surface&tab=plugins&apiBase=http://127.0.0.1:31337",
        ),
        {
          history,
          href: "http://127.0.0.1:5174/?shell=surface&tab=plugins&apiBase=http://127.0.0.1:31337",
        },
      ),
    ).toBe(true);

    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "http://127.0.0.1:5174/plugins?shell=surface&tab=plugins&apiBase=http://127.0.0.1:31337",
    );

    expect(
      syncDetachedShellLocation(
        parseWindowShellRoute("?shell=surface&tab=browser"),
        {
          history,
          href: "http://127.0.0.1:5174/?shell=surface&tab=browser",
        },
      ),
    ).toBe(true);

    expect(history.replaceState).toHaveBeenLastCalledWith(
      null,
      "",
      "http://127.0.0.1:5174/browser?shell=surface&tab=browser",
    );
  });
});
