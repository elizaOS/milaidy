import { afterAll, afterEach, vi } from "vitest";

// Ensure Vitest environment is properly set
process.env.VITEST = "true";
// Keep test output focused on failures; individual tests can override.
process.env.LOG_LEVEL ??= "error";

declare global {
  // React 18 testing flag to suppress act() environment warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

function shouldIgnoreConsoleError(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first !== "string") return false;
  return (
    first.includes("react-test-renderer is deprecated") ||
    first.includes(
      "The current testing environment is not configured to support act(...)",
    )
  );
}

console.error = (...args: unknown[]) => {
  if (shouldIgnoreConsoleError(args)) return;
  originalConsoleError(...args);
};

import { withIsolatedTestHome } from "./test-env";

const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());

afterEach(() => {
  // Guard against leaked fake timers across test files/workers.
  vi.useRealTimers();
});

function createMockCanvasContext(
  canvas: HTMLCanvasElement,
): CanvasRenderingContext2D {
  return {
    canvas,
    fillStyle: "#000000",
    strokeStyle: "#000000",
    globalAlpha: 1,
    lineWidth: 1,
    font: "10px sans-serif",
    textAlign: "start",
    textBaseline: "alphabetic",
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    rect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    resetTransform: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn((text: string) => ({
      width: text.length * 8,
    })),
    getImageData: vi.fn(() => ({
      data: new Uint8ClampedArray(4),
      width: 1,
      height: 1,
      colorSpace: "srgb",
    })),
    putImageData: vi.fn(),
    createImageData: vi.fn((width = 1, height = 1) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
      colorSpace: "srgb",
    })),
    createLinearGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createRadialGradient: vi.fn(() => ({
      addColorStop: vi.fn(),
    })),
    createPattern: vi.fn(() => null),
  } as unknown as CanvasRenderingContext2D;
}

if (typeof globalThis.HTMLCanvasElement !== "undefined") {
  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "getContext", {
    value: vi.fn(function getContext(
      this: HTMLCanvasElement,
      contextId: string,
    ) {
      if (contextId !== "2d") return null;
      return createMockCanvasContext(this);
    }),
    writable: true,
    configurable: true,
  });
  Object.defineProperty(globalThis.HTMLCanvasElement.prototype, "toDataURL", {
    value: vi.fn(() => "data:image/png;base64,dGVzdA=="),
    writable: true,
    configurable: true,
  });
}
