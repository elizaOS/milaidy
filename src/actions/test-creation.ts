/**
 * TEST_CREATION action — verify that a created skill or action works.
 */
import type { Action, HandlerOptions } from "@elizaos/core";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export const testCreationAction: Action = {
  name: "TEST_CREATION",
  similes: ["VERIFY_CREATION", "CHECK_CREATION", "VALIDATE_CREATION"],
  description:
    "Test a previously created skill or action to verify it works correctly.",
  validate: async (_runtime, message) => {
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "test skill",
      "test action",
      "verify skill",
      "verify action",
      "check skill",
      "check action",
    ].some((kw) => text.includes(kw));
  },

  handler: async (_runtime, _message, _state, options) => {
    const params = (options as HandlerOptions | undefined)?.parameters;
    const type =
      typeof params?.type === "string" ? params.type.trim() : undefined;
    const targetId =
      typeof params?.targetId === "string" ? params.targetId.trim() : undefined;

    if (!type || !["skill", "action"].includes(type)) {
      return {
        text: "type must be 'skill' or 'action'.",
        success: false,
      };
    }
    if (!targetId) {
      return { text: "targetId is required.", success: false };
    }

    if (type === "skill") {
      return await testSkill(targetId);
    }
    return await testAction(targetId);
  },

  parameters: [
    {
      name: "type",
      description: "What to test: 'skill' or 'action'",
      required: true,
      schema: { type: "string" as const, enum: ["skill", "action"] },
    },
    {
      name: "targetId",
      description: "ID or name of the skill/action to test",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "testInput",
      description: "Optional test input as JSON",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

async function testSkill(targetId: string): Promise<{
  text: string;
  success: boolean;
  data?: Record<string, string | boolean>;
}> {
  try {
    // Check if skill exists in the skills list
    const resp = await fetch(`http://localhost:${API_PORT}/api/skills`);
    if (!resp.ok) {
      return { text: "Failed to fetch skills list.", success: false };
    }

    const body = (await resp.json()) as {
      skills?: Array<{ id: string; name: string; enabled: boolean }>;
    };
    const skills = body.skills ?? [];
    const found = skills.find(
      (s) =>
        s.id === targetId || s.name.toLowerCase() === targetId.toLowerCase(),
    );

    if (!found) {
      return {
        text: `Skill "${targetId}" not found. Available: ${skills.map((s) => s.name).join(", ")}`,
        success: false,
      };
    }

    // Try to read the source
    const sourceResp = await fetch(
      `http://localhost:${API_PORT}/api/skills/${found.id}/source`,
    );
    if (!sourceResp.ok) {
      return {
        text: `Skill "${found.name}" exists but source is unreadable.`,
        success: false,
      };
    }

    const source = (await sourceResp.json()) as { content?: string };
    const hasContent = Boolean(source.content?.trim());

    return {
      text: `Skill "${found.name}" is ${found.enabled ? "enabled" : "disabled"}, source ${hasContent ? "present" : "empty"}.`,
      success: true,
      data: {
        actionName: "TEST_CREATION",
        type: "skill",
        name: found.name,
        enabled: found.enabled,
        hasContent,
      },
    };
  } catch (err) {
    return {
      text: `Error testing skill: ${err instanceof Error ? err.message : String(err)}`,
      success: false,
    };
  }
}

async function testAction(targetId: string): Promise<{
  text: string;
  success: boolean;
  data?: Record<string, string | boolean>;
}> {
  try {
    // Check if the action is registered via the agent API
    const resp = await fetch(`http://localhost:${API_PORT}/api/agent`);
    if (!resp.ok) {
      return { text: "Failed to fetch agent info.", success: false };
    }

    const body = (await resp.json()) as {
      actions?: Array<{ name: string }>;
    };
    const actions = body.actions ?? [];
    const found = actions.find(
      (a) => a.name.toUpperCase() === targetId.toUpperCase(),
    );

    if (!found) {
      return {
        text: `Action "${targetId}" not found in registered actions.`,
        success: false,
      };
    }

    return {
      text: `Action "${found.name}" is registered and available.`,
      success: true,
      data: {
        actionName: "TEST_CREATION",
        type: "action",
        name: found.name,
        registered: true,
      },
    };
  } catch (err) {
    return {
      text: `Error testing action: ${err instanceof Error ? err.message : String(err)}`,
      success: false,
    };
  }
}
