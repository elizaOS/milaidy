import type { AwarenessContributor } from "../../contracts/awareness";
import { opinionContributor } from "../../plugins/opinion/awareness/opinion-contributor";
import { cloudContributor } from "./cloud";
import { connectorsContributor } from "./connectors";
import { featuresContributor } from "./features";
import { permissionsContributor } from "./permissions";
import { pluginHealthContributor } from "./plugin-health";
import { providerContributor } from "./provider";
import { runtimeContributor } from "./runtime";
import { walletContributor } from "./wallet";

export const builtinContributors: AwarenessContributor[] = [
  runtimeContributor,
  permissionsContributor,
  walletContributor,
  opinionContributor,
  providerContributor,
  pluginHealthContributor,
  connectorsContributor,
  cloudContributor,
  featuresContributor,
];
