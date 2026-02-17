import type { AgentRuntime } from "@elizaos/core";
import { logger, ModelType } from "@elizaos/core";
import { CharacterSchema } from "../config/zod-schema";
import type { RouteRequestContext } from "./route-helpers";

interface CharacterGenerateContext {
  name?: string;
  system?: string;
  bio?: string;
  style?: { all?: string[]; chat?: string[]; post?: string[] };
  postExamples?: string[];
}

type CharacterGenerateField = "bio" | "style" | "chatExamples" | "postExamples";
type CharacterGenerateMode = "append" | "replace";

export interface CharacterRouteState {
  runtime: AgentRuntime | null;
  agentName: string;
}

export interface CharacterRouteContext extends RouteRequestContext {
  state: CharacterRouteState;
  pickRandomNames: (count: number) => string[];
}

function buildCharacterSummary(ctx: CharacterGenerateContext): string {
  return [
    ctx.name ? `Name: ${ctx.name}` : "",
    ctx.system ? `System prompt: ${ctx.system}` : "",
    ctx.bio ? `Bio: ${ctx.bio}` : "",
    ctx.style?.all?.length ? `Style rules: ${ctx.style.all.join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildGeneratePrompt(
  field: CharacterGenerateField,
  context: CharacterGenerateContext,
  mode: CharacterGenerateMode | undefined,
): string {
  const charSummary = buildCharacterSummary(context);

  if (field === "bio") {
    return `Given this character:\n${charSummary}\n\nWrite a concise, compelling bio for this character (3-4 short paragraphs, one per line). Just output the bio lines, nothing else. Match the character's voice and personality.`;
  }

  if (field === "style") {
    const existing =
      mode === "append" && context.style?.all?.length
        ? `\nExisting style rules (add to these, don't repeat):\n${context.style.all.join("\n")}`
        : "";
    return `Given this character:\n${charSummary}${existing}\n\nGenerate 4-6 communication style rules for this character. Output a JSON object with keys "all", "chat", "post", each containing an array of short rule strings. Just output the JSON, nothing else.`;
  }

  if (field === "chatExamples") {
    return `Given this character:\n${charSummary}\n\nGenerate 3 example chat conversations showing how this character responds. Output a JSON array where each element is an array of message objects like [{"user":"{{user1}}","content":{"text":"..."}},{"user":"{{agentName}}","content":{"text":"..."}}]. Just output the JSON array, nothing else.`;
  }

  const existing =
    mode === "append" && context.postExamples?.length
      ? `\nExisting posts (add new ones, don't repeat):\n${context.postExamples.join("\n")}`
      : "";
  return `Given this character:\n${charSummary}${existing}\n\nGenerate 3-5 example social media posts this character would write. Output a JSON array of strings. Just output the JSON array, nothing else.`;
}

const CHARACTER_SCHEMA_FIELDS = [
  {
    key: "name",
    type: "string",
    label: "Name",
    description: "Agent display name",
    maxLength: 100,
  },
  {
    key: "username",
    type: "string",
    label: "Username",
    description: "Agent username for platforms",
    maxLength: 50,
  },
  {
    key: "bio",
    type: "string | string[]",
    label: "Bio",
    description: "Biography — single string or array of points",
  },
  {
    key: "system",
    type: "string",
    label: "System Prompt",
    description: "System prompt defining core behavior",
    maxLength: 10000,
  },
  {
    key: "adjectives",
    type: "string[]",
    label: "Adjectives",
    description: "Personality adjectives (e.g. curious, witty)",
  },
  {
    key: "topics",
    type: "string[]",
    label: "Topics",
    description: "Topics the agent is knowledgeable about",
  },
  {
    key: "style",
    type: "object",
    label: "Style",
    description: "Communication style guides",
    children: [
      {
        key: "all",
        type: "string[]",
        label: "All",
        description: "Style guidelines for all responses",
      },
      {
        key: "chat",
        type: "string[]",
        label: "Chat",
        description: "Style guidelines for chat responses",
      },
      {
        key: "post",
        type: "string[]",
        label: "Post",
        description: "Style guidelines for social media posts",
      },
    ],
  },
  {
    key: "messageExamples",
    type: "array",
    label: "Message Examples",
    description: "Example conversations demonstrating the agent's voice",
  },
  {
    key: "postExamples",
    type: "string[]",
    label: "Post Examples",
    description: "Example social media posts",
  },
] as const;

