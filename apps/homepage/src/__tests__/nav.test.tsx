import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { Nav } from "../components/Nav";
import { releaseData } from "../generated/release-data";

afterEach(cleanup);

function renderNav() {
  return render(<MemoryRouter><Nav /></MemoryRouter>);
}

describe("Nav", () => {
  it("version clock element exists with version-clock class", () => {
    const { container } = renderNav();
    const clock = container.querySelector(".version-clock");
    expect(clock).toBeTruthy();
  });

  it("version clock displays the tag name from release data", () => {
    const { container } = renderNav();
    const clock = container.querySelector(".version-clock");
    expect(clock?.textContent).toContain(releaseData.release.tagName);
  });

  it('version clock shows "canary" when prerelease is true', () => {
    const { container } = renderNav();
    const clock = container.querySelector(".version-clock");
    const expected = releaseData.release.prerelease ? "canary" : "stable";
    expect(clock?.textContent).toContain(expected);
  });

  it("releases button links to the release page URL", () => {
    const { container } = renderNav();
    const releasesLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Releases",
    );
    expect(releasesLink).toBeTruthy();
    expect(releasesLink?.getAttribute("href")).toBe(releaseData.release.url);
  });

  it("version clock is positioned after the Releases button in DOM order", () => {
    const { container } = renderNav();
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    if (!nav) throw new Error("Expected nav element to render");
    const html = nav.innerHTML;
    const releasesIdx = html.indexOf("Releases");
    const clockIdx = html.indexOf("version-clock");
    expect(releasesIdx).toBeGreaterThan(-1);
    expect(clockIdx).toBeGreaterThan(-1);
    expect(clockIdx).toBeGreaterThan(releasesIdx);
  });

  it("Cloud link navigates to /dashboard (not external)", () => {
    const { container } = renderNav();
    const cloudLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "Cloud",
    );
    expect(cloudLink).toBeTruthy();
    expect(cloudLink?.getAttribute("href")).toBe("/dashboard");
    expect(cloudLink?.getAttribute("target")).toBeNull();
  });
});
