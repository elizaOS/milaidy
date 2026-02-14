/**
 * CONVERT_GLB_TO_VRM action — converts a GLB 3D model to VRM 1.0 format.
 *
 * The action handler fetches the GLB from a URL, POSTs the raw binary to
 * the local API server's /api/convert-vrm route, and broadcasts an
 * "avatar-converted" WebSocket event on success.
 *
 * Follows the same local-POST pattern as `src/actions/emote.ts`.
 *
 * @module plugins/vrm-converter/action
 */

import type { Action, HandlerOptions } from "@elizaos/core";

/** API port for posting conversion requests. */
const API_PORT = process.env.API_PORT || process.env.SERVER_PORT || "2138";

export const convertGlbToVrmAction: Action = {
  name: "CONVERT_GLB_TO_VRM",

  similes: [
    "GLB_TO_VRM",
    "CONVERT_AVATAR",
    "MAKE_VRM",
    "CREATE_AVATAR",
    "CONVERT_MODEL",
    "IMPORT_GLB",
  ],

  description:
    "Convert a GLB 3D model file into VRM 1.0 format so it can be used as " +
    "an avatar. Accepts a URL to the GLB file.",

  validate: async (_runtime, _message, _state) => true,

  handler: async (_runtime, _message, _state, options) => {
    try {
      const params = (options as HandlerOptions | undefined)?.parameters;
      const glbUrl =
        typeof params?.glbUrl === "string" ? params.glbUrl : undefined;
      const save =
        typeof params?.save === "boolean" ? params.save : false;

      if (!glbUrl) {
        return { text: "No GLB URL provided.", success: false };
      }

      // Fetch the GLB file.
      const glbRes = await fetch(glbUrl);
      if (!glbRes.ok) {
        return {
          text: `Failed to fetch GLB from ${glbUrl}: ${glbRes.status}`,
          success: false,
        };
      }
      const glbBuffer = await glbRes.arrayBuffer();

      // POST raw binary to the local convert-vrm endpoint.
      const qs = save ? "?save=true" : "";
      const response = await fetch(
        `http://localhost:${API_PORT}/api/convert-vrm${qs}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/octet-stream" },
          body: glbBuffer,
        },
      );

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        return {
          text: `VRM conversion failed: ${response.status} ${errText}`,
          success: false,
        };
      }

      const warnings = response.headers.get("X-VRM-Warnings") || "";
      const bonesMapped = response.headers.get("X-VRM-Bones-Mapped") || "0";
      const savedPath = response.headers.get("X-VRM-Saved-Path") || undefined;

      return {
        text: `Converted GLB to VRM successfully (${bonesMapped} bones mapped).${
          warnings ? ` Warnings: ${warnings}` : ""
        }${savedPath ? ` Saved to: ${savedPath}` : ""}`,
        success: true,
        data: { bonesMapped: Number(bonesMapped), warnings, savedPath },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { text: `VRM conversion error: ${msg}`, success: false };
    }
  },

  parameters: [
    {
      name: "glbUrl",
      description: "URL of the GLB file to convert",
      required: true,
      schema: { type: "string" as const },
    },
    {
      name: "save",
      description: "Whether to save the converted VRM to disk",
      required: false,
      schema: { type: "boolean" as const },
    },
  ],
};
