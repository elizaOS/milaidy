import { describe, expect, it } from "vitest";
import {
  getKnowledgeUploadFilename,
  type KnowledgeUploadFile,
  shouldReadKnowledgeFileAsText,
} from "../../src/components/KnowledgeView";

function makeUploadFile(
  name: string,
  type: string,
  relativePath?: string,
): KnowledgeUploadFile {
  const file = new File(["content"], name, { type }) as KnowledgeUploadFile;
  if (relativePath !== undefined) {
    Object.defineProperty(file, "webkitRelativePath", {
      value: relativePath,
      configurable: true,
    });
  }
  return file;
}

describe("knowledge upload helpers", () => {
  it("prefers relative path for folder uploads", () => {
    const file = makeUploadFile("guide.md", "text/markdown", "docs/guide.md");
    expect(getKnowledgeUploadFilename(file)).toBe("docs/guide.md");
  });

  it("falls back to filename for regular uploads", () => {
    const file = makeUploadFile("note.txt", "text/plain");
    expect(getKnowledgeUploadFilename(file)).toBe("note.txt");
  });

  it("detects text-readable knowledge files", () => {
    expect(
      shouldReadKnowledgeFileAsText({
        type: "application/json",
        name: "a.bin",
      }),
    ).toBe(true);
    expect(
      shouldReadKnowledgeFileAsText({
        type: "application/octet-stream",
        name: "notes.md",
      }),
    ).toBe(true);
    expect(
      shouldReadKnowledgeFileAsText({
        type: "application/pdf",
        name: "report.pdf",
      }),
    ).toBe(false);
  });
});