export async function handleCharacterRoutes(
  ctx: CharacterRouteContext,
): Promise<boolean> {
  const {
    req,
    res,
    method,
    pathname,
    state,
    readJsonBody,
    json,
    error,
    pickRandomNames,
  } = ctx;

  // ── GET /api/character ────────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character") {
    // Character data lives in the runtime / database, not the config file.
    const runtime = state.runtime;
    const merged: Record<string, unknown> = {};
    if (runtime) {
      const character = runtime.character;
      if (character.name) merged.name = character.name;
      if (character.bio) merged.bio = character.bio;
      if (character.system) merged.system = character.system;
      if (character.adjectives) merged.adjectives = character.adjectives;
      if (character.topics) merged.topics = character.topics;
      if (character.style) merged.style = character.style;
      if (character.postExamples) merged.postExamples = character.postExamples;
    }

    json(res, { character: merged, agentName: state.agentName });
    return true;
  }

  // ── PUT /api/character ────────────────────────────────────────────────
  if (method === "PUT" && pathname === "/api/character") {
    const body = await readJsonBody<Record<string, unknown>>(req, res);
    if (!body) return true;

    const result = CharacterSchema.safeParse(body);
    if (!result.success) {
      const issues = result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }));
      json(res, { ok: false, validationErrors: issues }, 422);
      return true;
    }

    // Character data lives in the runtime (backed by DB), not the config file.
    if (state.runtime) {
      const character = state.runtime.character;
      if (body.name != null) character.name = String(body.name);
      if (body.bio != null) {
        character.bio = Array.isArray(body.bio)
          ? (body.bio as string[])
          : [String(body.bio)];
      }
      if (body.system != null) character.system = String(body.system);
      if (body.adjectives != null)
        character.adjectives = body.adjectives as string[];
      if (body.topics != null) character.topics = body.topics as string[];
      if (body.style != null)
        character.style = body.style as NonNullable<typeof character.style>;
      if (body.postExamples != null)
        character.postExamples = body.postExamples as string[];
    }

    if (body.name) state.agentName = String(body.name);
    json(res, { ok: true, character: body, agentName: state.agentName });
    return true;
  }

  // ── GET /api/character/random-name ────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/random-name") {
    const names = pickRandomNames(1);
    json(res, { name: names[0] ?? "Reimu" });
    return true;
  }

  // ── POST /api/character/generate ──────────────────────────────────────
  if (method === "POST" && pathname === "/api/character/generate") {
    const body = await readJsonBody<{
      field: CharacterGenerateField;
      context: CharacterGenerateContext;
      mode?: CharacterGenerateMode;
    }>(req, res);
    if (!body) return true;

    if (!body.field || !body.context) {
      error(res, "field and context are required", 400);
      return true;
    }

    const runtime = state.runtime;
    if (!runtime) {
      error(res, "Agent runtime not available. Start the agent first.", 503);
      return true;
    }

    if (
      body.field !== "bio" &&
      body.field !== "style" &&
      body.field !== "chatExamples" &&
      body.field !== "postExamples"
    ) {
      error(res, `Unknown field: ${body.field}`, 400);
      return true;
    }

    const prompt = buildGeneratePrompt(body.field, body.context, body.mode);

    try {
      const result = await runtime.useModel(ModelType.TEXT_SMALL, {
        prompt,
        temperature: 0.8,
        maxTokens: 1500,
      });
      json(res, { generated: String(result) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "generation failed";
      logger.error(`[character-generate] ${message}`);
      error(res, message, 500);
    }
    return true;
  }

  // ── GET /api/character/schema ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/character/schema") {
    json(res, { fields: CHARACTER_SCHEMA_FIELDS });
    return true;
  }

  return false;
}
