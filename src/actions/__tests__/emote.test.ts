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
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("describes PLAY_EMOTE as a chainable one-shot action", () => {
    expect(emoteAction.description).toContain("one-shot emote animation");
    expect(emoteAction.description).toContain(
      "silent non-blocking visual side action",
    );
    expect(emoteAction.description).toContain("required emote parameter");
    expect(emoteAction.description).toContain("before, after, or alongside");
    expect(emoteAction.description).toContain("same turn");
  });

  it("does not infer emotes from message text when parameters are missing", async () => {
    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "please wave now" } },
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

  it("rejects agent-disallowed emote IDs", async () => {
    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "" } },
      undefined,
      { parameters: { emote: "idle" } },
    );

    expect(result.success).toBe(false);
    expect(result.text).toBe("");
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("does not infer run or walk from message text", async () => {
    const result = await emoteAction.handler(
      undefined,
      { roomId: "room", content: { text: "walk over there" } },
      undefined,
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
    expect(result.text).toBe("");
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
