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
    "LOCAL FIRST",
    "AUTONOMOUS BADASS",
    "SHE IS IN CHARGE",
    "TAKES THE LEAD",
    "HEAD BITCH IN CHARGE",
    "KNEEL BEFORE HER",
    "GETS SHIT DONE",
    "WAIFU WONDERWOMAN",
  ];

  it.each(expected)('contains "%s"', (phrase) => {
    expect(PHRASES).toContain(phrase);
  });

  it("has exactly 8 entries", () => {
    expect(PHRASES).toHaveLength(8);
  });
});
