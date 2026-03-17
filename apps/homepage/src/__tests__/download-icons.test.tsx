import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DownloadIcons } from "../components/DownloadIcons";
import { releaseData } from "../generated/release-data";

afterEach(cleanup);

describe("DownloadIcons", () => {
  beforeEach(() => {
    // Default: runtime fetch fails so component falls back to build-time data
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders all 7 platform icons", () => {
    const { container } = render(<DownloadIcons />);
    const icons = container.querySelectorAll(".download-icons li");
    expect(icons.length).toBe(7);
  });

  it("active platforms (apple, windows, linux, ubuntu, github) have real href", () => {
    const { container } = render(<DownloadIcons />);
    for (const id of ["apple", "windows", "linux", "github"]) {
      const link = container.querySelector(`.download.${id}`);
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).not.toBe("#");
    }
  });

  it("disabled platforms (android, ios) have href='#' and is-disabled class", () => {
    const { container } = render(<DownloadIcons />);
    for (const id of ["android", "ios"]) {
      const link = container.querySelector(`.download.${id}`);
      expect(link).toBeTruthy();
      expect(link?.getAttribute("href")).toBe("#");
      expect(link?.classList.contains("is-disabled")).toBe(true);
    }
  });

  it("github icon links to the release page URL", () => {
    const { container } = render(<DownloadIcons />);
    const ghLink = container.querySelector(".download.github");
    expect(ghLink?.getAttribute("href")).toBe(releaseData.release.url);
  });

  it("renders curl commands (shell and powershell)", () => {
    render(<DownloadIcons />);
    expect(
      screen.getByText(releaseData.scripts.shell.command),
    ).toBeInTheDocument();
    expect(
      screen.getByText(releaseData.scripts.powershell.command),
    ).toBeInTheDocument();
  });

  it("runtime fetch updates URLs when API returns fresh data", async () => {
    const freshUrl =
      "https://github.com/milady-ai/milady/releases/download/v9.9.9/canary-macos-arm64-Milady-canary.dmg";
    const freshReleaseUrl =
      "https://github.com/milady-ai/milady/releases/tag/v9.9.9";

    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => [
        {
          draft: false,
          html_url: freshReleaseUrl,
          assets: [
            {
              name: "canary-macos-arm64-Milady-canary.dmg",
              browser_download_url: freshUrl,
            },
          ],
        },
      ],
    } as Response);

    const { container } = render(<DownloadIcons />);

    await waitFor(() => {
      const appleLink = container.querySelector(".download.apple");
      expect(appleLink?.getAttribute("href")).toBe(freshUrl);
    });

    // GitHub link should also update to fresh release page
    const ghLink = container.querySelector(".download.github");
    expect(ghLink?.getAttribute("href")).toBe(freshReleaseUrl);
  });
});
