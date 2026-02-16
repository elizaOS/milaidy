import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emoteAction } from "../../actions/emote";

function mockResponse(response: { ok: boolean }): Response {
  return {
    ok: response.ok,
  } as unknown as Response;
}

describe("emoteAction", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires an emote id", async () => {
    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      undefined,
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("rejects unknown emote IDs", async () => {
    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { emote: "does-not-exist" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("returns false when endpoint responds with non-ok", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: false }));

    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { emote: "wave" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      "http://localhost:2138/api/emote",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("plays a valid emote", async () => {
    vi.mocked(fetch).mockResolvedValue(mockResponse({ ok: true }));

    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { emote: "wave" } },
    );

    expect(result.success).toBe(true);
    expect(result.text).toBe("*waves*");
    expect(result.data).toMatchObject({ emoteId: "wave" });
  });

  it("handles fetch exceptions", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("server down"));

    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { emote: "wave" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
  });
});
