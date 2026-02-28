import type { AwarenessContributor } from "../../contracts/awareness";
import { runtimeContributor } from "./runtime";
import { permissionsContributor } from "./permissions";
import { walletContributor } from "./wallet";
import { providerContributor } from "./provider";
import { pluginHealthContributor } from "./plugin-health";
import { connectorsContributor } from "./connectors";
import { cloudContributor } from "./cloud";
import { featuresContributor } from "./features";

export const builtinContributors: AwarenessContributor[] = [
  runtimeContributor,
  permissionsContributor,
  walletContributor,
  providerContributor,
  pluginHealthContributor,
  connectorsContributor,
  cloudContributor,
  featuresContributor,
];
