import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { Nav } from "../components/Nav";
import { releaseData } from "../generated/release-data";

afterEach(cleanup);

function renderNav() {
  return render(
    <MemoryRouter>
      <Nav />
    </MemoryRouter>,
  );
}

describe("Nav", () => {
  it("version indicator exists with tagName", () => {
    const { container } = renderNav();
    // New design displays version inline without .version-clock class
    expect(container.textContent).toContain(releaseData.release.tagName);
  });

  it("version indicator displays the tag name from release data", () => {
    const { container } = renderNav();
    // Version is displayed in a span element
    expect(container.textContent).toContain(releaseData.release.tagName);
  });

  it("version indicator shows the tag name", () => {
    const { container } = renderNav();
    // The version tag is displayed inline
    expect(container.textContent).toContain(releaseData.release.tagName);
  });

  it("releases button links to the release page URL", () => {
    const { container } = renderNav();
    // New design uses uppercase "RELEASES"
    const releasesLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "RELEASES",
    );
    expect(releasesLink).toBeTruthy();
    expect(releasesLink?.getAttribute("href")).toBe(releaseData.release.url);
  });

  it("version indicator exists alongside releases link", () => {
    const { container } = renderNav();
    const nav = container.querySelector("nav");
    expect(nav).toBeTruthy();
    if (!nav) throw new Error("Expected nav element to render");
    const html = nav.innerHTML;
    // New design uses uppercase "RELEASES" and displays version tag
    // Both should be present in the nav
    const releasesIdx = html.indexOf("RELEASES");
    const versionIdx = html.indexOf(releaseData.release.tagName);
    expect(releasesIdx).toBeGreaterThan(-1);
    expect(versionIdx).toBeGreaterThan(-1);
  });

  it("Dashboard link navigates to /dashboard (not external)", () => {
    const { container } = renderNav();
    // New design uses uppercase "DASHBOARD"
    const dashboardLink = Array.from(container.querySelectorAll("a")).find(
      (a) => a.textContent?.trim() === "DASHBOARD",
    );
    expect(dashboardLink).toBeTruthy();
    expect(dashboardLink?.getAttribute("href")).toBe("/dashboard");
    expect(dashboardLink?.getAttribute("target")).toBeNull();
  });
});
