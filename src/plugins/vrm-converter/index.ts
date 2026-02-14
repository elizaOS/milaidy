import type { Plugin } from "@elizaos/core";
import { convertGlbToVrmAction } from "./action.js";

export const vrmConverterPlugin: Plugin = {
  name: "vrm-converter",
  description: "Convert GLB 3D models to VRM 1.0 format for avatar use",
  actions: [convertGlbToVrmAction],
};

export default vrmConverterPlugin;
