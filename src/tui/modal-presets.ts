export interface ModalPreset {
  anchor: "center";
  width: `${number}%`;
  maxHeight: `${number}%`;
  margin: number;
}

/**
 * Shared popup sizing presets for a consistent overlay rhythm.
 */
export const MODAL_PRESETS = {
  compact: {
    anchor: "center",
    width: "50%",
    maxHeight: "50%",
    margin: 2,
  },
  standard: {
    anchor: "center",
    width: "60%",
    maxHeight: "70%",
    margin: 2,
  },
  wide: {
    anchor: "center",
    width: "80%",
    maxHeight: "85%",
    margin: 2,
  },
  xwide: {
    anchor: "center",
    width: "90%",
    maxHeight: "80%",
    margin: 2,
  },
} satisfies Record<string, ModalPreset>;
