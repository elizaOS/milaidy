/** Options for GLB → VRM conversion. */
export interface VRMConversionOptions {
  /** Display name for the avatar (defaults to "Converted Avatar"). */
  avatarName?: string;
  /** Author metadata embedded in VRM. */
  author?: string;
  /** VRM meta version string. */
  version?: string;
  /** Whether to persist the result to ~/.milaidy/avatars/. */
  save?: boolean;
}

/** Result returned from a successful conversion. */
export interface VRMConversionResult {
  /** The converted VRM binary (GLB with VRMC_vrm extension). */
  vrm: ArrayBuffer;
  /** Human-readable warnings (unmapped bones, scale quirks, etc.). */
  warnings: string[];
  /** Number of bones successfully mapped to VRM humanoid standard. */
  mappedBones: number;
  /** If `save` was requested, the absolute path where the VRM was written. */
  savedPath?: string;
}
