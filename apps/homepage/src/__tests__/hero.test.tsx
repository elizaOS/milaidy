import { cleanup, render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { HeroBackground, PHRASES } from "../components/Hero";

afterEach(cleanup);

describe("TypewriterLoop", () => {
  it("renders without crashing (text content appears)", () => {
    const { container } = render(
      <MemoryRouter>
        <HeroBackground />
      </MemoryRouter>,
    );
    const heading = container.querySelector("h1");
    expect(heading).toBeTruthy();
    // The heading should contain "MILADY" text at minimum
    expect(heading?.textContent).toContain("MILADY");
  });
});

describe("PHRASES array", () => {
  const expected = [
    "YOUR INTERFACE",
    "YOUR AGENTS",
    "YOUR RUNTIME",
    "YOUR CONTROL",
    "YOUR DATA",
    "YOUR MACHINE",
  ];

  it.each(expected)('contains "%s"', (phrase) => {
    expect(PHRASES).toContain(phrase);
  });

  it("has exactly 6 entries", () => {
    expect(PHRASES).toHaveLength(6);
  });
});
