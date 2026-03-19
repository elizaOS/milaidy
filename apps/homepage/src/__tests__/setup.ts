import "@testing-library/jest-dom/vitest";

function createMemoryStorage(): Storage {
  const values = new Map<string, string>();

  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function ensureStorage(name: "localStorage" | "sessionStorage") {
  const existing = globalThis[name];
  if (existing && typeof existing.clear === "function") {
    return;
  }

  const storage = createMemoryStorage();
  Object.defineProperty(globalThis, name, {
    configurable: true,
    value: storage,
  });

  if (typeof window !== "undefined") {
    Object.defineProperty(window, name, {
      configurable: true,
      value: storage,
    });
  }
}

ensureStorage("localStorage");
ensureStorage("sessionStorage");
