import type { ReactElement } from "react";
import { DevArchitecturePage } from "./developer/DevArchitecturePage";
import { DevAgentPipelinePage } from "./developer/DevAgentPipelinePage";
import { DevContributingPage } from "./developer/DevContributingPage";
import { DevDossiersPage } from "./developer/DevDossiersPage";
import { DevExtensionPage } from "./developer/DevExtensionPage";
import { DevFrameworkRepoPage } from "./developer/DevFrameworkRepoPage";
import { DevQualityPage } from "./developer/DevQualityPage";
import { DevReleasePage } from "./developer/DevReleasePage";
import { DevRuntimePage } from "./developer/DevRuntimePage";
import { DevSecurityPage } from "./developer/DevSecurityPage";
import { DevSourceCoveragePage } from "./developer/DevSourceCoveragePage";
import { DeveloperGuidePage } from "./developer/DeveloperGuidePage";
import { UsersEcosystemPage } from "./user/UsersEcosystemPage";
import { UserGuidePage } from "./user/UserGuidePage";
import { UsersCapabilitiesPage } from "./user/UsersCapabilitiesPage";
import { UsersInstallationPage } from "./user/UsersInstallationPage";
import { UsersOperationsPage } from "./user/UsersOperationsPage";
import { UsersPrivacyPage } from "./user/UsersPrivacyPage";
import { UsersQuickstartPage } from "./user/UsersQuickstartPage";
import { UsersTroubleshootingPage } from "./user/UsersTroubleshootingPage";
import { UsersWalletPage } from "./user/UsersWalletPage";

export type DocTopic = {
  slug: string;
  title: string;
  group: "User" | "Developer";
  summary: string;
  Page: () => ReactElement;
};

export const userTopics: DocTopic[] = [
  { slug: "user-guide", title: "User Guide", group: "User", summary: "Product positioning, boundaries, and default runtime behavior.", Page: UserGuidePage },
  { slug: "users-installation", title: "Installation", group: "User", summary: "Installation paths, runtime baseline, and first-start requirements.", Page: UsersInstallationPage },
  { slug: "users-quickstart", title: "Quickstart", group: "User", summary: "Shortest path to verify a usable installation.", Page: UsersQuickstartPage },
  { slug: "users-ecosystem", title: "Product & Ecosystem", group: "User", summary: "Product overview, BSC scenarios, and ecosystem positioning.", Page: UsersEcosystemPage },
  { slug: "users-capabilities", title: "All Features", group: "User", summary: "Summary of available capabilities and usage strategies.", Page: UsersCapabilitiesPage },
  { slug: "users-operations", title: "How to Use", group: "User", summary: "Daily commands, operations rhythm, and stability practices.", Page: UsersOperationsPage },
  { slug: "users-wallet", title: "Wallet & BSC Safety", group: "User", summary: "Risk control practices for wallet and on-chain capabilities.", Page: UsersWalletPage },
  { slug: "users-privacy", title: "Privacy Controls", group: "User", summary: "Network exposure, token, and data boundary controls.", Page: UsersPrivacyPage },
  { slug: "users-troubleshooting", title: "Troubleshooting", group: "User", summary: "Fixed sequence for troubleshooting and high-quality feedback.", Page: UsersTroubleshootingPage },
];

export const developerTopics: DocTopic[] = [
  { slug: "developer-guide", title: "Developer Guide", group: "Developer", summary: "Project goals, contribution boundaries, and R&D principles.", Page: DeveloperGuidePage },
  { slug: "dev-architecture", title: "Architecture", group: "Developer", summary: "Runtime control flow, module boundaries, and entry points.", Page: DevArchitecturePage },
  { slug: "dev-runtime", title: "Runtime & API", group: "Developer", summary: "Config model, contract stability, and API evolution.", Page: DevRuntimePage },
  { slug: "dev-framework-repo", title: "Framework & Repo", group: "Developer", summary: "Tech stack, directory structure, and engineering practices.", Page: DevFrameworkRepoPage },
  { slug: "dev-dossiers", title: "Implementation Dossiers", group: "Developer", summary: "Control flow, phases, and risk frameworks for major implementations.", Page: DevDossiersPage },
  { slug: "dev-extension", title: "Plugins & Skills", group: "Developer", summary: "Extension mechanisms, isolation strategies, and implementation notes.", Page: DevExtensionPage },
  { slug: "dev-quality", title: "Testing & Quality", group: "Developer", summary: "Quality gates, coverage, and verification strategies.", Page: DevQualityPage },
  { slug: "dev-contributing", title: "Contributing", group: "Developer", summary: "Agents-only workflow and acceptable change scope.", Page: DevContributingPage },
  { slug: "dev-agent-pipeline", title: "Agent Review Pipeline", group: "Developer", summary: "Automated review, trust scoring, and merge governance.", Page: DevAgentPipelinePage },
  { slug: "dev-source-coverage", title: "Source Coverage", group: "Developer", summary: "Mapping of gitbook and docs sources.", Page: DevSourceCoveragePage },
  { slug: "dev-release", title: "Release Checklist", group: "Developer", summary: "Release verification, migration, and rollback preparation.", Page: DevReleasePage },
  { slug: "dev-security", title: "Security Hardening", group: "Developer", summary: "Default security policies and risk convergence methods.", Page: DevSecurityPage },
];

export const allTopics = [...userTopics, ...developerTopics];
export const topicBySlug = new Map(allTopics.map((topic) => [topic.slug, topic]));

export function currentSlugFromPath() {
  if (typeof window === "undefined") {
    return "user-guide";
  }
  const segments = window.location.pathname.split("/").filter(Boolean);
  if (segments[0] !== "document") {
    return "user-guide";
  }
  return segments[1] ?? "user-guide";
}

export function topicHref(slug: string) {
  return `/document/${slug}`;
}
