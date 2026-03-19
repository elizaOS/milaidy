import { describe, it, expect } from "vitest";
import { validateFilename } from "../local-models";

describe("S3/S7: validateFilename rejects path traversal", () => {
  it("accepts normal filenames", () => {
    expect(() => validateFilename("config.json")).not.toThrow();
    expect(() => validateFilename("model.safetensors")).not.toThrow();
    expect(() => validateFilename("subdir/file.bin")).not.toThrow();
    expect(() => validateFilename("deep/nested/path/model.gguf")).not.toThrow();
  });

  it("rejects .. traversal", () => {
    expect(() => validateFilename("../../etc/passwd")).toThrow(
      "Invalid filename",
    );
    expect(() => validateFilename("subdir/../secret")).toThrow(
      "Invalid filename",
    );
    expect(() => validateFilename("..")).toThrow("Invalid filename");
  });

  it("rejects backslash paths", () => {
    expect(() => validateFilename("dir\\file.bin")).toThrow("Invalid filename");
  });

  it("rejects absolute paths", () => {
    expect(() => validateFilename("/etc/passwd")).toThrow("Invalid filename");
    expect(() => validateFilename("/tmp/model.bin")).toThrow("Invalid filename");
  });

  it("rejects empty segments (double slashes)", () => {
    expect(() => validateFilename("dir//file.bin")).toThrow("Invalid filename");
    expect(() => validateFilename("//leading")).toThrow("Invalid filename");
  });
});
