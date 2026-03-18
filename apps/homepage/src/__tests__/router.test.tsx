import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "../router";

beforeEach(() => {
  localStorage.setItem("milady-cloud-token", "test-api-key");
});

afterEach(() => {
  localStorage.removeItem("milady-cloud-token");
  cleanup();
});

describe("Router", () => {
  it("renders homepage at /", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(document.querySelector("#top")).toBeTruthy();
  });

  it("renders dashboard at /dashboard", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard")).toBeTruthy();
  });
});
