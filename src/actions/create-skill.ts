/**
 * CREATE_SKILL action — lets the agent create new SKILL.md files.
 * Gated on ENABLE_SELF_EVOLUTION character setting.
 */
import fs from "node:fs";
import type { Action, HandlerOptions } from "@elizaos/core";
import { sanitizeSkillContent } from "../services/creation-safety";
import {
  getLearningStore,
  isSelfEvolutionEnabled,
} from "../services/learning-store";

const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export const createSkillAction: Action = {
  name: "CREATE_SKILL",
  similes: ["MAKE_SKILL", "ADD_SKILL", "WRITE_SKILL"],
  description:
    "Create a new skill (SKILL.md) that extends the agent's capabilities. Requires ENABLE_SELF_EVOLUTION setting.",

  validate: async (runtime, message) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) return false;
    // Keyword gate — only show when relevant to save tokens
    const text = message.content?.text?.toLowerCase() ?? "";
    return [
      "create skill",
      "make skill",
      "add skill",
      "write skill",
      "new skill",
    ].some((kw) => text.includes(kw));
  },

  handler: async (runtime, _message, _state, options) => {
    const settings = runtime.character?.settings as
      | Record<string, unknown>
      | undefined;
    if (!isSelfEvolutionEnabled(settings)) {
      return {
        text: "Self-evolution is disabled. Set ENABLE_SELF_EVOLUTION=true in character settings to enable.",
        success: false,
      };
    }

    const params = (options as HandlerOptions | undefined)?.parameters;
    const name =
      typeof params?.name === "string" ? params.name.trim() : undefined;
    const description =
      typeof params?.description === "string"
        ? params.description.trim()
        : undefined;
    const instructions =
      typeof params?.instructions === "string"
        ? params.instructions.trim()
        : undefined;
    const whenToUse =
      typeof params?.whenToUse === "string"
        ? params.whenToUse.trim()
        : undefined;
    const steps =
      typeof params?.steps === "string" ? params.steps.trim() : undefined;

    if (!name || !description || !instructions) {
      return {
        text: "name, description, and instructions are required.",
        success: false,
      };
    }

    // Sanitize content for prompt injection
    const safeInstructions = sanitizeSkillContent(instructions);
    const safeDescription = sanitizeSkillContent(description);

    // Create skill via existing API
    try {
      const createResp = await fetch(
        `http://localhost:${API_PORT}/api/skills/create`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description: safeDescription }),
        },
      );

      if (!createResp.ok) {
        const errBody = await createResp.text();
        return {
          text: `Failed to create skill: ${errBody}`,
          success: false,
        };
      }

      const created = (await createResp.json()) as {
        skill?: { id?: string };
        path?: string;
      };
      const skillId = created?.skill?.id;
      const skillPath = created?.path;

      // Write agent-created marker so the UI can distinguish agent skills
      if (skillPath && fs.existsSync(skillPath)) {
        fs.writeFileSync(
          `${skillPath}/.agent-created`,
          JSON.stringify({ createdAt: new Date().toISOString(), by: "agent" }),
          "utf-8",
        );
      }

      // Write rich SKILL.md content via the source endpoint
      if (skillId) {
        const skillContent = buildSkillContent({
          name,
          description: safeDescription,
          instructions: safeInstructions,
          whenToUse,
          steps,
        });

        await fetch(
          `http://localhost:${API_PORT}/api/skills/${skillId}/source`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: skillContent }),
          },
        );
      }

      // Refresh skills
      await fetch(`http://localhost:${API_PORT}/api/skills/refresh`, {
        method: "POST",
      });

      // Record learning about the creation
      const store = getLearningStore();
      if (store) {
        store.record(
          "insight",
          `Created skill: ${name}`,
          `Description: ${safeDescription}`,
          "skill-creator",
        );
      }

      return {
        text: `Created skill "${name}" successfully.`,
        success: true,
        data: {
          actionName: "CREATE_SKILL",
          skillName: name,
          skillId,
        },
      };
    } catch (err) {
      return {
        text: `Error creating skill: ${err instanceof Error ? err.message : String(err)}`,
        success: false,
      };
    }
  },

  parameters: [
    {
      name: "name",
      description: "Name of the skill (used as filename)",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "description",
      description: "What this skill does",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "instructions",
      description: "Detailed instructions for using the skill",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "whenToUse",
      description: "When to invoke this skill",
      required: false,
      schema: { type: "string" as const },
    },
    {
      name: "steps",
      description: "Step-by-step checklist for the skill (newline-separated)",
      required: false,
      schema: { type: "string" as const },
    },
  ],
};

function buildSkillContent(opts: {
  name: string;
  description: string;
  instructions: string;
  whenToUse?: string;
  steps?: string;
}): string {
  const lines = [
    "---",
    `name: ${opts.name}`,
    `description: ${opts.description}`,
    "---",
    "",
    opts.instructions,
  ];

  if (opts.whenToUse) {
    lines.push("", "## When to Use", "", opts.whenToUse);
  }

  if (opts.steps) {
    lines.push("", "## Steps", "");
    for (const step of opts.steps.split("\n").filter((s) => s.trim())) {
      lines.push(`- ${step.trim()}`);
    }
  }

  return lines.join("\n");
}
