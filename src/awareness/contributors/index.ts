import type { AwarenessContributor } from "../../contracts/awareness";
import { runtimeContributor } from "./runtime";
import { permissionsContributor } from "./permissions";
import { walletContributor } from "./wallet";
import { opinionContributor } from "../../plugins/opinion/awareness/opinion-contributor";
import { providerContributor } from "./provider";
import { pluginHealthContributor } from "./plugin-health";
import { connectorsContributor } from "./connectors";
import { cloudContributor } from "./cloud";
import { featuresContributor } from "./features";

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
