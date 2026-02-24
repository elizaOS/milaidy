import { z } from "zod";
import { parseModelSpec } from "./model-utils.js";

const MIN_PRIORITY = 1;
const MAX_PRIORITY = 100_000;
const DEFAULT_PRIORITY = 10_000;

const optionalModelSpecSchema = z
  .string()
  .trim()
  .min(1)
  .optional()
  .transform((value) => {
    if (!value) return undefined;

    try {
      parseModelSpec(value);
      return value;
    } catch {
      throw new Error(
        `Invalid model spec "${value}". Expected format: provider/modelId`,
      );
    }
  });

export const piAiPluginConfigSchema = z.object({
  PI_CODING_AGENT_DIR: z.string().trim().min(1).optional(),
  PI_AI_MODEL_SPEC: optionalModelSpecSchema,
  PI_AI_SMALL_MODEL_SPEC: optionalModelSpecSchema,
  PI_AI_LARGE_MODEL_SPEC: optionalModelSpecSchema,
  PI_AI_PRIORITY: z.coerce
    .number()
    .int()
    .min(MIN_PRIORITY)
    .max(MAX_PRIORITY)
    .default(DEFAULT_PRIORITY),
});

export interface PiAiPluginConfig {
  agentDir?: string;
  modelSpec?: string;
  smallModelSpec?: string;
  largeModelSpec?: string;
  priority: number;
}

export function loadPiAiPluginConfig(
  raw: Record<string, string | undefined>,
): PiAiPluginConfig {
  const parsed = piAiPluginConfigSchema.parse(raw);

  return {
    agentDir: parsed.PI_CODING_AGENT_DIR,
    modelSpec: parsed.PI_AI_MODEL_SPEC,
    smallModelSpec: parsed.PI_AI_SMALL_MODEL_SPEC,
    largeModelSpec: parsed.PI_AI_LARGE_MODEL_SPEC,
    priority: parsed.PI_AI_PRIORITY,
  };
}
