/**
 * Camera Plugin for Electrobun
 *
 * Uses the web implementation (MediaDevices API) for parity on desktop.
 */

import type { CameraPlugin } from "@miladyai/app-core/src/definitions";
import { CameraWeb } from "@miladyai/app-core/src/web";

export class CameraElectrobun extends CameraWeb implements CameraPlugin {}

// Export the plugin instance
export const Camera = new CameraElectrobun();
