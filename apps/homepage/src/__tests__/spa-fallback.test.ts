import { describe, expect, it } from "vitest";
import { getSpaFallbackRedirectTarget } from "../lib/spa-fallback";

describe("spa fallback redirect", () => {
  it("restores a dashboard path from the 404 redirect query", () => {
    expect(
      getSpaFallbackRedirectTarget({
        pathname: "/",
        search: "?p=%2Fdashboard&q=%3Ftoken%3Dabc&h=%23top",
        hash: "",
      }),
    ).toBe("/dashboard?token=abc#top");
  });

  it("returns null when there is no fallback payload", () => {
    expect(
      getSpaFallbackRedirectTarget({
        pathname: "/dashboard",
        search: "",
        hash: "",
      }),
    ).toBeNull();
  });

  it("ignores arbitrary p query params that are not valid fallback paths", () => {
    expect(
      getSpaFallbackRedirectTarget({
        pathname: "/",
        search: "?p=1",
        hash: "",
      }),
    ).toBeNull();

    expect(
      getSpaFallbackRedirectTarget({
        pathname: "/",
        search: "?p=%2F%2Fevil.example",
        hash: "",
      }),
    ).toBeNull();
  });
});
