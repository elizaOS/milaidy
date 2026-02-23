/**
 * Main Milaidy App component.
 *
 * Single-agent dashboard with onboarding wizard, chat, plugins, skills,
 * config, and logs views.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import { guard } from "lit/directives/guard.js";
import { repeat } from "lit/directives/repeat.js";
import {
  client,
  type AgentStatus,
  type ChatMessage,
  type PluginInfo,
  type SkillInfo,
  type LogEntry,
  type OnboardingOptions,
  type ProviderOption,
  type ExtensionStatus,
  type UiConfigResponse,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletNftsResponse,
  type WalletChain,
  type WalletConfigStatus,
  type PolymarketPortfolioResponse,
} from "./api-client.js";
import { basePathFromLocation, tabFromPath, pathForTab, type Tab, titleForTab } from "./navigation.js";

const CHAT_STORAGE_KEY = "milaidy:chatMessages";
const SESSION_STORAGE_KEY = "milaidy:sessions";
const SECURITY_STORAGE_KEY = "milaidy:security";
const PROFILE_IMAGE_STORAGE_KEY = "milaidy:profileImage";
const PROFILE_ACCENT_STORAGE_KEY = "milaidy:profileAccent";
const USER_NAME_STORAGE_KEY = "milaidy:userName";
const USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY = "milaidy:userNameChangeLockUntil";
const USER_HANDLE_REGISTRY_STORAGE_KEY = "milaidy:userHandleRegistry";
const USER_HANDLE_OWNER_ID_STORAGE_KEY = "milaidy:userHandleOwnerId";
const STYLE_SELECTION_STORAGE_KEY = "milaidy:styleSelection";
const PROVIDER_SELECTION_STORAGE_KEY = "milaidy:providerSelection";
const DEVICE_PROFILE_STORAGE_KEY = "milaidy:deviceProfile";
const SERVER_PROFILE_SYNCED_KEY = "milaidy:serverProfileSynced";
const MAX_VISIBLE_CHAT_MESSAGES = 120;
const USER_NAME_CHANGE_LOCK_MS = 48 * 60 * 60 * 1000;

interface CuratedAppEntry {
  id: string;
  name: string;
  description: string;
  actionMode: "polymarket-bet" | "assistant";
}

const CHAT_QUICK_PROMPTS = [
  "Give me a quick portfolio summary and risk check.",
  "What are the top Solana market moves today?",
  "Set up my next action plan for markets and apps.",
  "Review my enabled tools and suggest safer defaults.",
];

// Developer-curated app surface for end users.
// Add plugin ids here when you want them to appear in the Apps tab.
const CURATED_APPS: CuratedAppEntry[] = [
  {
    id: "polymarket",
    name: "Polymarket",
    description: "Place and manage prediction market positions.",
    actionMode: "polymarket-bet",
  },
  {
    id: "telegram",
    name: "Telegram",
    description: "Message and automate your Telegram flows.",
    actionMode: "assistant",
  },
  {
    id: "discord",
    name: "Discord",
    description: "Run Discord actions through your assistant.",
    actionMode: "assistant",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Connect workspaces and run Slack actions from Milaidy.",
    actionMode: "assistant",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    description: "Manage WhatsApp messaging workflows through Milaidy.",
    actionMode: "assistant",
  },
  {
    id: "signal",
    name: "Signal",
    description: "Connect Signal for secure messaging automations.",
    actionMode: "assistant",
  },
  {
    id: "imessage",
    name: "iMessage",
    description: "Use iMessage workflows via connected Apple messaging bridge.",
    actionMode: "assistant",
  },
  {
    id: "bluebubbles",
    name: "BlueBubbles",
    description: "Bridge iMessage capabilities using BlueBubbles integration.",
    actionMode: "assistant",
  },
  {
    id: "msteams",
    name: "Microsoft Teams",
    description: "Run Teams actions and messaging workflows through Milaidy.",
    actionMode: "assistant",
  },
  {
    id: "mattermost",
    name: "Mattermost",
    description: "Connect Mattermost channels and automate team workflows.",
    actionMode: "assistant",
  },
];
const CURATED_APP_ID_SET = new Set(CURATED_APPS.map((app) => app.id));
const CURATED_APP_ORDER = new Map(CURATED_APPS.map((app, idx) => [app.id, idx]));

type AppEntry = CuratedAppEntry;

interface ChatSession {
  id: string;
  name: string;
  updatedAt: number;
  messages: ChatMessage[];
}

interface SecurityAuditAction {
  id: string;
  at: number;
  pluginId: string;
  pluginName: string;
  risk: "SAFE" | "CAN_EXECUTE" | "CAN_SPEND";
  kind: "prepared" | "blocked" | "failed";
  detail: string;
}

interface CharacterTheme {
  accent: string;
  surface: string;
}

type ThemeTokenMap = Record<string, string>;

interface ThemeColorOption {
  label: string;
  value: string;
}

interface ProviderHealthState {
  label: string;
  detail: string | null;
  tone: "ok" | "warn" | "risk";
  updatedAt: number;
}

@customElement("milaidy-app")
export class MilaidyApp extends LitElement {
  // --- State ---
  @state() tab: Tab = "chat";
  @state() basePath = "";
  @state() connected = false;
  @state() agentStatus: AgentStatus | null = null;
  @state() onboardingComplete = false;
  @state() onboardingLoading = true;
  @state() chatMessages: ChatMessage[] = [];
  @state() chatSessions: ChatSession[] = [];
  @state() activeSessionId: string | null = null;
  @state() clearDialogOpen = false;
  @state() clearDialogSessionId: string | null = null;
  @state() sessionSearch = "";
  @state() chatSending = false;
  @state() providerHealth: ProviderHealthState | null = null;
  @state() chatResumePending = false;
  @state() plugins: PluginInfo[] = [];
  @state() pluginFilter: "all" | "ai-provider" | "database" | "runtime" | "connector" | "feature" = "all";
  @state() pluginSearch = "";
  @state() accountsShowAll = false;
  @state() pluginSettingsOpen: Set<string> = new Set();
  @state() activeAppPluginId: string | null = null;
  @state() appTabsExpanded = false;
  @state() appActionBusy = false;
  @state() appActionStatus: string | null = null;
  @state() appsDetailReady = true;
  @state() polymarketMarket = "";
  @state() polymarketOutcome = "";
  @state() polymarketAmount = "";
  @state() skills: SkillInfo[] = [];
  @state() logs: LogEntry[] = [];
  @state() authRequired = false;
  @state() pairingEnabled = false;
  @state() pairingExpiresAt: number | null = null;
  @state() pairingCodeInput = "";
  @state() pairingError: string | null = null;
  @state() pairingBusy = false;

  // Chrome extension state
  @state() extensionStatus: ExtensionStatus | null = null;
  @state() extensionChecking = false;

  // Wallet / Inventory state
  @state() walletAddresses: WalletAddresses | null = null;
  @state() walletConfig: WalletConfigStatus | null = null;
  @state() polymarketPortfolio: PolymarketPortfolioResponse | null = null;
  @state() walletBalances: WalletBalancesResponse | null = null;
  @state() walletNfts: WalletNftsResponse | null = null;
  @state() walletLoading = false;
  @state() walletNftsLoading = false;
  @state() inventoryView: "tokens" | "nfts" = "tokens";
  @state() inventorySort: "chain" | "symbol" | "value" = "value";
  @state() walletError: string | null = null;
  @state() walletAccountUsername: string | null = null;
  @state() walletConnectMode: "choose" | "generate" | "import" | "connect" = "choose";
  @state() walletConnectChain: WalletChain = "both";
  @state() walletImportChain: "evm" | "solana" = "evm";
  @state() walletImportKey = "";
  @state() selectedWalletLauncher: string | null = null;
  @state() walletConnectOpen = false;
  @state() walletConnectBusy = false;
  @state() walletConnectStatus: string | null = null;
  @state() deviceProfile: "standard" | "seeker" = "standard";
  @state() securitySpendGuardEnabled = true;
  @state() securityRequireSpendConfirm = true;
  @state() securityRequireExecuteConfirm = true;
  @state() securityBetDailyLimitUsd = 50;
  @state() securityBetPerTradeLimitUsd = 20;
  @state() securityBetCooldownSec = 30;
  @state() securityAuditActions: SecurityAuditAction[] = [];
  @state() pluginExecutionToggles: Record<string, boolean> = {};

  // Onboarding wizard state
  @state() onboardingStep = 0;
  @state() onboardingOptions: OnboardingOptions | null = null;
  @state() onboardingName = "";
  @state() onboardingCustomAccent = "";
  @state() onboardingStyle = "";
  @state() onboardingProvider = "";
  @state() onboardingApiKey = "";
  @state() onboardingTelegramToken = "";
  @state() onboardingDiscordToken = "";
  @state() onboardingFinishing = false;
  @state() providerSetupApplying = false;
  @state() profileImageUrl = "/pfp.jpg";
  @state() profileAccent = "#f57a3b";
  @state() userDisplayName = "@you";
  @state() userNameChangeLockedUntil: number | null = null;
  @state() accountNameInput = "";
  @state() nameValidationMessage: string | null = null;
  @state() styleSettingsOpen = false;
  @state() styleUpdateBusy = false;
  @state() styleUpdateStatus: string | null = null;
  @state() chatShowAllMessages = false;
  @state() chatShowJumpToLatest = false;
  @state() actionConfirmOpen = false;
  @state() actionConfirmTitle = "";
  @state() actionConfirmBody = "";
  @state() actionConfirmButton = "Confirm";
  @state() actionConfirmDanger = false;
  @state() actionConfirmBusy = false;
  @state() avatarCustomizeOpen = false;
  @state() characterImageByName: Record<string, string> = {};
  @state() uiNotice: string | null = null;
  @state() sensitiveFieldVisible: Record<string, boolean> = {};
  private chatInput = "";

  private pendingActionConfirm: (() => Promise<void> | void) | null = null;
  private pendingActionCancel: (() => void) | null = null;
  private inFlightChatAbort: AbortController | null = null;
  private activeChatRequestText: string | null = null;
  private pausedChatRequestText: string | null = null;
  private uiNoticeTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly chatTimeFormatter = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" });
  private readonly sessionUpdatedFormatter = new Intl.DateTimeFormat([], {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  private chatTimeCache = new Map<number, string>();
  private sessionUpdatedLabelCache = new Map<number, string>();
  private visibleSessionsCache: {
    sourceRef: ChatSession[] | null;
    search: string;
    result: ChatSession[];
  } = { sourceRef: null, search: "", result: [] };
  private topVisibleSessionsCache: {
    sourceRef: ChatSession[] | null;
    limit: number;
    result: ChatSession[];
  } = { sourceRef: null, limit: 0, result: [] };
  private curatedAppsCache: {
    sourceRef: PluginInfo[] | null;
    result: Array<{ app: AppEntry; plugin: PluginInfo | null }>;
  } = { sourceRef: null, result: [] };
  private pluginsLoadedAt = 0;
  private pluginsRefreshRaf: number | null = null;
  private pluginsRefreshTimeout: ReturnType<typeof setTimeout> | null = null;
  private appsDetailReadyRaf: number | null = null;
  private chatAutoScrollRaf: number | null = null;
  private chatAutoScrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private chatScrollRaf: number | null = null;
  private chatJumpSuppressUntil = 0;
  private skillsLoadedAt = 0;
  private logsLoadedAt = 0;
  private walletConfigLoadedAt = 0;
  private inventoryLoadedAt = 0;
  private extensionCheckedAt = 0;
  private tabDataLoadRaf: number | null = null;

  static styles = css`
    :host {
      --font-body: "Space Grotesk", "Avenir Next", "Segoe UI", "Helvetica Neue", sans-serif;
      --mono: "IBM Plex Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace;
      --text: #2f2521;
      --text-strong: #201713;
      --muted: #6f625b;
      --border: #d9c5b5;
      --border-soft: #e7d8cd;
      --surface: rgba(255, 255, 255, 0.72);
      --bg: #fff7f1;
      --card: #fffdf9;
      --bg-muted: #f5ece4;
      --bg-hover: rgba(245, 122, 59, 0.08);
      --ok: #1d8658;
      --warn: #a86d08;
      display: block;
      min-height: 100vh;
      min-height: 100dvh;
      font-family: var(--font-body);
      color: var(--text);
      background: var(--app-shell-background,
        radial-gradient(circle at 8% 6%, rgba(255, 255, 255, 0.82), transparent 30%),
        radial-gradient(circle at 92% 4%, rgba(255, 228, 188, 0.5), transparent 28%),
        radial-gradient(circle at 75% 90%, rgba(255, 210, 176, 0.24), transparent 26%),
        repeating-linear-gradient(125deg, rgba(255, 255, 255, 0.06) 0px, rgba(255, 255, 255, 0.06) 1px, transparent 1px, transparent 16px),
        linear-gradient(180deg, #fff9ef 0%, #f8f0e7 42%, #f4ebe3 100%)
      );
    }

    /* Layout */
    .app-shell {
      position: relative;
      max-width: 1160px;
      margin: 0 auto;
      padding: 22px max(24px, env(safe-area-inset-right)) max(6px, env(safe-area-inset-bottom)) max(24px, env(safe-area-inset-left));
    }

    .app-shell::before {
      content: "";
      position: absolute;
      inset: -40px;
      pointer-events: none;
      z-index: 0;
      background:
        radial-gradient(circle at 15% 18%, color-mix(in srgb, var(--accent) 18%, transparent) 0%, transparent 36%),
        radial-gradient(circle at 82% 14%, rgba(255, 235, 206, 0.56) 0%, transparent 34%),
        radial-gradient(circle at 78% 86%, rgba(245, 122, 59, 0.14) 0%, transparent 32%);
    }

    .app-shell::after {
      content: "";
      position: absolute;
      inset: -40px;
      pointer-events: none;
      z-index: 0;
      background:
        radial-gradient(circle at 10% 84%, rgba(255, 255, 255, 0.34), transparent 34%),
        radial-gradient(circle at 92% 22%, rgba(255, 255, 255, 0.26), transparent 36%);
      opacity: 0.06;
    }

    .app-shell > * {
      position: relative;
      z-index: 1;
    }

    .bg-brand-layer {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    .bg-brand-pattern {
      position: absolute;
      right: 1.5%;
      top: 10%;
      width: 220px;
      height: 220px;
      border-radius: 24px;
      opacity: 0.12;
      background:
        radial-gradient(circle at 25% 25%, color-mix(in srgb, var(--accent) 78%, #fff) 0 8px, transparent 9px),
        radial-gradient(circle at 75% 75%, color-mix(in srgb, var(--accent) 78%, #fff) 0 8px, transparent 9px),
        repeating-linear-gradient(
          45deg,
          color-mix(in srgb, var(--accent) 30%, #fff) 0 2px,
          transparent 2px 14px
        ),
        repeating-linear-gradient(
          -45deg,
          color-mix(in srgb, var(--accent) 24%, #fff) 0 2px,
          transparent 2px 14px
        );
      box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.4), 0 10px 26px rgba(71, 48, 25, 0.08);
      transform: rotate(6deg);
    }

    .bg-brand-mark {
      position: absolute;
      border-radius: 999px;
      object-fit: cover;
      border: 1px solid rgba(255, 255, 255, 0.45);
      box-shadow: 0 16px 32px rgba(71, 48, 25, 0.08);
      opacity: 0.09;
      filter: saturate(0.85) contrast(1.08);
      transform: rotate(-8deg);
    }

    .bg-brand-mark.a {
      width: 220px;
      height: 220px;
      left: 3%;
      bottom: 1%;
    }

    @media (max-width: 980px) {
      .bg-brand-pattern {
        display: none;
      }
    }

    .pairing-shell {
      max-width: 560px;
      margin: 60px auto;
      padding: 24px;
      border: 1px solid var(--border);
      background: var(--card);
      border-radius: 10px;
    }

    .pairing-title {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 8px;
      color: var(--text-strong);
    }

    .pairing-sub {
      color: var(--muted);
      margin-bottom: 16px;
      line-height: 1.4;
    }

    .pairing-input {
      width: 100%;
      padding: 10px 12px;
      border-radius: 8px;
      border: 1px solid var(--border);
      background: var(--bg-muted);
      color: var(--text);
      font-size: 14px;
    }

    .pairing-actions {
      margin-top: 12px;
      display: flex;
      gap: 10px;
    }

    .pairing-error {
      margin-top: 10px;
      color: #c94f4f;
      font-size: 13px;
    }

    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(16, 12, 10, 0.45);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1200;
      padding: 18px;
    }

    .modal-card {
      width: min(520px, 100%);
      max-height: min(88dvh, 760px);
      border: 1px solid var(--border);
      border-radius: 16px;
      background: linear-gradient(165deg, rgba(255,255,255,0.96), rgba(255,247,236,0.9));
      box-shadow: 0 20px 50px rgba(58, 37, 18, 0.3);
      overflow: hidden;
    }

    .modal-head {
      padding: 14px 16px 10px;
      border-bottom: 1px solid var(--border-soft);
      font-size: 16px;
      font-weight: 700;
      color: var(--text-strong);
    }

    .modal-body {
      padding: 14px 16px;
      font-size: 13px;
      line-height: 1.5;
      color: var(--text);
      display: grid;
      gap: 10px;
      overflow-y: auto;
    }

    .wallet-connect-sheet .setup-card {
      margin-top: 0 !important;
      padding: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
    }

    .wallet-connect-sheet .setup-card h3 {
      margin: 0 0 6px 0;
      font-size: 15px;
    }

    .wallet-connect-sheet .setup-card p {
      margin: 0 0 10px 0;
    }

    .modal-backdrop.mobile-wallet-modal {
      background:
        radial-gradient(circle at 14% 16%, color-mix(in srgb, var(--accent) 14%, transparent) 0%, transparent 42%),
        radial-gradient(circle at 84% 86%, color-mix(in srgb, var(--accent) 12%, transparent) 0%, transparent 48%),
        color-mix(in srgb, var(--accent) 10%, var(--bg));
      backdrop-filter: none;
      padding: 0;
      align-items: stretch;
      justify-content: stretch;
      z-index: 2200;
    }

    .modal-backdrop.mobile-wallet-modal .modal-card {
      width: 100%;
      max-width: none;
      height: 100dvh;
      max-height: none;
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent) 8%, var(--bg)) 0%,
          var(--bg) 100%
        );
      border: 0;
      border-radius: 0;
      box-shadow: none;
      color: var(--text);
      display: flex;
      flex-direction: column;
    }

    .modal-backdrop.mobile-wallet-modal .modal-head {
      color: var(--text-strong);
      border-bottom: 1px solid var(--border-soft);
      background: color-mix(in srgb, var(--accent) 8%, var(--bg));
      position: sticky;
      top: 0;
      z-index: 2;
      padding-top: max(14px, env(safe-area-inset-top));
    }

    .modal-backdrop.mobile-wallet-modal .modal-body {
      color: var(--text);
      padding: 0 max(14px, env(safe-area-inset-right)) max(14px, env(safe-area-inset-bottom)) max(14px, env(safe-area-inset-left));
      overflow-y: auto;
      flex: 1;
    }

    .modal-backdrop.mobile-wallet-modal .setup-card {
      margin: 0;
      border: 0;
      border-radius: 0;
      background: transparent;
      box-shadow: none;
      padding: 14px 0 0;
    }

    .modal-backdrop.mobile-wallet-modal .setup-card p,
    .modal-backdrop.mobile-wallet-modal .setup-card .hint,
    .modal-backdrop.mobile-wallet-modal .setup-card [style*="color:var(--muted)"] {
      color: var(--muted) !important;
    }

    .modal-backdrop.mobile-wallet-modal .setup-card h3 {
      color: var(--text-strong);
    }

    .modal-backdrop.mobile-wallet-modal .plugin-settings-body {
      background: color-mix(in srgb, var(--accent) 4%, var(--card));
      border-color: var(--border-soft);
      box-shadow: none;
    }

    .modal-backdrop.mobile-wallet-modal .plugin-settings-body input,
    .modal-backdrop.mobile-wallet-modal .setup-card input {
      background: var(--bg);
      border-color: var(--border);
      color: var(--text);
    }

    .modal-backdrop.mobile-wallet-modal .plugin-secondary-btn {
      border-color: var(--border);
      color: var(--text-strong);
      background: var(--card);
    }

    .modal-backdrop.mobile-wallet-modal .plugin-secondary-btn:hover {
      border-color: color-mix(in srgb, var(--accent) 36%, var(--border));
      background: color-mix(in srgb, var(--accent) 8%, var(--card));
      color: var(--text-strong);
    }

    .wallet-launcher-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.88);
    }

    .modal-backdrop.mobile-wallet-modal .wallet-launcher-card {
      border-color: var(--border);
      background: color-mix(in srgb, var(--accent) 6%, var(--card));
    }

    .modal-backdrop.mobile-wallet-modal .inventory-subtab {
      border-color: var(--border);
      color: var(--text-strong);
      background: var(--card);
    }

    .modal-backdrop.mobile-wallet-modal .inventory-subtab.active {
      border-color: color-mix(in srgb, var(--accent) 60%, var(--border));
      background: color-mix(in srgb, var(--accent) 12%, var(--card));
      color: var(--text-strong);
    }

    .mobile-wallet-close {
      width: 30px;
      height: 30px;
      border-radius: 999px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text-strong);
      font-size: 18px;
      line-height: 1;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }

    .mobile-wallet-close:hover {
      background: color-mix(in srgb, var(--accent) 10%, var(--card));
      border-color: color-mix(in srgb, var(--accent) 30%, var(--border));
    }

    .modal-warning {
      border: 1px solid rgba(170, 80, 42, 0.45);
      background: rgba(170, 80, 42, 0.1);
      border-radius: 10px;
      padding: 10px 11px;
      color: #6b2c17;
      font-size: 12px;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      padding: 12px 16px 14px;
      border-top: 1px solid var(--border-soft);
      background: rgba(255,255,255,0.6);
    }

    /* Header */
    .header-shell {
      position: relative;
      border-radius: 24px;
      padding: 2px;
      background: linear-gradient(
        130deg,
        color-mix(in srgb, var(--accent) 30%, #fff) 0%,
        rgba(255, 255, 255, 0.86) 28%,
        rgba(255, 255, 255, 0.9) 72%,
        color-mix(in srgb, var(--accent) 22%, #fff) 100%
      );
      box-shadow:
        0 0 0 1px rgba(255, 255, 255, 0.55),
        0 14px 30px rgba(75, 52, 25, 0.12),
        0 0 24px color-mix(in srgb, var(--accent) 20%, transparent);
    }

    .header-shell::before {
      content: "";
      position: absolute;
      inset: -8px;
      pointer-events: none;
      border-radius: 30px;
      background:
        radial-gradient(circle at 8% 20%, color-mix(in srgb, var(--accent) 14%, transparent) 0, transparent 42%),
        radial-gradient(circle at 92% 80%, color-mix(in srgb, var(--accent) 12%, transparent) 0, transparent 44%);
      opacity: 0.7;
      z-index: 0;
    }

    .header-shell > header {
      position: relative;
      z-index: 1;
    }

    header {
      position: relative;
      overflow: hidden;
      border: 1px solid var(--border);
      border-radius: 20px;
      padding: 16px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: linear-gradient(135deg, rgba(255, 255, 255, 0.92), rgba(255, 248, 238, 0.8));
      box-shadow: 0 10px 24px rgba(75, 52, 25, 0.1);
      animation: shellFade 260ms ease-out both;
    }

    header::before {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      background:
        radial-gradient(120px 60px at 12% -10%, rgba(255, 255, 255, 0.58), transparent 70%),
        radial-gradient(120px 60px at 88% 110%, rgba(255, 255, 255, 0.38), transparent 70%),
        repeating-linear-gradient(
          115deg,
          color-mix(in srgb, var(--accent) 10%, transparent) 0 1px,
          transparent 1px 14px
        );
      opacity: 0.45;
      mix-blend-mode: multiply;
    }

    header::after {
      content: "";
      position: absolute;
      inset: 0;
      pointer-events: none;
      border-radius: inherit;
      box-shadow:
        inset 0 0 0 1px color-mix(in srgb, var(--accent) 22%, #fff),
        inset 0 14px 22px rgba(255, 255, 255, 0.2);
      opacity: 0.55;
    }

    header > * {
      position: relative;
      z-index: 1;
    }

    .logo {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: var(--text-strong);
      text-decoration: none;
    }

    .brand-block {
      display: flex;
      align-items: center;
      gap: 10px;
      padding-right: 8px;
      border-right: 1px solid var(--border-soft);
      margin-right: 2px;
    }

    .brand-mark {
      width: 26px;
      height: 26px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      object-fit: cover;
      box-shadow: 0 4px 10px rgba(63, 40, 20, 0.14);
    }

    .brand-copy {
      display: flex;
      flex-direction: column;
      line-height: 1.05;
    }

    .brand-title {
      font-size: 12px;
      font-weight: 800;
      color: var(--text-strong);
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .brand-sub {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.02em;
    }

    .logo:hover {
      color: var(--accent);
      text-decoration: none;
    }

    .status-bar {
      display: flex;
      align-items: center;
      gap: 12px;
      font-size: 13px;
    }

    .status-pill {
      padding: 4px 10px;
      border: 1px solid var(--border);
      border-radius: 999px;
      font-size: 11px;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      font-family: var(--mono);
    }

    .status-pill.running { border-color: var(--ok); color: var(--ok); }
    .status-pill.paused { border-color: var(--warn); color: var(--warn); }
    .status-pill.stopped { border-color: var(--muted); color: var(--muted); }
    .status-pill.restarting { border-color: var(--warn); color: var(--warn); }
    .status-pill.error { border-color: var(--danger, #e74c3c); color: var(--danger, #e74c3c); }

    .header-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .header-chip {
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.7);
      border-radius: 999px;
      padding: 4px 9px;
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      font-family: var(--mono);
    }

    .header-chip b {
      color: var(--text-strong);
      font-weight: 700;
      text-transform: none;
      letter-spacing: normal;
    }

    .header-chip.ok {
      border-color: rgba(32, 125, 82, 0.4);
      background: rgba(32, 125, 82, 0.08);
    }

    .header-chip .verify-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      display: inline-block;
      margin-right: 6px;
      vertical-align: middle;
      background: var(--muted);
    }

    .header-chip .verify-dot.on {
      background: var(--ok);
      box-shadow: 0 0 0 2px rgba(32, 125, 82, 0.16);
    }

    .lifecycle-btn {
      padding: 5px 12px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      border-radius: 999px;
      font-size: 11px;
      font-family: var(--mono);
    }

    .lifecycle-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Wallet icon */
    .wallet-wrapper {
      position: relative;
      display: inline-flex;
    }

    .wallet-btn {
      padding: 5px 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
      border-radius: 999px;
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .wallet-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .wallet-tooltip {
      display: none;
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 6px;
      padding: 10px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      z-index: 100;
      min-width: 280px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    .wallet-wrapper:hover .wallet-tooltip {
      display: block;
    }

    .wallet-addr-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      padding: 4px 0;
    }

    .wallet-addr-row + .wallet-addr-row {
      border-top: 1px solid var(--border);
    }

    .chain-label {
      font-weight: bold;
      font-size: 11px;
      min-width: 30px;
      font-family: var(--mono);
    }

    .wallet-addr-row code {
      font-size: 11px;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--mono);
    }

    .copy-btn {
      padding: 2px 6px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 10px;
      font-family: var(--mono);
    }

    .copy-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Inventory */
    .inv-toolbar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      padding: 6px 8px;
      background: linear-gradient(165deg, rgba(255,255,255,0.9), rgba(255,248,239,0.8));
    }

    .inv-toolbar-left,
    .inv-toolbar-right {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .inv-sort-label {
      font-size: 9px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-weight: 600;
    }

    .inv-refresh-btn {
      margin-top: 0;
      font-size: 10px;
      padding: 3px 10px;
      min-height: 30px;
    }

    @media (max-width: 720px) {
      .inv-toolbar {
        align-items: flex-start;
      }

      .inv-toolbar-right {
        width: 100%;
        justify-content: space-between;
      }
    }

    .inventory-subtab {
      display: inline-block;
      padding: 4px 16px;
      cursor: pointer;
      border: 1px solid var(--border);
      background: var(--bg);
      font-size: 13px;
      font-family: var(--mono);
    }

    .inventory-subtab.active {
      border-color: var(--accent);
      color: var(--accent);
      font-weight: bold;
    }

    .inventory-subtab:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .sort-btn {
      padding: 3px 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 11px;
      font-family: var(--mono);
    }

    .sort-btn.active {
      border-color: var(--accent);
      color: var(--accent);
    }

    .sort-btn:hover { border-color: var(--accent); color: var(--accent); }

    /* Scrollable token table */
    .token-table-wrap {
      margin-top: 12px;
      border: 1px solid var(--border);
      border-radius: 14px;
      max-height: 60vh;
      overflow-y: auto;
      background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(255,248,240,0.82));
    }

    .portfolio-overview {
      margin-top: 6px;
      padding: 12px;
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      background: linear-gradient(165deg, rgba(255, 255, 255, 0.92), rgba(255, 248, 239, 0.82));
      display: flex;
      flex-direction: column;
      gap: 9px;
      box-shadow: 0 12px 24px rgba(74, 49, 26, 0.08);
    }

    .portfolio-section {
      margin-top: 10px;
      padding: 10px;
      border: 1px solid var(--border-soft);
      border-radius: 14px;
      background: linear-gradient(165deg, rgba(255, 255, 255, 0.9), rgba(255, 248, 239, 0.78));
      box-shadow: 0 10px 22px rgba(74, 49, 26, 0.07);
      contain: layout paint;
    }

    .portfolio-section + .portfolio-section {
      margin-top: 18px;
    }

    .portfolio-section-divider {
      height: 0;
      border-top: 2px solid color-mix(in srgb, var(--accent) 34%, var(--border-soft));
      margin: 14px 4px;
      opacity: 0.9;
    }

    .portfolio-section-title {
      font-size: 13px;
      color: var(--text-strong);
      font-weight: 800;
      text-transform: none;
      letter-spacing: 0.01em;
      margin-bottom: 4px;
    }

    .portfolio-subsection-title {
      font-size: 12px;
      color: var(--text-strong);
      font-weight: 800;
      text-transform: none;
      letter-spacing: 0.01em;
    }

    .portfolio-polymarket-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      padding: 9px 11px;
      border: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border-soft));
      border-radius: 12px;
      background: linear-gradient(
        155deg,
        color-mix(in srgb, var(--accent) 14%, #fff) 0%,
        rgba(255, 255, 255, 0.92) 100%
      );
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.85);
    }

    .portfolio-polymarket-title {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted);
      letter-spacing: 0.02em;
      text-transform: uppercase;
    }

    .portfolio-polymarket-tag {
      border: 1px solid color-mix(in srgb, var(--accent) 40%, var(--border-soft));
      border-radius: 999px;
      padding: 3px 9px;
      font-size: 10px;
      color: var(--accent);
      text-transform: none;
      letter-spacing: 0.05em;
      font-family: var(--mono);
      font-weight: 500;
      background: rgba(255, 255, 255, 0.7);
      white-space: nowrap;
    }

    .portfolio-balance-hero {
      border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border-soft));
      border-radius: 12px;
      padding: 10px 12px;
      background: linear-gradient(
        160deg,
        color-mix(in srgb, var(--accent) 10%, #fff) 0%,
        rgba(255, 255, 255, 0.88) 100%
      );
    }

    .portfolio-balance-label {
      font-size: 10px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      margin-bottom: 2px;
    }

    .portfolio-balance-value {
      font-size: 28px;
      line-height: 1.05;
      font-weight: 800;
      color: var(--text-strong);
      font-family: var(--mono);
    }

    .portfolio-kpis {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 8px;
    }

    .portfolio-kpi {
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background: var(--card);
      padding: 10px;
      transition: transform 120ms ease, box-shadow 120ms ease;
    }
    .portfolio-kpi:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(74, 49, 26, 0.08);
    }

    .portfolio-kpi-label {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }

    .portfolio-kpi-value {
      font-size: 18px;
      font-weight: 700;
      color: var(--text-strong);
    }

    .portfolio-chain-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .portfolio-chain-row {
      display: grid;
      grid-template-columns: 82px minmax(0, 1fr) auto;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .portfolio-bar {
      height: 8px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 16%, #f0ede7);
      overflow: hidden;
      position: relative;
    }

    .portfolio-bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), var(--accent-hover));
    }

    .token-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }

    .token-table thead {
      position: sticky;
      top: 0;
      z-index: 1;
      background: var(--bg);
    }

    .token-table th {
      text-align: left;
      padding: 8px 12px;
      font-size: 11px;
      font-weight: 600;
      color: var(--muted);
      border-bottom: 1px solid var(--border);
      text-transform: uppercase;
      letter-spacing: 0.04em;
      cursor: pointer;
      user-select: none;
      white-space: nowrap;
    }

    .token-table th:hover { color: var(--text); }
    .token-table th.sorted { color: var(--accent); }
    .token-table th.r { text-align: right; }

    .token-table td {
      padding: 7px 12px;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .token-table tbody tr {
      transition: background-color 120ms ease;
    }

    .token-table tbody tr:hover {
      background: rgba(245, 122, 59, 0.08);
    }

    .token-table tr:last-child td {
      border-bottom: none;
    }

    .token-table .chain-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      text-align: center;
      line-height: 16px;
      font-size: 9px;
      font-weight: bold;
      font-family: var(--mono);
      flex-shrink: 0;
      vertical-align: middle;
    }

    .token-logo {
      width: 18px;
      height: 18px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      object-fit: cover;
      display: inline-block;
      background: #fff;
    }

    .chain-icon.eth { background: #627eea; color: #fff; }
    .chain-icon.base { background: #0052ff; color: #fff; }
    .chain-icon.arb { background: #28a0f0; color: #fff; }
    .chain-icon.op { background: #ff0420; color: #fff; }
    .chain-icon.pol { background: #8247e5; color: #fff; }
    .chain-icon.sol { background: #9945ff; color: #fff; }

    .td-symbol {
      font-weight: bold;
      font-family: var(--mono);
    }

    .td-name {
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 160px;
    }

    .td-balance {
      font-family: var(--mono);
      text-align: right;
      white-space: nowrap;
    }

    .td-value {
      font-family: var(--mono);
      text-align: right;
      color: var(--muted);
      white-space: nowrap;
    }

    /* NFTs */
    .nft-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 10px;
      margin-top: 12px;
      max-height: 60vh;
      overflow-y: auto;
    }

    .nft-card {
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(255,248,240,0.8));
      overflow: hidden;
      transition: transform 140ms ease, box-shadow 140ms ease, border-color 140ms ease;
    }

    .nft-card:hover {
      transform: translateY(-2px);
      border-color: var(--accent);
      box-shadow: 0 12px 24px rgba(74, 49, 26, 0.1);
    }

    .nft-card img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      display: block;
      background: var(--bg-muted);
    }

    .nft-card .nft-info {
      padding: 6px 8px;
    }

    .nft-card .nft-name {
      font-size: 11px;
      font-weight: bold;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nft-card .nft-collection {
      font-size: 10px;
      color: var(--muted);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .nft-card .nft-chain {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: var(--muted);
      margin-top: 2px;
    }

    /* Setup cards */
    .setup-card {
      border: 1px solid var(--border);
      border-radius: 14px;
      background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(255,248,239,0.8));
      padding: 20px;
      margin-top: 16px;
      box-shadow: 0 12px 24px rgba(74, 49, 26, 0.08);
    }

    .setup-card h3 {
      margin: 0 0 8px 0;
      font-size: 15px;
    }

    .setup-card p {
      font-size: 12px;
      color: var(--muted);
      margin: 0 0 12px 0;
      line-height: 1.5;
    }

    .setup-card ol {
      margin: 0 0 14px 0;
      padding-left: 20px;
      font-size: 12px;
      color: var(--muted);
      line-height: 1.7;
    }

    .setup-card a {
      color: var(--accent);
    }

    .setup-input-row {
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .setup-input-row input {
      flex: 1;
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--bg);
      font-size: 12px;
      font-family: var(--mono);
    }

    .key-export-box {
      margin-top: 12px;
      padding: 12px;
      border: 1px solid var(--danger, #e74c3c);
      background: var(--bg-muted);
      font-family: var(--mono);
      font-size: 11px;
      word-break: break-all;
      line-height: 1.6;
    }

    /* Layout */
    .layout {
      display: grid;
      grid-template-columns: 230px minmax(0, 1fr) 270px;
      gap: 24px;
      padding: 20px 0 30px;
    }

    .mobile-tabbar {
      display: none;
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      padding: 8px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(255, 246, 236, 0.78));
      box-shadow: 0 8px 20px rgba(75, 52, 25, 0.07);
      gap: 8px;
      overflow-x: auto;
      white-space: nowrap;
      margin-top: 10px;
      position: sticky;
      top: 8px;
      z-index: 20;
    }

    .mobile-tabbar a {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 38px;
      padding: 0 12px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      color: var(--text);
      text-decoration: none;
      font-size: 12px;
      background: rgba(255, 255, 255, 0.84);
    }

    .mobile-tabbar a.active {
      color: var(--accent-foreground);
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 8px 18px color-mix(in srgb, var(--accent) 24%, transparent);
    }

    .sidebar {
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 14px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(255, 246, 236, 0.78));
      box-shadow: 0 12px 30px rgba(75, 52, 25, 0.08);
      height: fit-content;
      position: sticky;
      top: 18px;
      animation: shellFade 300ms ease-out both;
    }

    /* Navigation */
    nav {
      display: grid;
      gap: 16px;
    }

    .nav-group {
      display: grid;
      gap: 6px;
    }

    .nav-label {
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--muted);
    }

    nav a {
      display: block;
      padding: 9px 11px;
      color: var(--text);
      text-decoration: none;
      font-size: 12px;
      letter-spacing: 0.02em;
      border: 1px solid var(--border-soft);
      border-radius: 11px;
      background: rgba(255, 255, 255, 0.74);
      transition: transform 120ms ease, border-color 120ms ease, background-color 120ms ease;
    }

    nav a:hover {
      border-color: var(--accent);
      background: var(--bg-hover);
      transform: translateY(-1px);
      text-decoration: none;
    }

    nav a.active {
      color: var(--accent-foreground);
      background: var(--accent);
      border-color: var(--accent);
      box-shadow: 0 8px 20px color-mix(in srgb, var(--accent) 28%, transparent);
    }

    /* Main content */
    main.main {
      min-height: 60vh;
      border: 1px solid var(--border);
      border-radius: 18px;
      background: linear-gradient(165deg, rgba(255, 255, 255, 0.92), rgba(255, 249, 242, 0.8));
      padding: 20px;
      box-shadow: 0 20px 45px rgba(75, 52, 25, 0.09);
      animation: shellFade 340ms ease-out both;
      overflow-x: hidden;
      contain: layout paint;
    }

    .context-rail {
      border: 1px solid var(--border);
      border-radius: 16px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.9), rgba(255, 246, 236, 0.78));
      padding: 12px;
      box-shadow: 0 12px 30px rgba(75, 52, 25, 0.08);
      height: fit-content;
      position: sticky;
      top: 18px;
      animation: shellFade 380ms ease-out both;
      contain: layout paint;
    }

    .rail-stack {
      display: grid;
      gap: 10px;
    }

    .rail-card {
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(165deg, rgba(255, 255, 255, 0.88), rgba(255, 247, 236, 0.78));
      box-shadow: 0 10px 22px rgba(74, 49, 26, 0.07);
    }

    .rail-title {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--muted);
      margin-bottom: 6px;
    }

    .rail-strong {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-strong);
      line-height: 1.3;
    }

    .rail-sub {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
      line-height: 1.4;
    }

    .status-badge-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px;
      margin-top: 8px;
    }

    .status-badge-grid .status-badge:last-child {
      grid-column: 1 / -1;
    }

    .status-badge {
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      padding: 7px 8px;
      background: rgba(255, 255, 255, 0.88);
      font-size: 11px;
      color: var(--muted);
      line-height: 1.2;
      transition: transform 120ms ease;
    }
    .status-badge:hover { transform: translateY(-1px); }

    .status-badge b {
      display: block;
      color: var(--text-strong);
      font-size: 12px;
      margin-top: 2px;
    }

    .status-badge.ok {
      border-color: rgba(32, 125, 82, 0.4);
      background: rgba(32, 125, 82, 0.1);
    }

    .status-badge.warn {
      border-color: rgba(156, 100, 0, 0.4);
      background: rgba(156, 100, 0, 0.08);
    }

    .status-badge.risk {
      border-color: rgba(140, 47, 33, 0.4);
      background: rgba(140, 47, 33, 0.08);
    }

    .rail-row {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 8px;
    }

    .rail-detail-list {
      margin-top: 9px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.72);
      overflow: hidden;
    }

    .rail-detail-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      padding: 7px 9px;
      min-height: 30px;
      font-size: 11px;
      border-bottom: 1px solid var(--border-soft);
    }

    .rail-detail-item:last-child {
      border-bottom: 0;
    }

    .rail-detail-k {
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      font-size: 10px;
      font-family: var(--mono);
      white-space: nowrap;
    }

    .rail-detail-v {
      color: var(--text-strong);
      font-family: var(--mono);
      text-align: right;
      flex: 1 1 auto;
      min-width: 0;
      max-width: 150px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .rail-btn {
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.82);
      color: var(--text);
      border-radius: 999px;
      padding: 5px 11px;
      font-size: 11px;
      cursor: pointer;
      line-height: 1.2;
      transition: transform 120ms ease, border-color 120ms ease, color 120ms ease, background-color 120ms ease;
    }

    .rail-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(245, 122, 59, 0.08);
    }

    @media (max-width: 1180px) {
      .layout {
        grid-template-columns: 220px minmax(0, 1fr);
      }

      .context-rail {
        grid-column: 1 / -1;
        position: static;
      }

      .rail-stack {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 820px) {
      .layout {
        grid-template-columns: 1fr;
      }

      .sidebar {
        display: none;
      }

      .mobile-tabbar {
        display: flex;
      }

      .nav-group {
        gap: 4px;
      }

      .nav-label {
        font-size: 10px;
      }

      .context-rail {
        display: block;
        position: static;
      }

      .rail-stack {
        grid-template-columns: 1fr;
      }
    }

    h2 {
      font-size: 21px;
      font-weight: 700;
      margin: 0 0 7px 0;
      letter-spacing: 0.01em;
      color: var(--text-strong);
    }

    .subtitle {
      color: var(--muted);
      font-size: 12px;
      letter-spacing: 0.02em;
      margin-bottom: 20px;
    }

    /* Footer */
    footer {
      border-top: 1px solid var(--border-soft);
      padding: 16px 0;
      font-size: 12px;
      color: var(--muted);
      text-align: center;
    }

    /* Onboarding */
    .onboarding {
      max-width: 500px;
      margin: 34px auto;
      padding: 22px 18px;
      border: 1px solid var(--border-soft);
      border-radius: 20px;
      background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(255,248,239,0.8));
      box-shadow: 0 18px 36px rgba(74, 49, 26, 0.08);
      text-align: center;
    }

    .onboarding h1 {
      font-size: 24px;
      font-weight: normal;
      margin-bottom: 8px;
    }

    .onboarding p {
      color: var(--muted);
      margin-bottom: 24px;
    }

    .onboarding-avatar {
      width: 140px;
      height: 140px;
      border-radius: 50%;
      object-fit: cover;
      border: 3px solid var(--border);
      margin: 0 auto 20px;
      display: block;
    }

    .onboarding-welcome-title {
      font-family: var(--font-body);
      font-size: 28px;
      font-weight: normal;
      margin-bottom: 4px;
      color: var(--text-strong);
    }

    .onboarding-welcome-sub {
      font-style: italic;
      color: var(--muted);
      font-size: 14px;
      margin-bottom: 32px;
    }

    .onboarding-speech {
      background: linear-gradient(170deg, rgba(255,255,255,0.96), rgba(255,247,236,0.86));
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 16px 20px;
      margin: 0 auto 24px;
      max-width: 360px;
      position: relative;
      font-size: 15px;
      color: var(--text);
      line-height: 1.5;
    }

    .onboarding-speech::after {
      content: "";
      position: absolute;
      top: -8px;
      left: 50%;
      transform: translateX(-50%) rotate(45deg);
      width: 14px;
      height: 14px;
      background: var(--card);
      border-left: 1px solid var(--border);
      border-top: 1px solid var(--border);
    }

    .onboarding-options {
      display: flex;
      flex-direction: column;
      gap: 8px;
      text-align: left;
    }

    .onboarding-character-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 10px;
    }

    .onboarding-character-card {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 10px;
      border: 1px solid var(--border);
      border-radius: 12px;
      background: linear-gradient(165deg, rgba(255,255,255,0.92), rgba(255,248,239,0.76));
      cursor: pointer;
      transition: border-color 120ms ease, transform 120ms ease, box-shadow 120ms ease;
    }

    .onboarding-character-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 22px rgba(74, 49, 26, 0.1);
      border-color: var(--accent);
    }

    .onboarding-character-card.selected {
      border-color: var(--accent);
      box-shadow: 0 0 0 2px rgba(245, 122, 59, 0.18);
    }

    .onboarding-character-avatar {
      width: 44px;
      height: 44px;
      border-radius: 10px;
      border: 1px solid var(--border-soft);
      object-fit: cover;
      background: var(--bg-muted);
      flex-shrink: 0;
    }

    .onboarding-option {
      padding: 12px 16px;
      border: 1px solid var(--border);
      border-radius: 12px;
      cursor: pointer;
      background: linear-gradient(165deg, rgba(255,255,255,0.9), rgba(255,248,239,0.74));
      transition: transform 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
    }

    .onboarding-option:hover {
      border-color: var(--accent);
      transform: translateY(-1px);
      box-shadow: 0 8px 18px rgba(74, 49, 26, 0.08);
    }

    .onboarding-option.selected {
      border-color: var(--accent);
      background: var(--accent-subtle);
    }

    .onboarding-option .label {
      font-weight: bold;
      font-size: 14px;
    }

    .onboarding-option .hint {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    .onboarding-input {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 14px;
      margin-top: 8px;
    }

    .onboarding-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .theme-swatch-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-top: 6px;
    }

    .theme-swatch {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: 2px solid var(--border-soft);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      line-height: 1;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
      transition: transform 100ms ease, border-color 100ms ease;
    }

    .theme-swatch:hover {
      transform: translateY(-1px);
      border-color: var(--text-strong);
    }

    .theme-swatch.selected {
      border-color: var(--text-strong);
      box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.12);
    }

    .btn {
      padding: 8px 24px;
      border: 1px solid var(--accent);
      background: linear-gradient(180deg, var(--accent), var(--accent-hover));
      color: var(--accent-foreground);
      cursor: pointer;
      font-size: 14px;
      margin-top: 20px;
      border-radius: 12px;
      font-weight: 700;
      letter-spacing: 0.02em;
      box-shadow: 0 10px 20px color-mix(in srgb, var(--accent) 30%, transparent);
      transition: transform 120ms ease, box-shadow 120ms ease, background-color 120ms ease;
    }

    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
      transform: translateY(-1px);
      box-shadow: 0 14px 26px color-mix(in srgb, var(--accent) 34%, transparent);
    }

    .btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .btn-outline {
      background: transparent;
      color: var(--accent);
    }

    .btn-outline:hover {
      background: var(--accent-subtle);
    }

    .btn-row {
      display: flex;
      gap: 8px;
      justify-content: center;
      margin-top: 20px;
    }

    .app-notice {
      margin-top: 10px;
      border: 1px solid color-mix(in srgb, var(--accent) 38%, var(--border-soft));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent) 16%, #fff) 0%,
          color-mix(in srgb, var(--accent) 10%, #fff) 100%
        );
      color: color-mix(in srgb, var(--accent) 72%, #2f2521);
      border-radius: 10px;
      padding: 8px 10px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.01em;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.62),
        0 6px 18px rgba(54, 34, 18, 0.08);
    }

    /* Chat */
    .chat-container {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 200px);
      min-height: 400px;
      position: relative;
      border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border-soft));
      border-radius: 18px;
      padding: 10px 11px;
      background:
        radial-gradient(circle at 10% -10%, color-mix(in srgb, var(--accent) 18%, #fff) 0%, transparent 34%),
        radial-gradient(circle at 96% 6%, rgba(255, 236, 210, 0.62) 0%, transparent 30%),
        radial-gradient(circle at 8% 92%, rgba(255, 255, 255, 0.38) 0%, transparent 30%),
        repeating-radial-gradient(
          circle at 92% 14%,
          color-mix(in srgb, var(--accent) 7%, transparent) 0 2px,
          transparent 2px 12px
        ),
        linear-gradient(165deg, rgba(255, 254, 250, 0.94), rgba(255, 246, 236, 0.9));
      box-shadow:
        inset 0 1px 0 rgba(255,255,255,0.86),
        inset 0 0 0 1px rgba(255,255,255,0.36),
        0 16px 34px rgba(74, 49, 26, 0.09);
      overflow: hidden;
    }

    .chat-container::before {
      content: "";
      position: absolute;
      right: -44px;
      top: -62px;
      width: 180px;
      height: 180px;
      border-radius: 24px;
      background:
        repeating-linear-gradient(
          45deg,
          color-mix(in srgb, var(--accent) 14%, transparent) 0 2px,
          transparent 2px 14px
        ),
        linear-gradient(135deg, rgba(255,255,255,0.15), transparent);
      pointer-events: none;
      opacity: 0.14;
      transform: rotate(8deg);
    }

    .chat-container::after {
      content: "";
      position: absolute;
      left: -56px;
      bottom: -70px;
      width: 188px;
      height: 188px;
      border-radius: 999px;
      border: 1px solid color-mix(in srgb, var(--accent) 20%, #fff);
      background:
        radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.42), transparent 58%),
        color-mix(in srgb, var(--accent) 12%, #fff);
      pointer-events: none;
      opacity: 0.08;
    }

    .chat-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
      position: relative;
      z-index: 1;
    }

    .chat-header-actions {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chat-title-group {
      display: grid;
      gap: 1px;
    }

    .chat-title-sub {
      font-size: 10px;
      color: var(--muted);
      letter-spacing: 0.03em;
    }

    .chat-title {
      margin: 0;
      font-size: 17px;
      line-height: 1.1;
    }

    .chat-header-chips {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-wrap: wrap;
      margin-top: 3px;
    }

    .chat-head-chip {
      border: 1px solid var(--border-soft);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.76);
      color: var(--muted);
      font-size: 9px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 2px 7px;
      font-family: var(--mono);
    }

    .chat-presence {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 8px;
      color: var(--muted);
      font-size: 11px;
      letter-spacing: 0.02em;
      position: relative;
      z-index: 1;
    }

    .chat-presence-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--ok);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--ok) 20%, transparent);
      animation: pulse 1.8s ease-in-out infinite;
    }

    .clear-btn {
      padding: 6px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      cursor: pointer;
      border-radius: 999px;
      font-size: 11px;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-family: var(--mono);
    }

    .clear-btn:hover {
      border-color: var(--danger, #e74c3c);
      color: var(--danger, #e74c3c);
    }

	    .chat-messages {
	      flex: 1;
	      overflow-y: auto;
	      overflow-anchor: none;
	      padding: 8px 0 12px;
	      display: flex;
	      flex-direction: column;
	      gap: 10px;
	      position: relative;
	      z-index: 1;
	      contain: layout paint;
	    }

    .chat-end-anchor {
      height: 1px;
      flex: 0 0 1px;
    }

    .chat-jump-latest {
      position: absolute;
      left: 50%;
      bottom: 156px;
      transform: translateX(-50%);
      z-index: 2;
      border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border)) !important;
      background: transparent !important;
      background-color: transparent !important;
      color: color-mix(in srgb, var(--accent) 72%, var(--text-strong));
      border-radius: 999px;
      width: 26px;
      height: 26px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      box-shadow: none !important;
      transition: color 120ms ease, transform 120ms ease;
      padding: 0;
      line-height: 1;
      appearance: none;
      outline: none;
      -webkit-tap-highlight-color: transparent;
    }

    .chat-jump-latest svg {
      width: 14px;
      height: 14px;
      display: block;
      stroke: currentColor;
      stroke-width: 2.2;
      stroke-linecap: round;
      stroke-linejoin: round;
      fill: none;
    }

    .chat-jump-latest:hover {
      color: var(--accent);
      border-color: color-mix(in srgb, var(--accent) 72%, var(--border));
      background: color-mix(in srgb, var(--accent) 12%, transparent) !important;
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 18%, transparent) !important;
      transform: translateX(-50%) translateY(-1px);
    }

	    .chat-empty {
	      border: 1px solid var(--border-soft);
	      border-radius: 14px;
	      padding: 12px;
	      background: linear-gradient(170deg, rgba(255,255,255,0.92), rgba(255,249,242,0.82));
	      display: grid;
	      gap: 8px;
	    }

    .chat-empty-title {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-strong);
    }

    .chat-empty-sub {
      font-size: 12px;
      color: var(--muted);
      line-height: 1.5;
    }

    .chat-suggest-grid {
      display: grid;
      gap: 8px;
    }

    .chat-suggest-btn {
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.82);
      color: var(--text);
      text-align: left;
      padding: 9px 11px;
      font-size: 12px;
      line-height: 1.4;
      cursor: pointer;
      transition: border-color 120ms ease, transform 120ms ease, background-color 120ms ease;
    }

    .chat-suggest-btn:hover {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, #fff);
      transform: translateY(-1px);
    }

    .chat-msg {
      margin-bottom: 0;
      line-height: 1.6;
      max-width: min(86%, 760px);
      display: flex;
      gap: 10px;
      align-items: flex-start;
      animation: msgIn 180ms ease-out both;
    }

    .chat-msg.user {
      margin-left: auto;
      flex-direction: row-reverse;
    }

    .chat-avatar {
      width: 32px;
      height: 32px;
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.94);
      flex: 0 0 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      font-weight: 700;
      color: var(--muted);
      font-family: var(--mono);
    }

    .chat-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }

    .chat-avatar.assistant {
      border-color: color-mix(in srgb, var(--accent) 35%, var(--border-soft));
      background: color-mix(in srgb, var(--accent) 10%, white);
    }

    .chat-body {
      min-width: 0;
      display: flex;
      flex-direction: column;
    }

    .chat-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
      color: var(--muted);
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 700;
    }

    .chat-msg.user .chat-meta {
      justify-content: flex-end;
    }

    .chat-time {
      font-family: var(--mono);
      font-size: 10px;
      text-transform: none;
      letter-spacing: 0;
      opacity: 0.9;
      font-weight: 500;
    }

    .chat-bubble {
      padding: 12px 13px;
      border-radius: 14px;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.84);
      box-shadow: 0 6px 14px rgba(75, 52, 25, 0.05);
      white-space: pre-wrap;
      word-break: break-word;
      position: relative;
    }

    .chat-msg.assistant .chat-bubble::before {
      content: "";
      position: absolute;
      left: -6px;
      top: 12px;
      width: 10px;
      height: 10px;
      border-left: 1px solid var(--border-soft);
      border-bottom: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.92);
      transform: rotate(45deg);
    }

    .chat-msg.user .chat-bubble {
      border-color: color-mix(in srgb, var(--accent) 36%, var(--border-soft));
      background: color-mix(in srgb, var(--accent) 14%, white);
    }

    .chat-msg.user .chat-bubble::before {
      content: "";
      position: absolute;
      right: -6px;
      top: 12px;
      width: 10px;
      height: 10px;
      border-right: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border-soft));
      border-top: 1px solid color-mix(in srgb, var(--accent) 36%, var(--border-soft));
      background: color-mix(in srgb, var(--accent) 14%, white);
      transform: rotate(45deg);
    }

    .chat-msg.assistant .chat-bubble {
      background: rgba(255, 255, 255, 0.92);
    }

    .chat-mention {
      color: var(--accent);
      font-weight: 700;
      text-decoration: underline;
      text-decoration-thickness: 1.5px;
      text-underline-offset: 2px;
    }

    .chat-snapshot-line {
      display: block;
      line-height: 1.45;
      margin: 0;
      white-space: normal;
    }

    .chat-snapshot-label {
      color: var(--accent);
      font-weight: 700;
      margin-right: 4px;
    }

    .chat-copy-value {
      border: none;
      background: transparent;
      padding: 0;
      margin: 0;
      color: var(--text-strong);
      font: inherit;
      cursor: pointer;
      text-decoration: underline;
      text-decoration-thickness: 1.5px;
      text-underline-offset: 2px;
    }

    .chat-copy-value:hover {
      color: var(--accent);
    }

    .chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid color-mix(in srgb, var(--accent) 16%, var(--border-soft));
      padding: 6px 8px;
      margin-top: 4px;
      border-radius: 12px;
      background: linear-gradient(180deg, rgba(255,255,255,0.86), rgba(255,250,244,0.78));
      position: relative;
      z-index: 1;
    }

    .chat-input {
      flex: 1;
      padding: 8px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      border-radius: 12px;
      resize: none;
      overflow-y: auto;
      min-height: 42px;
      max-height: 200px;
      box-sizing: border-box;
    }

    .chat-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .chat-send-btn {
      margin-top: 0;
      height: 36px;
      align-self: flex-end;
      border-radius: 999px;
      min-width: 82px;
      font-weight: 700;
      letter-spacing: 0.03em;
    }

    .chat-send-btn.pause {
      border-color: color-mix(in srgb, var(--warn) 60%, var(--accent));
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--warn) 56%, #f4d6ab),
        color-mix(in srgb, var(--warn) 72%, #dca257)
      );
      color: #2b1e16;
    }

    .chat-send-stack {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      min-width: 92px;
    }

    .chat-control-btn {
      border: 1px solid var(--border);
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.86);
      color: var(--muted);
      font-size: 10px;
      font-family: var(--mono);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 3px 9px;
      cursor: pointer;
      min-width: 72px;
    }

    .chat-control-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .chat-composer-foot {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-top: 6px;
      font-size: 11px;
      color: var(--muted);
      position: relative;
      z-index: 1;
      gap: 8px;
    }

    .chat-typing {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 5px 10px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.82);
      font-weight: 600;
    }

    .chat-typing-status {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      letter-spacing: 0.02em;
    }

    .chat-typing-label {
      font-weight: 700;
      color: var(--text-strong);
    }

    .chat-typing-sub {
      color: var(--muted);
      font-weight: 600;
      opacity: 0.92;
    }

    .chat-typing-signal {
      width: 7px;
      height: 7px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 78%, #fff);
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 32%, transparent);
      animation: typingSignal 1.4s ease-out infinite;
      flex: 0 0 7px;
    }

    .chat-typing-dots {
      display: inline-flex;
      gap: 3px;
    }

    .chat-typing-dots span {
      width: 5px;
      height: 5px;
      border-radius: 999px;
      background: color-mix(in srgb, var(--accent) 55%, #fff);
      animation: typingPulse 1.2s ease-in-out infinite;
    }

    .chat-typing-dots span:nth-child(2) { animation-delay: 0.18s; }
    .chat-typing-dots span:nth-child(3) { animation-delay: 0.36s; }

    .chat-typing.live {
      border-color: color-mix(in srgb, var(--accent) 46%, var(--border-soft));
      background:
        linear-gradient(
          180deg,
          color-mix(in srgb, var(--accent) 18%, white),
          color-mix(in srgb, var(--accent) 10%, white)
        );
      color: var(--text-strong);
      font-weight: 700;
      box-shadow: 0 6px 14px rgba(75, 52, 25, 0.1);
    }

    .chat-typing.live .chat-typing-dots span {
      width: 6px;
      height: 6px;
      background: color-mix(in srgb, var(--accent) 72%, #fff);
    }

    .chat-count {
      font-family: var(--mono);
      opacity: 0.9;
    }

    .chat-tools-row {
      display: flex;
      justify-content: flex-end;
      align-items: center;
      margin-top: 8px;
      gap: 8px;
      position: relative;
      z-index: 1;
    }

    .chat-tools-group {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .chat-style-settings-btn {
      min-height: 36px;
      border: 1px solid var(--border);
      border-radius: 999px;
      background: var(--bg);
      color: var(--muted);
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 0 12px;
      font-size: 12px;
      font-weight: 600;
    }

    .chat-style-settings-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .chat-style-panel {
      margin-top: 10px;
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      background: rgba(255, 255, 255, 0.9);
      padding: 12px;
      position: relative;
      z-index: 2;
      max-height: min(52vh, 420px);
      overflow-y: auto;
      overscroll-behavior: contain;
    }

    .chat-style-panel-title {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--muted);
      margin-bottom: 8px;
    }

    @keyframes pulse {
      0%, 100% { transform: scale(1); opacity: 0.95; }
      50% { transform: scale(1.12); opacity: 0.65; }
    }

    @keyframes msgIn {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes typingPulse {
      0%, 80%, 100% { opacity: 0.35; transform: translateY(0); }
      40% { opacity: 1; transform: translateY(-2px); }
    }

    @keyframes typingSignal {
      0% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 36%, transparent);
      }
      70% {
        box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%, transparent);
      }
      100% {
        box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 0%, transparent);
      }
    }

    .start-agent-box {
      text-align: center;
      padding: 40px;
      border: 1px solid var(--border);
      margin-top: 20px;
    }

    .start-agent-box p {
      color: var(--muted);
      margin-bottom: 16px;
    }

    /* Plugin search */
    .plugin-search {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.92);
      font-size: 13px;
      font-family: var(--font-body);
      margin-bottom: 10px;
    }

    .plugin-search::placeholder {
      color: var(--muted);
    }

    /* Plugin list */
    .plugin-list {
      display: flex;
      flex-direction: column;
      gap: 10px;
      content-visibility: auto;
      contain-intrinsic-size: 900px;
    }

    .plugin-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border: 1px solid var(--border-soft);
      border-radius: 14px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.93), rgba(255, 248, 240, 0.82));
      transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
      overflow: hidden;
      contain: layout paint style;
    }

    .apps-detail-card {
      contain: layout paint style;
      content-visibility: auto;
      contain-intrinsic-size: 360px;
    }

    .plugin-item:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(75, 52, 25, 0.08);
      border-color: var(--border);
    }

    .plugin-item .plugin-name {
      font-weight: bold;
      font-size: 14px;
    }

    .plugin-item .plugin-desc {
      font-size: 12px;
      color: var(--muted);
      margin-top: 2px;
    }

    .plugin-item .plugin-status {
      font-size: 12px;
      font-family: var(--mono);
      padding: 2px 8px;
      border: 1px solid var(--border);
    }

    .plugin-item .plugin-status.enabled {
      color: var(--ok);
      border-color: var(--ok);
    }

    /* Collapsible settings */
    .plugin-settings-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding: 8px 10px;
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.72);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
      color: var(--text-strong);
      flex-wrap: wrap;
    }

    .plugin-settings-toggle span {
      min-width: 0;
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .plugin-settings-toggle:hover {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 8%, #fff);
    }

    .plugin-settings-toggle.open {
      border-color: var(--accent);
      background: color-mix(in srgb, var(--accent) 12%, #fff);
      box-shadow: 0 8px 16px color-mix(in srgb, var(--accent) 16%, transparent);
    }

    .plugin-settings-toggle .settings-chevron {
      display: inline-block;
      transition: transform 0.15s ease;
      font-size: 11px;
      color: var(--accent);
    }

    .plugin-settings-toggle .settings-chevron.open {
      transform: rotate(90deg);
    }

    .plugin-settings-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .plugin-settings-dot.all-set {
      background: #2ecc71;
    }

    .plugin-settings-dot.missing {
      background: #e74c3c;
    }

    .plugin-settings-body {
      display: flex;
      flex-direction: column;
      gap: 10px;
      margin-top: 10px;
      padding: 12px;
      background: var(--surface);
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.72);
      min-width: 0;
    }

    .plugin-settings-body input {
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 12px;
      font-family: var(--mono);
      width: 100%;
      box-sizing: border-box;
      min-width: 0;
    }

    .secret-input-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .secret-toggle-btn {
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--muted);
      font-size: 11px;
      border-radius: 8px;
      cursor: pointer;
      white-space: nowrap;
    }

    .secret-toggle-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .plugin-settings-body code {
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
      max-width: 100%;
    }

    .plugin-required-keys {
      font-size: 11px;
      color: var(--muted);
      margin-top: 6px;
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
      min-width: 0;
    }

    .plugin-required-keys code {
      font-size: 11px;
      max-width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
    }

    .wallet-launcher-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 10px;
    }

    .wallet-launcher-stack {
      display: grid;
      grid-template-columns: 1fr;
      gap: 10px;
    }

    .wallet-launcher-priority {
      border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--border-soft));
      border-radius: 12px;
      padding: 10px;
      background: linear-gradient(
        160deg,
        color-mix(in srgb, var(--accent) 12%, #fff) 0%,
        rgba(255, 255, 255, 0.9) 100%
      );
      margin-bottom: 10px;
    }

    .wallet-launcher-priority-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--accent);
      margin-bottom: 8px;
      font-weight: 700;
    }

    .security-limits-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
      align-items: end;
    }

    /* Logs */
    .logs-container {
      font-family: var(--mono);
      font-size: 12px;
      max-height: 500px;
      overflow-y: auto;
      border: 1px solid var(--border);
      padding: 8px;
      background: var(--card);
    }

    .log-entry {
      padding: 2px 0;
      border-bottom: 1px solid var(--bg-muted);
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
      font-style: italic;
      border: 1px dashed var(--border-soft);
      border-radius: 12px;
      background: rgba(255,255,255,0.55);
    }

    .plugin-dashboard {
      display: grid;
      gap: 14px;
      margin-bottom: 14px;
    }

    .plugin-hero {
      border: 1px solid var(--border-soft);
      border-radius: 14px;
      padding: 14px;
      background: linear-gradient(120deg, rgba(255, 253, 250, 0.96), rgba(252, 244, 234, 0.9));
      box-shadow: 0 14px 28px rgba(74, 49, 26, 0.08);
    }

    .plugin-hero-top {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 10px;
    }

    .plugin-kpis {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 8px;
    }

    .plugin-kpi {
      border: 1px solid var(--border-soft);
      border-radius: 10px;
      background: rgba(255, 255, 255, 0.75);
      padding: 8px 10px;
      min-height: 58px;
      transition: transform 120ms ease;
    }
    .plugin-kpi:hover { transform: translateY(-1px); }

    .plugin-kpi-value {
      font-size: 20px;
      font-weight: 700;
      color: var(--text-strong);
      line-height: 1.1;
    }

    .plugin-kpi-label {
      font-size: 11px;
      color: var(--muted);
      margin-top: 2px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .plugin-next-step {
      margin-top: 10px;
      border: 1px dashed var(--border-soft);
      border-radius: 10px;
      padding: 10px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      flex-wrap: wrap;
      background: rgba(255, 255, 255, 0.72);
    }

    .plugin-next-step-title {
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 3px;
    }

    .plugin-next-step-name {
      font-size: 14px;
      font-weight: 700;
      color: var(--text-strong);
    }

    .plugin-next-step-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .plugin-pill-btn {
      margin-top: 0;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
    }

    .plugin-secondary-btn {
      margin-top: 0;
      padding: 6px 12px;
      border-radius: 999px;
      font-size: 12px;
      line-height: 1;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      cursor: pointer;
    }

    .plugin-secondary-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
      background: rgba(245, 122, 59, 0.08);
    }

    .plugin-toolbar {
      border: 1px solid var(--border-soft);
      border-radius: 12px;
      padding: 12px;
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.88), rgba(255, 247, 237, 0.8));
    }

    .plugin-filters {
      display: flex;
      gap: 6px;
      margin-bottom: 0;
      flex-wrap: wrap;
    }

    .filter-btn {
      padding: 5px 12px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.86);
      color: var(--text);
      cursor: pointer;
      font-size: 12px;
    }

    .filter-btn.active {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
    }

    .apps-toggle-btn {
      border-color: var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
      font-weight: 700;
      box-shadow: 0 8px 14px color-mix(in srgb, var(--accent) 24%, transparent);
    }

    .plugin-install-card {
      margin-top: 0;
      margin-bottom: 0;
      border-radius: 12px;
      border: 1px solid var(--border-soft);
      background: linear-gradient(160deg, rgba(255, 255, 255, 0.88), rgba(255, 247, 237, 0.78));
    }

    @keyframes shellFade {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .plugin-item-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
      width: 100%;
    }

    .plugin-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
      min-width: 0;
    }

    .plugin-title-row .plugin-name {
      overflow-wrap: anywhere;
      word-break: break-word;
    }

    .plugins-surface .plugin-item > *,
    .plugins-surface .plugin-item-top > * {
      min-width: 0;
    }

    .plugin-category-tag {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      background: var(--surface);
      border: 1px solid var(--border-soft);
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .plugin-state-tag {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 999px;
      border: 1px solid var(--border-soft);
      background: rgba(255, 255, 255, 0.8);
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .plugin-state-tag.ok {
      border-color: rgba(32, 125, 82, 0.45);
      color: #207d52;
      background: rgba(32, 125, 82, 0.1);
    }

    .plugin-state-tag.warn {
      border-color: rgba(156, 100, 0, 0.45);
      color: #9c6400;
      background: rgba(156, 100, 0, 0.1);
    }

    .plugin-state-tag.risk {
      border-color: rgba(140, 47, 33, 0.45);
      color: #8c2f21;
      background: rgba(140, 47, 33, 0.1);
    }

    .plugin-inline-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .plugin-warn-box {
      margin-top: 8px;
      padding: 8px 10px;
      border: 1px solid rgba(179, 84, 49, 0.45);
      background: rgba(179, 84, 49, 0.08);
      font-size: 12px;
      border-radius: 8px;
      color: #6e2f1a;
    }

    @media (max-width: 960px) {
      .header-shell {
        width: 100%;
      }

      header {
        flex-direction: column;
        align-items: flex-start;
        gap: 10px;
      }

      .status-bar {
        width: 100%;
        flex-wrap: wrap;
      }

      .brand-block {
        border-right: 0;
        margin-right: 0;
        padding-right: 0;
      }

      .app-shell {
        padding: 14px;
      }

      main.main {
        padding: 14px;
      }

      .plugin-kpis {
        grid-template-columns: 1fr;
      }

      .onboarding-character-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 640px) {
      .app-shell {
        padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
      }

      header {
        padding: 12px 12px;
      }

      .layout {
        gap: 12px;
        padding: 12px 0 18px;
      }

      .sidebar {
        display: none;
      }

      .sidebar,
      main.main {
        border-radius: 12px;
      }

      main.main {
        padding: 12px;
      }

      .status-badge-grid {
        grid-template-columns: 1fr;
      }

      .rail-detail-item {
        flex-direction: column;
        align-items: flex-start;
      }

      .rail-detail-v {
        text-align: left;
      }

      .chat-container {
        height: min(70dvh, 640px);
        min-height: 360px;
        border-radius: 14px;
        padding: 8px;
      }

      .chat-container::before,
      .chat-container::after {
        opacity: 0.06;
      }

      .chat-header-row {
        align-items: flex-start;
        gap: 8px;
        flex-direction: column;
      }

      .chat-header-actions {
        width: 100%;
        justify-content: flex-start;
        flex-wrap: wrap;
      }

      .chat-msg {
        max-width: 96%;
        gap: 8px;
      }

      .chat-avatar {
        width: 28px;
        height: 28px;
        flex-basis: 28px;
      }

      .chat-bubble {
        padding: 10px 11px;
        border-radius: 12px;
      }

      .chat-input-row {
        flex-direction: column;
        align-items: stretch;
        gap: 6px;
      }

      .chat-send-stack {
        width: 100%;
        min-width: 0;
        align-items: stretch;
      }

      .chat-send-btn,
      .chat-control-btn {
        width: 100%;
        min-width: 0;
      }

      .chat-composer-foot {
        flex-wrap: wrap;
        justify-content: space-between;
      }

      .chat-tools-row {
        justify-content: space-between;
        flex-wrap: wrap;
      }

      .chat-style-settings-btn,
      .plugin-secondary-btn,
      .plugin-pill-btn,
      .btn,
      .filter-btn,
      .inventory-subtab,
      .sort-btn {
        min-height: 38px;
      }

      .portfolio-balance-value {
        font-size: 24px;
      }

      .portfolio-chain-row {
        grid-template-columns: 72px minmax(0, 1fr) auto;
      }

      .token-table th,
      .token-table td {
        padding: 7px 8px;
      }

      .token-table {
        min-width: 0;
      }

      .setup-card {
        padding: 14px;
      }

      .plugin-item {
        padding: 12px;
      }

      .plugin-toolbar {
        padding: 9px;
      }

      .plugin-filters {
        overflow-x: auto;
        flex-wrap: nowrap;
        padding-bottom: 2px;
      }

      .plugin-item-top {
        gap: 8px;
        flex-direction: row;
        align-items: flex-start;
      }

      .plugin-settings-toggle {
        align-items: flex-start;
        font-size: 11px;
      }

      .plugin-settings-body {
        padding: 10px;
      }

      .apps-surface .plugin-item {
        padding: 14px;
      }

      .apps-surface .plugin-settings-body {
        gap: 12px;
      }

      .apps-surface .plugin-desc {
        line-height: 1.45;
      }

      .apps-surface .plugin-item-top,
      .ai-surface .plugin-item-top {
        flex-direction: column;
        gap: 10px;
      }

      .apps-surface .plugin-inline-actions,
      .ai-surface .plugin-inline-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .apps-surface .plugin-filters {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 8px;
        overflow: visible;
        white-space: normal;
      }

      .apps-surface .filter-btn {
        width: 100%;
      }

      .ai-surface .plugin-state-tag,
      .ai-surface .plugin-category-tag {
        white-space: normal;
        overflow-wrap: anywhere;
      }

      .ai-surface .plugin-settings-body,
      .apps-surface .plugin-settings-body {
        overflow: hidden;
      }

      .plugin-inline-actions {
        width: 100%;
        justify-content: flex-start;
      }

      .filter-btn {
        white-space: nowrap;
      }

      .wallet-launcher-grid {
        grid-template-columns: 1fr;
      }

      .security-limits-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 420px) {
      .logo {
        font-size: 15px;
      }

      .brand-mark {
        width: 22px;
        height: 22px;
      }

      .onboarding {
        margin: 18px auto;
        padding: 16px 12px;
        border-radius: 14px;
      }

      .onboarding-welcome-title {
        font-size: 24px;
      }

      .plugin-state-tag,
      .plugin-category-tag {
        font-size: 9px;
      }

      .portfolio-balance-value {
        font-size: 22px;
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.basePath = basePathFromLocation(window.location.pathname);
    this.hydrateDeviceProfile();
    this.initializeApp();
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("focus", this.handleDeviceProfileRefresh);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("focus", this.handleDeviceProfileRefresh);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    if (this.tabDataLoadRaf != null) {
      cancelAnimationFrame(this.tabDataLoadRaf);
      this.tabDataLoadRaf = null;
    }
    if (this.pluginsRefreshRaf != null) {
      cancelAnimationFrame(this.pluginsRefreshRaf);
      this.pluginsRefreshRaf = null;
    }
    if (this.pluginsRefreshTimeout != null) {
      clearTimeout(this.pluginsRefreshTimeout);
      this.pluginsRefreshTimeout = null;
    }
    if (this.appsDetailReadyRaf != null) {
      cancelAnimationFrame(this.appsDetailReadyRaf);
      this.appsDetailReadyRaf = null;
    }
    if (this.chatAutoScrollRaf != null) {
      cancelAnimationFrame(this.chatAutoScrollRaf);
      this.chatAutoScrollRaf = null;
    }
    if (this.chatAutoScrollTimeout != null) {
      clearTimeout(this.chatAutoScrollTimeout);
      this.chatAutoScrollTimeout = null;
    }
    if (this.chatScrollRaf != null) {
      cancelAnimationFrame(this.chatScrollRaf);
      this.chatScrollRaf = null;
    }
    client.disconnectWs();
  }

  private handlePopState = (): void => {
    const tab = tabFromPath(window.location.pathname, this.basePath);
    if (tab) this.applyTab(tab, { pushHistory: false });
  };

  private handleDeviceProfileRefresh = (): void => {
    this.refreshDeviceProfile();
  };

  private handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") {
      this.refreshDeviceProfile();
    }
  };

  private async initializeApp(): Promise<void> {
    this.loadProfileAppearance();
    // Check onboarding status.  In Electron the API base URL is injected
    // asynchronously after the agent runtime starts, so retry a few times
    // with exponential backoff.
    const MAX_RETRIES = 15;
    const BASE_DELAY_MS = 1000;
    const MAX_DELAY_MS = 5000;
    let serverReady = false;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const auth = await client.getAuthStatus();
        if (auth.required && !client.hasToken()) {
          this.authRequired = true;
          this.pairingEnabled = auth.pairingEnabled;
          this.pairingExpiresAt = auth.expiresAt;
          serverReady = true;
          break;
        }

        const { complete } = await client.getOnboardingStatus();
        this.onboardingComplete = complete;
        if (!complete) {
          const options = await client.getOnboardingOptions();
          this.onboardingOptions = options;
          this.prefetchCharacterImages(options.names);
        }
        serverReady = true;
        if (attempt > 0) {
          console.info(`[milaidy] Server is ready (connected after ${attempt} ${attempt === 1 ? "retry" : "retries"}).`);
        }
        break; // success
      } catch {
        if (attempt === 0) {
          console.info("[milaidy] Server is starting up, waiting for it to become available...");
        }
        if (attempt < MAX_RETRIES) {
          const delay = Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    }
    if (!serverReady) {
      console.warn("[milaidy] Could not reach server after retries — continuing in offline mode.");
    }
    this.onboardingLoading = false;

    if (this.authRequired) {
      return;
    }

    // Hydrate profile/theme from server config for cross-device consistency.
    try {
      const cfg = await client.getConfig();
      this.applyProfileFromServerConfig(cfg);
    } catch {
      // ignore
    }

    // Restore persisted chat/security state
    this.loadSecurityState();
    this.loadChatMessages();

    // Connect WebSocket
    client.connectWs();
    client.onWsEvent("status", (data) => {
      this.setAgentStatus(data as unknown as AgentStatus);
    });
    // Chat is handled via the REST POST /api/chat endpoint (see
    // handleChatSend).  WebSocket is kept for status events only.

    // Load initial status
    try {
      this.setAgentStatus(await client.getStatus());
      this.connected = true;
    } catch {
      this.connected = false;
    }

    // Load wallet addresses for the header icon
    try {
      this.walletAddresses = await client.getWalletAddresses();
    } catch {
      // Wallet may not be configured yet
    }

    // Prime sidebar/context metrics so layout cards are useful on first load.
    await Promise.all([
      this.loadPlugins().catch(() => {}),
      this.loadWalletConfig().catch(() => {}),
      this.loadLogs().catch(() => {}),
    ]);

    // Load tab from URL and trigger data loading for it
    const tab = tabFromPath(window.location.pathname, this.basePath);
    if (tab) {
      this.applyTab(tab, { pushHistory: false });
    }
  }

  private applyTab(tab: Tab, opts: { pushHistory: boolean }): void {
    if (this.tab === "accounts" && tab !== "accounts") {
      this.resetAccountNameDraft();
    }
    if (tab !== "chat") {
      this.clearDialogOpen = false;
      this.clearDialogSessionId = null;
    }
    this.tab = tab;
    if (opts.pushHistory) {
      const path = pathForTab(tab, this.basePath);
      window.history.pushState(null, "", path);
    }

    if (tab === "apps") {
      this.appsDetailReady = false;
      // Always open Markets & Apps in collapsed mode for fast first paint.
      this.appTabsExpanded = false;
      if (this.appsDetailReadyRaf != null) cancelAnimationFrame(this.appsDetailReadyRaf);
      // Let the tab paint first, then mount the heavier detail panel.
      this.appsDetailReadyRaf = requestAnimationFrame(() => {
        this.appsDetailReadyRaf = null;
        this.appsDetailReady = true;
      });
    } else {
      this.appsDetailReady = true;
    }

    if (tab === "chat") {
      this.syncChatViewportForActiveSession("auto");
    }

    // Defer tab data loading so navigation paints immediately.
    this.scheduleTabDataLoad(tab);
  }

  private scheduleChatBottomSnap(): void {
    if (this.chatMessages.length === 0) return;
    void this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        this.scrollChatToLatest("auto", true);
        this.updateChatJumpToLatestVisibility();
      });
    });
  }

  private scheduleChatTopSnap(): void {
    if (this.chatMessages.length !== 0 || this.tab !== "chat") return;
    this.cancelPendingChatAutoScroll();
    void this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        const container = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
        if (!container) return;
        container.scrollTo({ top: 0, behavior: "auto" });
        this.updateChatJumpToLatestVisibility();
        // Final settle pass to defeat any late async scroll writes.
        this.chatAutoScrollTimeout = setTimeout(() => {
          this.chatAutoScrollTimeout = null;
          const settled = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
          if (!settled || this.tab !== "chat" || this.chatMessages.length !== 0) return;
          settled.scrollTo({ top: 0, behavior: "auto" });
          this.updateChatJumpToLatestVisibility();
        }, 180);
      });
    });
  }

  private syncChatViewportForActiveSession(
    behavior: ScrollBehavior = "auto",
  ): void {
    this.cancelPendingChatAutoScroll();
    this.chatJumpSuppressUntil = Date.now() + 700;
    this.chatShowJumpToLatest = false;
    if (this.tab !== "chat") return;
    void this.updateComplete.then(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (this.chatMessages.length === 0) {
            this.scheduleChatTopSnap();
            return;
          }
          this.scrollChatToLatest(behavior, true);
          this.scheduleChatBottomSnap();
        });
      });
    });
  }

  private scheduleTabDataLoad(tab: Tab): void {
    if (this.tabDataLoadRaf != null) cancelAnimationFrame(this.tabDataLoadRaf);
    this.tabDataLoadRaf = requestAnimationFrame(() => {
      this.tabDataLoadRaf = null;
      const now = Date.now();
      const isStale = (lastLoadedAt: number, ttlMs: number): boolean =>
        lastLoadedAt <= 0 || now - lastLoadedAt > ttlMs;

      if (tab === "inventory") {
        if (isStale(this.inventoryLoadedAt, 15_000)) void this.loadInventory();
        return;
      }
      if (tab === "accounts") {
        if (isStale(this.walletConfigLoadedAt, 15_000)) void this.loadWalletConfig();
        if (isStale(this.inventoryLoadedAt, 15_000)) void this.loadInventory();
        return;
      }
      if (tab === "ai-setup") {
        if (isStale(this.pluginsLoadedAt, 15_000)) void this.loadPlugins();
        return;
      }
      if (tab === "apps") {
        this.schedulePluginsRefresh();
        return;
      }
      if (tab === "skills") {
        if (isStale(this.skillsLoadedAt, 30_000)) void this.loadSkills();
        return;
      }
      if (tab === "config") {
        if (isStale(this.extensionCheckedAt, 15_000)) void this.checkExtensionStatus();
        if (isStale(this.walletConfigLoadedAt, 15_000)) void this.loadWalletConfig();
        return;
      }
      if (tab === "logs") {
        if (isStale(this.logsLoadedAt, 10_000)) void this.loadLogs();
      }
    });
  }

  private schedulePluginsRefresh(): void {
    if (this.pluginsRefreshRaf != null || this.pluginsRefreshTimeout != null) return;
    this.pluginsRefreshRaf = requestAnimationFrame(() => {
      this.pluginsRefreshRaf = null;
      // Refresh plugin data in idle-ish time so tab navigation stays instant.
      this.pluginsRefreshTimeout = setTimeout(() => {
        this.pluginsRefreshTimeout = null;
        const recentlyLoaded = Date.now() - this.pluginsLoadedAt < 60_000;
        if (this.plugins.length > 0 && recentlyLoaded) return;
        void this.loadPlugins();
      }, 350);
    });
  }

  private setTab(tab: Tab): void {
    this.applyTab(tab, { pushHistory: true });
  }

  // Centralized top-of-app transient notice surface.
  // Use this instead of adding one-off popup banners in feature sections.
  private showUiNotice(message: string): void {
    this.uiNotice = message;
    if (this.uiNoticeTimer) {
      clearTimeout(this.uiNoticeTimer);
      this.uiNoticeTimer = null;
    }
    this.uiNoticeTimer = setTimeout(() => {
      this.uiNotice = null;
      this.uiNoticeTimer = null;
    }, 5000);
  }

  private async loadPlugins(): Promise<void> {
    try {
      const { plugins } = await client.getPlugins();
      this.plugins = plugins;
      this.pluginsLoadedAt = Date.now();
    } catch (err) {
      console.error("Failed to load plugins:", err);
      this.showUiNotice("Could not load AI/app settings. Retry in a moment.");
    }
  }

  private async loadSkills(): Promise<void> {
    try {
      const { skills } = await client.getSkills();
      this.skills = skills;
      this.skillsLoadedAt = Date.now();
    } catch (err) {
      console.error("Failed to load skills:", err);
      this.showUiNotice("Could not load skills right now.");
    }
  }

  private async refreshSkills(): Promise<void> {
    try {
      const { skills } = await client.refreshSkills();
      this.skills = skills;
      this.skillsLoadedAt = Date.now();
    } catch (err) {
      // Fall back to a normal load if refresh endpoint not available
      console.error("Failed to refresh skills:", err);
      await this.loadSkills();
    }
  }


  // --- Agent lifecycle ---

  private async handleStart(): Promise<void> {
    try {
      this.setAgentStatus(await client.startAgent());
    } catch (err) {
      this.showUiNotice(`Could not start agent: ${err instanceof Error ? err.message : "network error"}`);
    }
  }

  private async handleStop(): Promise<void> {
    try {
      this.setAgentStatus(await client.stopAgent());
    } catch (err) {
      this.showUiNotice(`Could not stop agent: ${err instanceof Error ? err.message : "network error"}`);
    }
  }

  private async handlePauseResume(): Promise<void> {
    if (!this.agentStatus) return;
    try {
      if (this.agentStatus.state === "running") {
        this.setAgentStatus(await client.pauseAgent());
      } else if (this.agentStatus.state === "paused") {
        this.setAgentStatus(await client.resumeAgent());
      }
    } catch { /* ignore */ }
  }

  private async handleRestart(): Promise<void> {
    try {
      const visualMinMs = 900;
      const started = Date.now();
      this.setAgentStatus({ ...(this.agentStatus ?? { agentName: "Milaidy", model: undefined, uptime: undefined, startedAt: undefined }), state: "restarting" });
      const next = await client.restartAgent();
      const elapsed = Date.now() - started;
      if (elapsed < visualMinMs) {
        await new Promise((resolve) => setTimeout(resolve, visualMinMs - elapsed));
      }
      this.setAgentStatus(next);
    } catch {
      // Fall back to polling status after a delay (restart may have killed the connection)
      setTimeout(async () => {
        try {
          this.setAgentStatus(await client.getStatus());
        } catch { /* ignore */ }
      }, 3000);
    }
  }

  private async waitForAgentAfterRestart(timeoutMs = 15000): Promise<void> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try {
        const status = await client.getStatus();
        this.setAgentStatus(status);
        if (status.state !== "restarting") return;
      } catch {
        // ignore transient restart/network blips
      }
      await new Promise((resolve) => setTimeout(resolve, 450));
    }
  }

  private async handleReset(): Promise<void> {
    this.openActionConfirm({
      title: "Reset Milaidy?",
      body:
        "This will wipe config, memory, chats, and local app state. You will return to onboarding.",
      confirmLabel: "Reset everything",
      danger: true,
      onConfirm: async () => {
        await this.performReset();
      },
    });
  }

  private async performReset(): Promise<void> {
    try {
      await client.resetAgent();

      // Reset local UI state and show onboarding
      this.setAgentStatus(null);
      this.onboardingComplete = false;
      this.onboardingStep = 0;
      this.onboardingName = "";
      this.onboardingCustomAccent = "";
      this.onboardingStyle = "";
      this.onboardingProvider = "";
      this.onboardingApiKey = "";
      this.onboardingTelegramToken = "";
      this.onboardingDiscordToken = "";
      this.chatMessages = [];
      this.chatSessions = [];
      this.activeSessionId = null;
      this.clearDialogOpen = false;
      this.clearDialogSessionId = null;
      this.sessionSearch = "";
      this.securityAuditActions = [];
      this.uiNotice = null;
      this.connected = false;
      this.authRequired = false;
      this.pairingEnabled = false;
      this.pairingExpiresAt = null;
      this.pairingCodeInput = "";
      this.pairingError = null;
      this.pairingBusy = false;
      this.providerSetupApplying = false;
      this.securitySpendGuardEnabled = true;
      this.securityRequireSpendConfirm = true;
      this.securityRequireExecuteConfirm = true;
      this.securityBetDailyLimitUsd = 50;
      this.securityBetPerTradeLimitUsd = 20;
      this.securityBetCooldownSec = 30;
      this.pluginExecutionToggles = {};
      localStorage.removeItem(CHAT_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SECURITY_STORAGE_KEY);
      localStorage.removeItem(PROFILE_IMAGE_STORAGE_KEY);
      localStorage.removeItem(PROFILE_ACCENT_STORAGE_KEY);
      localStorage.removeItem(USER_NAME_STORAGE_KEY);
      localStorage.removeItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY);
      localStorage.removeItem(USER_HANDLE_OWNER_ID_STORAGE_KEY);
      localStorage.removeItem(USER_HANDLE_REGISTRY_STORAGE_KEY);
      localStorage.removeItem(STYLE_SELECTION_STORAGE_KEY);
      localStorage.removeItem(PROVIDER_SELECTION_STORAGE_KEY);
      localStorage.removeItem(DEVICE_PROFILE_STORAGE_KEY);
      localStorage.removeItem(SERVER_PROFILE_SYNCED_KEY);
      this.plugins = [];
      this.skills = [];
      this.logs = [];
      this.pluginsLoadedAt = 0;
      this.skillsLoadedAt = 0;
      this.logsLoadedAt = 0;
      this.walletConfigLoadedAt = 0;
      this.inventoryLoadedAt = 0;
      this.profileImageUrl = "/pfp.jpg";
      this.profileAccent = "#f57a3b";
      this.userDisplayName = "@you";
      this.accountNameInput = this.userDisplayName;
      this.userNameChangeLockedUntil = null;
      this.nameValidationMessage = null;
      this.clearThemeOverrides();
      this.extensionStatus = null;
      this.extensionChecking = false;
      this.walletAddresses = null;
      this.walletConfig = null;
      this.polymarketPortfolio = null;
      this.walletBalances = null;
      this.walletNfts = null;
      this.walletLoading = false;
      this.walletNftsLoading = false;
      this.inventoryView = "tokens";
      this.inventorySort = "value";
      this.walletError = null;
      this.walletConnectMode = "choose";
      this.walletConnectChain = "both";
      this.walletImportChain = "evm";
      this.walletImportKey = "";
      this.selectedWalletLauncher = null;
      this.walletConnectOpen = false;
      this.walletConnectBusy = false;
      this.walletConnectStatus = null;
      this.deviceProfile = "standard";
      this.pluginFilter = "all";
      this.pluginSearch = "";
      this.accountsShowAll = false;
      this.pluginSettingsOpen = new Set();
      this.activeAppPluginId = null;
      this.appTabsExpanded = false;
      this.appActionBusy = false;
      this.appActionStatus = null;
      this.appsDetailReady = true;
      this.polymarketMarket = "";
      this.polymarketOutcome = "";
      this.polymarketAmount = "";

      // Re-fetch onboarding options for the wizard
      try {
        const options = await client.getOnboardingOptions();
        this.onboardingOptions = options;
        this.prefetchCharacterImages(options.names);
      } catch { /* ignore */ }
    } catch (err) {
      this.appActionStatus = `Reset failed: ${err instanceof Error ? err.message : "unknown error"}`;
    }
  }

  // --- Chat ---

  private async handleChatSend(): Promise<void> {
    const text = this.chatInput.trim();
    if (!text || this.chatSending) return;
    const activeProvider = this.plugins.find((p) => p.category === "ai-provider" && p.enabled) ?? null;
    const chosenProviderId = (this.onboardingProvider ?? "").trim();
    const chosenProvider =
      chosenProviderId ? (this.plugins.find((p) => p.id === chosenProviderId) ?? null) : null;
    const providerForChat = chosenProvider ?? activeProvider;
    const providerReady = Boolean(providerForChat && this.isChatProviderReady(providerForChat));
    if (!providerReady) {
      if (this.providerSetupApplying) {
        this.showUiNotice("Applying model provider settings. Milaidy will unlock chat after restart.");
      } else {
        this.showUiNotice("Connect an AI provider in AI Settings to start chatting.");
        this.setTab("ai-setup");
      }
      return;
    }
    let payloadText = text;
    if (this.chatResumePending && this.pausedChatRequestText) {
      const isResumeOnly =
        text.toLowerCase() === "continue from where you stopped.";
      payloadText = isResumeOnly
        ? `Continue and complete this previously interrupted request:\n${this.pausedChatRequestText}`
        : `Continue and complete this previously interrupted request:\n${this.pausedChatRequestText}\n\nAlso handle this new request:\n${text}`;
      this.pausedChatRequestText = null;
    }
    this.chatResumePending = false;

    // chatInput is intentionally non-reactive for perf, so clear the DOM
    // textarea directly to avoid stale text being re-sent.
    const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>(".chat-input");
    if (textarea) textarea.value = "";

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", text, timestamp: Date.now() },
    ];
    this.scrollChatToLatest("smooth", true);
    this.chatInput = "";
    this.updateChatCountDisplay(0);
    this.chatSending = true;
    this.saveChatMessages();
    const abort = new AbortController();
    this.inFlightChatAbort = abort;
    let timeoutHandle: number | null = null;
    let didTimeout = false;

    try {
      this.activeChatRequestText = payloadText;
      // Client-side timeout to prevent "stuck replying" if the network request
      // never resolves (browser fetch has no default timeout).
      timeoutHandle = window.setTimeout(() => {
        didTimeout = true;
        abort.abort();
      }, 60_000);
      const data = await client.sendChatRest(
        payloadText,
        this.buildChatSecurityContext(),
        abort.signal,
      );
      if (this.inFlightChatAbort !== abort) return;
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", text: data.text, timestamp: Date.now() },
      ];
      this.setProviderHealthState("Healthy", "ok", "Provider responding");
      this.scrollChatToLatest("smooth", true);
      this.saveChatMessages();
      this.activeChatRequestText = null;
    } catch (err) {
      const aborted =
        err instanceof DOMException
          ? err.name === "AbortError"
          : (typeof err === "object" && err !== null && "name" in err
            ? (err as { name?: string }).name === "AbortError"
            : false);
      if (aborted && didTimeout) {
        // One automatic short-mode retry before surfacing timeout to the user.
        try {
          const shortPrompt =
            `${payloadText}\n\n` +
            "Continue in short mode with concise, actionable steps only.";
          const retryAbort = new AbortController();
          const retryTimer = window.setTimeout(() => retryAbort.abort(), 12_000);
          try {
            const retried = await client.sendChatRest(
              shortPrompt,
              this.buildChatSecurityContext(),
              retryAbort.signal,
            );
            if (this.inFlightChatAbort !== abort) return;
            this.chatMessages = [
              ...this.chatMessages,
              { role: "assistant", text: retried.text, timestamp: Date.now() },
            ];
            this.setProviderHealthState("Recovered", "ok", "Timeout recovered via short-mode retry");
            this.scrollChatToLatest("smooth", true);
            this.saveChatMessages();
            this.activeChatRequestText = null;
            return;
          } finally {
            window.clearTimeout(retryTimer);
          }
        } catch (retryErr) {
          this.setProviderHealthFromError(retryErr);
        }

        const errorText =
          "This request is taking longer than expected. Send “continue” and Milaidy will resume in a shorter format.";
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", text: errorText, timestamp: Date.now() },
        ];
        this.setProviderHealthState("Timeout", "warn", "Slow response on last request");
        this.scrollChatToLatest("smooth", true);
        this.saveChatMessages();
        this.activeChatRequestText = null;
      } else if (!aborted) {
        const raw =
          err instanceof Error
            ? err.message
            : (typeof err === "string" ? err : "");
        const lower = raw.trim().toLowerCase();
        if (
          lower.includes("ai_provider_required") ||
          lower.includes("provider not connected") ||
          lower.includes("ai provider not connected")
        ) {
          this.showUiNotice("Connect your AI provider in AI Settings to continue.");
          this.setTab("ai-setup");
        }
        this.setProviderHealthFromError(err);
        const errorText = this.chatErrorMessage(err);
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", text: errorText, timestamp: Date.now() },
        ];
        this.scrollChatToLatest("smooth", true);
        this.saveChatMessages();
        this.activeChatRequestText = null;
      }
    } finally {
      if (timeoutHandle != null) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      if (this.inFlightChatAbort === abort) {
        this.inFlightChatAbort = null;
        this.chatSending = false;
      }
    }

    // Keep fixed-size/scrolling composer for consistent responsiveness.
  }

  private isChatNearBottom(container: HTMLElement, threshold = 96): boolean {
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    return distance <= threshold;
  }

  private updateChatJumpToLatestVisibility(): void {
    if (Date.now() < this.chatJumpSuppressUntil) {
      if (this.chatShowJumpToLatest) this.chatShowJumpToLatest = false;
      return;
    }
    const container = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
    if (!container) {
      this.chatShowJumpToLatest = false;
      return;
    }
    const distance = container.scrollHeight - container.scrollTop - container.clientHeight;
    const shouldShow = this.chatMessages.length > 2 && distance > 180;
    if (this.chatShowJumpToLatest !== shouldShow) {
      this.chatShowJumpToLatest = shouldShow;
    }
  }

  private handleChatScroll = (): void => {
    if (this.chatScrollRaf != null) {
      cancelAnimationFrame(this.chatScrollRaf);
      this.chatScrollRaf = null;
    }
    this.chatScrollRaf = requestAnimationFrame(() => {
      this.chatScrollRaf = null;
      this.updateChatJumpToLatestVisibility();
    });
  };

  private scrollChatToLatest(
    behavior: ScrollBehavior = "smooth",
    force = false,
  ): void {
    this.cancelPendingChatAutoScroll();
    this.chatAutoScrollRaf = requestAnimationFrame(() => {
      this.chatAutoScrollRaf = requestAnimationFrame(() => {
        this.chatAutoScrollRaf = null;
        const container = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
        if (!container) return;
        if (!force && !this.isChatNearBottom(container)) {
          this.updateChatJumpToLatestVisibility();
          return;
        }
        const anchor = this.shadowRoot?.querySelector<HTMLElement>(".chat-end-anchor");
        if (anchor) {
          anchor.scrollIntoView({ behavior, block: "end" });
        } else {
          container.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior });
        }
        // Final settle pass after smooth animation/layout updates to prevent
        // slight bounce-back when the browser readjusts scroll anchoring.
        this.chatAutoScrollTimeout = setTimeout(() => {
          this.chatAutoScrollTimeout = null;
          const settledContainer = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
          if (!settledContainer) return;
          if (!force && !this.isChatNearBottom(settledContainer)) return;
          settledContainer.scrollTo({ top: Number.MAX_SAFE_INTEGER, behavior: "auto" });
          this.updateChatJumpToLatestVisibility();
        }, behavior === "smooth" ? 280 : 0);
      });
    });
  }

  private scrollChatToTop(behavior: ScrollBehavior = "auto"): void {
    const container = this.shadowRoot?.querySelector<HTMLElement>(".chat-messages");
    if (!container) return;
    container.scrollTo({ top: 0, behavior });
  }

  private cancelPendingChatAutoScroll(): void {
    if (this.chatAutoScrollRaf != null) {
      cancelAnimationFrame(this.chatAutoScrollRaf);
      this.chatAutoScrollRaf = null;
    }
    if (this.chatAutoScrollTimeout != null) {
      clearTimeout(this.chatAutoScrollTimeout);
      this.chatAutoScrollTimeout = null;
    }
  }

  private setProviderHealthState(
    label: string,
    tone: "ok" | "warn" | "risk",
    detail: string | null = null,
  ): void {
    this.providerHealth = {
      label,
      tone,
      detail,
      updatedAt: Date.now(),
    };
  }

  private setProviderHealthFromError(err: unknown): void {
    const details =
      typeof err === "object" && err !== null && "details" in err
        ? (err as { details?: Record<string, unknown> }).details
        : undefined;
    const code =
      details && typeof details.code === "string" ? details.code : null;
    const raw =
      err instanceof Error
        ? err.message
        : (typeof err === "string" ? err : "");
    const lower = raw.trim().toLowerCase();

    if (code === "PROVIDER_QUOTA" || lower.includes("insufficient_quota") || lower.includes("quota")) {
      this.setProviderHealthState("Quota issue", "warn", "Billing/usage limit reached");
      return;
    }
    if (code === "PROVIDER_AUTH" || lower.includes("invalid api key") || lower.includes("unauthorized")) {
      this.setProviderHealthState("Auth issue", "risk", "API key invalid or missing");
      return;
    }
    if (code === "PROVIDER_NOT_RUNNING" || lower.includes("ollama") || lower.includes("connection refused")) {
      this.setProviderHealthState("Provider offline", "warn", "Local provider not reachable");
      return;
    }
    if (code === "PROVIDER_TIMEOUT" || lower.includes("timed out") || lower.includes("timeout")) {
      this.setProviderHealthState("Timeout", "warn", "Provider response slow");
      return;
    }
    if (code === "PROVIDER_RESTART_REQUIRED" || lower.includes("not loaded")) {
      this.setProviderHealthState("Restart required", "warn", "Reload provider settings");
      return;
    }
    if (code === "AI_PROVIDER_REQUIRED" || lower.includes("provider not connected")) {
      this.setProviderHealthState("Not connected", "warn", "Connect a provider in AI Settings");
      return;
    }
    this.setProviderHealthState("Provider issue", "warn", "Check provider settings");
  }

  private chatErrorMessage(err: unknown): string {
    const fallback = "Something went wrong. Please try again.";
    const details =
      typeof err === "object" && err !== null && "details" in err
        ? (err as { details?: Record<string, unknown> }).details
        : undefined;
    const code =
      details && typeof details.code === "string" ? details.code : null;
    if (code === "PROVIDER_QUOTA") {
      return "Provider quota reached. Update billing/usage limits, then retry.";
    }
    if (code === "PROVIDER_AUTH") {
      return "Provider authentication failed. Please verify your API key.";
    }
    if (code === "PROVIDER_NOT_RUNNING") {
      return "Provider not running. If you selected Ollama, install and start it on this device, then restart Milaidy.";
    }
    if (code === "PROVIDER_TIMEOUT") {
      return "This request took too long. Try again or send a shorter prompt.";
    }
    if (code === "PROVIDER_RESTART_REQUIRED") {
      return "Provider isn't ready yet. Try again. If it keeps failing, restart Milaidy to reload AI Settings.";
    }
    if (code === "AI_PROVIDER_REQUIRED") {
      return "Connect your AI provider key in AI Settings to chat.";
    }
    const raw =
      err instanceof Error
        ? err.message
        : (typeof err === "string" ? err : "");
    const msg = raw.trim();
    if (!msg) return fallback;
    const lower = msg.toLowerCase();

    if (
      lower.includes("quota") ||
      lower.includes("insufficient_quota") ||
      lower.includes("you exceeded your current quota") ||
      lower.includes("billing")
    ) {
      return "Provider quota reached. Update billing/usage limits, then retry.";
    }

    if (
      lower.includes("backend not ready") ||
      lower.includes("failed to fetch") ||
      lower.includes("networkerror") ||
      lower.includes("network request failed") ||
      lower.includes("econnrefused")
    ) {
      return "Connection issue. Milaidy backend is not ready yet. Please wait a moment and try again.";
    }

    if (
      lower.includes("timed out") ||
      lower.includes("timeout") ||
      lower.includes("exceeded timeout")
    ) {
      return "Provider timed out. Try again.";
    }

    if (
      lower.includes("ai provider not connected") ||
      lower.includes("ai_provider_required") ||
      lower.includes("provider not connected")
    ) {
      return "Connect your AI provider key in AI Settings to chat.";
    }

    if (
      lower.includes("no handler found for delegate type") ||
      lower.includes("no assistant response was produced") ||
      lower.includes("active provider")
    ) {
      return "Model setup issue. Please check AI provider settings, then restart Milaidy.";
    }

    if (lower.includes("agent is not running")) {
      return "Milaidy is not running. Start the agent, then send again.";
    }

    if (lower.includes("429") || lower.includes("rate limit")) {
      return "Too many requests right now. Please wait a moment and retry.";
    }

    if (
      lower.includes("401") ||
      lower.includes("403") ||
      lower.includes("api key") ||
      lower.includes("unauthorized") ||
      lower.includes("invalid api key")
    ) {
      return "Authentication issue with the provider. Please verify your API key.";
    }

    if (
      lower.includes("429") && lower.includes("openai")
    ) {
      return "Provider rate limit reached. Please wait briefly and retry.";
    }

    return fallback;
  }

  private async handleChatStop(): Promise<void> {
    if (!this.chatSending) return;
    this.pausedChatRequestText =
      this.activeChatRequestText
      ?? this.chatMessages.slice().reverse().find((m) => m.role === "user")?.text
      ?? null;
    this.inFlightChatAbort?.abort();
    this.inFlightChatAbort = null;
    this.activeChatRequestText = null;
    this.chatSending = false;
    this.chatResumePending = true;
  }

  private async handleChatResumeStart(): Promise<void> {
    if (!this.chatResumePending || this.chatSending) return;
    if (!this.chatInput.trim()) {
      this.chatInput = "Continue from where you stopped.";
      this.updateChatCountDisplay(this.chatInput.length);
    }
    await this.handleChatSend();
  }

  private handleChatInput(e: Event): void {
    const value = (e.target as HTMLTextAreaElement).value;
    this.chatInput = value;
    this.updateChatCountDisplay(this.chatInput.trim().length);
  }

  private formatChatTime(timestamp: number): string {
    const cached = this.chatTimeCache.get(timestamp);
    if (cached) return cached;
    const formatted = this.chatTimeFormatter.format(new Date(timestamp || Date.now()));
    this.chatTimeCache.set(timestamp, formatted);
    return formatted;
  }

  private formatSessionUpdatedLabel(timestamp: number): string {
    const cached = this.sessionUpdatedLabelCache.get(timestamp);
    if (cached) return cached;
    const formatted = this.sessionUpdatedFormatter.format(new Date(timestamp));
    this.sessionUpdatedLabelCache.set(timestamp, formatted);
    return formatted;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  private renderMentionHighlights(text: string) {
    const mentionBase = (this.userDisplayName ?? "").trim();
    if (!mentionBase || mentionBase === "@you") return text;
    const mention = mentionBase.startsWith("@") ? mentionBase : `@${mentionBase}`;
    if (!mention || mention === "@") return text;
    const matcher = new RegExp(`(${this.escapeRegExp(mention)})`, "gi");
    const parts = text.split(matcher);
    if (parts.length <= 1) return text;
    return parts.map((part) =>
      part.toLowerCase() === mention.toLowerCase()
        ? html`<span class="chat-mention">${part}</span>`
        : part,
    );
  }

  private renderWalletSnapshotText(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => Boolean(line) && line.toLowerCase() !== "wallet snapshot");
    if (lines.length === 0) return null;

    const hasWalletLine = lines.some((line) => /^solana wallet:/i.test(line));
    const hasBalanceLine = lines.some((line) => /^balance:/i.test(line));
    if (!hasWalletLine || !hasBalanceLine) return null;

    return lines.map((line) => {
      if (/^solana wallet:/i.test(line)) {
        const value = line.replace(/^solana wallet:\s*/i, "").trim();
        const looksAddress = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value);
        const displayValue = looksAddress && value.length > 10 ? `${value.slice(0, 4)}...${value.slice(-4)}` : value;
        const fullAddressFromState = (this.walletAddresses?.solanaAddress ?? "").trim();
        const copyValue =
          fullAddressFromState && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fullAddressFromState)
            ? fullAddressFromState
            : value;
        return html`<span class="chat-snapshot-line"><span class="chat-snapshot-label">Solana wallet:</span><button class="chat-copy-value" title="Tap to copy wallet" @click=${async () => {
          const resolved = await this.resolveFullSolanaAddress(copyValue);
          if (!resolved || resolved.toLowerCase() === "not connected") return;
          await this.copyToClipboard(resolved);
          this.showUiNotice("Wallet address copied.");
        }}>${displayValue}</button></span>`;
      }
      if (/^balance:/i.test(line)) {
        const value = line.replace(/^balance:\s*/i, "").trim();
        return html`<span class="chat-snapshot-line"><span class="chat-snapshot-label">Balance:</span>${value}</span>`;
      }
      return html`<span class="chat-snapshot-line">${line}</span>`;
    });
  }

  private async resolveFullSolanaAddress(candidate: string): Promise<string | null> {
    const trimmed = candidate.trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(trimmed)) return trimmed;

    const stateAddress = (this.walletAddresses?.solanaAddress ?? "").trim();
    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(stateAddress)) return stateAddress;

    try {
      const latest = await client.getWalletAddresses();
      const apiAddress = (latest.solanaAddress ?? "").trim();
      if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(apiAddress)) return apiAddress;
    } catch {
      // ignore and fall through
    }
    return null;
  }

  private renderChatBubbleText(msg: ChatMessage) {
    const text = msg.text ?? "";
    if (msg.role !== "assistant") return text;
    const snapshotStyled = this.renderWalletSnapshotText(text);
    if (snapshotStyled) return snapshotStyled;
    return this.renderMentionHighlights(text);
  }

  private getVisibleSessions(searchLower: string): ChatSession[] {
    const cache = this.visibleSessionsCache;
    if (cache.sourceRef === this.chatSessions && cache.search === searchLower) {
      return cache.result;
    }
    const result = this.chatSessions.filter((s) =>
      !searchLower || s.name.toLowerCase().includes(searchLower),
    );
    this.visibleSessionsCache = { sourceRef: this.chatSessions, search: searchLower, result };
    return result;
  }

  private getTopVisibleSessions(sessions: ChatSession[], limit: number): ChatSession[] {
    const cache = this.topVisibleSessionsCache;
    if (cache.sourceRef === sessions && cache.limit === limit) return cache.result;
    const result = sessions.slice(0, limit);
    this.topVisibleSessionsCache = { sourceRef: sessions, limit, result };
    return result;
  }

  private setAgentStatus(next: AgentStatus | null): void {
    if (!next) {
      if (this.agentStatus !== null) this.agentStatus = null;
      return;
    }
    const prev = this.agentStatus;
    if (
      prev
      && prev.state === next.state
      && prev.agentName === next.agentName
      && (prev.model ?? "") === (next.model ?? "")
      && (prev.startedAt ?? 0) === (next.startedAt ?? 0)
    ) {
      // Ignore uptime-only websocket churn to keep UI responsive while typing.
      return;
    }
    this.agentStatus = next;
  }

  private updateChatCountDisplay(length: number): void {
    const el = this.shadowRoot?.querySelector<HTMLElement>(".chat-count");
    if (el) el.textContent = `${length}/12000`;
  }

  private resetChatRunState(): void {
    this.inFlightChatAbort?.abort();
    this.inFlightChatAbort = null;
    this.activeChatRequestText = null;
    this.pausedChatRequestText = null;
    this.chatResumePending = false;
    this.chatSending = false;
  }

  private handleChatKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void this.handleChatSend();
    }
  }

  private saveChatMessages(): void {
    try {
      // Legacy compatibility
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.chatMessages));

      const activeId = this.activeSessionId;
      if (!activeId) return;
      const nextSessions = this.chatSessions.map((s) =>
        s.id === activeId
          ? { ...s, updatedAt: Date.now(), messages: [...this.chatMessages], name: this.deriveSessionName(this.chatMessages, s.name) }
          : s,
      );
      this.chatSessions = nextSessions;
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(nextSessions));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  private loadChatMessages(): void {
    try {
      const sessionsRaw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (sessionsRaw) {
        const parsed = JSON.parse(sessionsRaw) as ChatSession[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.chatSessions = this.collapseEmptySessions(parsed.sort((a, b) => b.updatedAt - a.updatedAt));
          this.activeSessionId = this.chatSessions[0].id;
          this.chatMessages = [...this.chatSessions[0].messages];
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.chatSessions));
          return;
        }
      }

      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed: ChatMessage[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const seed: ChatSession = {
            id: crypto.randomUUID(),
            name: this.deriveSessionName(parsed, "Chat 1"),
            updatedAt: Date.now(),
            messages: parsed,
          };
          this.chatSessions = [seed];
          this.activeSessionId = seed.id;
          this.chatMessages = [...seed.messages];
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.chatSessions));
          return;
        }
      }

      this.createNewSession();
    } catch {
      this.createNewSession();
    }
  }

  private openActionConfirm(options: {
    title: string;
    body: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => Promise<void> | void;
    onCancel?: () => void;
  }): void {
    this.actionConfirmTitle = options.title;
    this.actionConfirmBody = options.body;
    this.actionConfirmButton = options.confirmLabel;
    this.actionConfirmDanger = Boolean(options.danger);
    this.actionConfirmBusy = false;
    this.pendingActionConfirm = options.onConfirm;
    this.pendingActionCancel = options.onCancel ?? null;
    this.actionConfirmOpen = true;
    this.requestUpdate();
  }

  private closeActionConfirm(): void {
    if (this.actionConfirmBusy) return;
    this.pendingActionCancel?.();
    this.actionConfirmOpen = false;
    this.pendingActionConfirm = null;
    this.pendingActionCancel = null;
  }

  private async confirmActionConfirm(): Promise<void> {
    if (!this.pendingActionConfirm || this.actionConfirmBusy) return;
    this.actionConfirmBusy = true;
    try {
      await this.pendingActionConfirm();
      this.actionConfirmOpen = false;
      this.pendingActionConfirm = null;
      this.pendingActionCancel = null;
    } finally {
      this.actionConfirmBusy = false;
    }
  }

  private sessionNeedsFundsConfirmation(session: ChatSession | null): boolean {
    if (!session || session.messages.length === 0) return false;
    const fundsPattern = /\b(polymarket|bet|spend|swap|transfer|send\s+sol|send\s+usdc|buy|sell|position|trade)\b/i;
    return session.messages.some((m) => fundsPattern.test(m.text || ""));
  }

  private removeSession(sessionId: string): void {
    this.clearDialogOpen = false;
    this.clearDialogSessionId = null;
    const currentSessions = this.chatSessions;
    const removeIndex = currentSessions.findIndex((s) => s.id === sessionId);
    if (removeIndex < 0) return;

    const nextSessions = currentSessions.filter((s) => s.id !== sessionId);
    if (nextSessions.length === 0) {
      this.chatSessions = [];
      this.activeSessionId = null;
      this.chatMessages = [];
      this.chatShowAllMessages = false;
      this.chatInput = "";
      this.updateChatCountDisplay(0);
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify([]));
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([]));
      } catch {
        // ignore
      }
      this.createNewSession();
      return;
    }

    this.chatSessions = nextSessions;
    if (this.activeSessionId === sessionId) {
      const nextActive = nextSessions[Math.min(removeIndex, nextSessions.length - 1)] ?? nextSessions[0];
      this.activeSessionId = nextActive.id;
      this.chatMessages = [...nextActive.messages];
      this.chatShowAllMessages = false;
      this.chatInput = "";
      this.updateChatCountDisplay(0);
      this.syncChatViewportForActiveSession("auto");
    }

    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.chatSessions));
      if (this.activeSessionId) {
        const activeSession = this.chatSessions.find((s) => s.id === this.activeSessionId);
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(activeSession?.messages ?? []));
      } else {
        localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify([]));
      }
    } catch {
      // ignore
    }
  }

  private requestClearConfirmForSession = (sessionId: string, event?: Event): void => {
    event?.preventDefault();
    event?.stopPropagation();
    if (this.chatSessions.length <= 1) {
      this.showUiNotice("Create another chat before deleting this one.");
      return;
    }
    if (!sessionId) return;
    const targetSession = this.chatSessions.find((s) => s.id === sessionId) ?? null;
    if (!targetSession) return;
    if (this.tab !== "chat") {
      this.setTab("chat");
    }
    if (this.activeSessionId !== sessionId) {
      this.switchSession(sessionId);
    }
    this.clearDialogSessionId = sessionId;
    this.clearDialogOpen = true;
    this.requestUpdate();
  };

  private handleHeaderClearActiveChat = (event?: Event): void => {
    const targetId = this.activeSessionId ?? this.chatSessions[0]?.id ?? null;
    if (!targetId) return;
    this.requestClearConfirmForSession(targetId, event);
  };

  private handleSidebarClearChat = (sessionId: string, event?: Event): void => {
    this.requestClearConfirmForSession(sessionId, event);
  };

  private closeClearDialog = (event?: Event): void => {
    event?.preventDefault();
    event?.stopPropagation();
    this.clearDialogOpen = false;
    this.clearDialogSessionId = null;
  };

  private confirmClearDialog = async (event?: Event): Promise<void> => {
    event?.preventDefault();
    event?.stopPropagation();
    const targetId = this.clearDialogSessionId;
    if (!targetId) return;
    const targetSession = this.chatSessions.find((s) => s.id === targetId) ?? null;
    const risky = this.sessionNeedsFundsConfirmation(targetSession);
    this.clearDialogOpen = false;
    this.clearDialogSessionId = null;
    await this.updateComplete;
    this.resetChatRunState();
    this.removeSession(targetId);
    this.showUiNotice(
      risky
        ? "Chat deleted. This chat included spend/bet context."
        : "Chat deleted.",
    );
  };

  private deriveSessionName(messages: ChatMessage[], fallback: string): string {
    const firstUser = messages.find((m) => m.role === "user")?.text.trim();
    if (!firstUser) return fallback;
    return firstUser.length > 36 ? `${firstUser.slice(0, 36)}…` : firstUser;
  }

  private isSessionEmpty(session: ChatSession): boolean {
    return session.messages.length === 0;
  }

  private collapseEmptySessions(sessions: ChatSession[]): ChatSession[] {
    let keptOneEmpty = false;
    return sessions.filter((s) => {
      if (!this.isSessionEmpty(s)) return true;
      if (keptOneEmpty) return false;
      keptOneEmpty = true;
      return true;
    });
  }

  private createNewSession(): void {
    this.resetChatRunState();
    this.clearDialogOpen = false;
    this.clearDialogSessionId = null;
    const existingEmpty = this.chatSessions.find((s) => this.isSessionEmpty(s));
    if (existingEmpty) {
      const refreshed = { ...existingEmpty, updatedAt: Date.now() };
      this.chatSessions = [
        refreshed,
        ...this.chatSessions.filter((s) => s.id !== existingEmpty.id),
      ];
      this.activeSessionId = refreshed.id;
      this.chatMessages = [];
      this.chatShowAllMessages = false;
      this.chatInput = "";
      this.updateChatCountDisplay(0);
      if (this.tab !== "chat") {
        this.setTab("chat");
      } else {
        this.syncChatViewportForActiveSession("auto");
      }
      try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.chatSessions));
      } catch {
        // ignore
      }
      return;
    }

    const index = this.chatSessions.length + 1;
    const created: ChatSession = {
      id: crypto.randomUUID(),
      name: `Chat ${index}`,
      updatedAt: Date.now(),
      messages: [],
    };
    this.chatSessions = this.collapseEmptySessions([created, ...this.chatSessions]);
    this.activeSessionId = created.id;
    this.chatMessages = [];
    this.chatShowAllMessages = false;
    this.chatInput = "";
    this.updateChatCountDisplay(0);
    if (this.tab !== "chat") {
      this.setTab("chat");
    } else {
      this.syncChatViewportForActiveSession("auto");
    }
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(this.chatSessions));
    } catch {
      // ignore
    }
  }

  private switchSession(sessionId: string): void {
    const next = this.chatSessions.find((s) => s.id === sessionId);
    if (!next) return;
    this.resetChatRunState();
    this.clearDialogOpen = false;
    this.clearDialogSessionId = null;
    this.activeSessionId = sessionId;
    this.chatMessages = [...next.messages];
    this.chatShowAllMessages = false;
    this.chatInput = "";
    this.updateChatCountDisplay(0);
    this.syncChatViewportForActiveSession("auto");
  }

  private useChatPrompt(prompt: string): void {
    this.chatInput = prompt;
    this.updateChatCountDisplay(prompt.trim().length);
    if (!this.chatSending) {
      void this.handleChatSend();
    }
  }

  private buildChatSecurityContext() {
    return {
      confirmBeforeExecution: this.securityRequireExecuteConfirm,
      confirmBeforeSpend: this.securityRequireSpendConfirm,
      spendGuardEnabled: this.securitySpendGuardEnabled,
      polymarketExecutionEnabled: this.pluginExecutionToggles["polymarket"] === true,
      dailySpendLimitUsd: this.securityBetDailyLimitUsd,
      perTradeLimitUsd: this.securityBetPerTradeLimitUsd,
      cooldownSeconds: this.securityBetCooldownSec,
    };
  }

  private loadSecurityState(): void {
    try {
      const raw = localStorage.getItem(SECURITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        spendGuardEnabled?: boolean;
        requireSpendConfirm?: boolean;
        requireExecuteConfirm?: boolean;
        betDailyLimitUsd?: number;
        betPerTradeLimitUsd?: number;
        betCooldownSec?: number;
        audit?: SecurityAuditAction[];
        pluginExecutionToggles?: Record<string, boolean>;
      };
      this.securitySpendGuardEnabled = parsed.spendGuardEnabled ?? true;
      this.securityRequireSpendConfirm = parsed.requireSpendConfirm ?? true;
      this.securityRequireExecuteConfirm = parsed.requireExecuteConfirm ?? true;
      this.securityBetDailyLimitUsd = Number.isFinite(parsed.betDailyLimitUsd)
        ? Math.max(1, Number(parsed.betDailyLimitUsd))
        : 50;
      this.securityBetPerTradeLimitUsd = Number.isFinite(parsed.betPerTradeLimitUsd)
        ? Math.max(1, Number(parsed.betPerTradeLimitUsd))
        : 20;
      this.securityBetCooldownSec = Number.isFinite(parsed.betCooldownSec)
        ? Math.max(0, Number(parsed.betCooldownSec))
        : 30;
      this.securityAuditActions = Array.isArray(parsed.audit) ? parsed.audit : [];
      this.pluginExecutionToggles = parsed.pluginExecutionToggles ?? {};
    } catch {
      // ignore
    }
  }

  private saveSecurityState(): void {
    try {
      localStorage.setItem(
        SECURITY_STORAGE_KEY,
        JSON.stringify({
          spendGuardEnabled: this.securitySpendGuardEnabled,
          requireSpendConfirm: this.securityRequireSpendConfirm,
          requireExecuteConfirm: this.securityRequireExecuteConfirm,
          betDailyLimitUsd: this.securityBetDailyLimitUsd,
          betPerTradeLimitUsd: this.securityBetPerTradeLimitUsd,
          betCooldownSec: this.securityBetCooldownSec,
          audit: this.securityAuditActions.slice(0, 40),
          pluginExecutionToggles: this.pluginExecutionToggles,
        }),
      );
    } catch {
      // ignore
    }
  }

  private addSecurityAudit(
    plugin: PluginInfo,
    risk: "SAFE" | "CAN_EXECUTE" | "CAN_SPEND",
    kind: "prepared" | "blocked" | "failed",
    detail: string,
  ): void {
    const entry: SecurityAuditAction = {
      id: crypto.randomUUID(),
      at: Date.now(),
      pluginId: plugin.id,
      pluginName: plugin.name,
      risk,
      kind,
      detail,
    };
    this.securityAuditActions = [entry, ...this.securityAuditActions].slice(0, 40);
    this.saveSecurityState();
  }

  private pluginRisk(plugin: PluginInfo): "SAFE" | "CAN_EXECUTE" | "CAN_SPEND" {
    if (plugin.id === "polymarket") return "CAN_SPEND";
    if (plugin.id.includes("solana") || plugin.id.includes("evm") || plugin.id.includes("wallet")) return "CAN_EXECUTE";
    return "SAFE";
  }

  private getTodaySpendUsd(): number {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const startMs = start.getTime();
    return this.securityAuditActions
      .filter((a) => a.risk === "CAN_SPEND" && a.kind === "prepared" && a.at >= startMs)
      .reduce((sum, a) => {
        const match = /\$([0-9]+(?:\.[0-9]+)?)/.exec(a.detail);
        if (!match) return sum;
        const value = Number.parseFloat(match[1]);
        return Number.isFinite(value) ? sum + value : sum;
      }, 0);
  }

  private getLastSpendAtMs(): number | null {
    const last = this.securityAuditActions.find((a) => a.risk === "CAN_SPEND" && a.kind === "prepared");
    return last?.at ?? null;
  }

  private pluginStatusLabel(plugin: PluginInfo): "Loaded" | "Missing keys" | "Error" {
    if (plugin.validationErrors.length > 0) return "Missing keys";
    if (plugin.enabled) return "Loaded";
    return "Error";
  }

  private setPluginExecution(pluginId: string, enabled: boolean): void {
    this.pluginExecutionToggles = {
      ...this.pluginExecutionToggles,
      [pluginId]: enabled,
    };
    this.saveSecurityState();
  }

  private sensitiveFieldId(pluginId: string, key: string): string {
    return `${pluginId}:${key}`;
  }

  private isSensitiveFieldVisible(pluginId: string, key: string): boolean {
    return this.sensitiveFieldVisible[this.sensitiveFieldId(pluginId, key)] === true;
  }

  private toggleSensitiveFieldVisibility(pluginId: string, key: string): void {
    const id = this.sensitiveFieldId(pluginId, key);
    this.sensitiveFieldVisible = {
      ...this.sensitiveFieldVisible,
      [id]: !this.isSensitiveFieldVisible(pluginId, key),
    };
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace("#", "").trim();
    const normalized = clean.length === 3
      ? clean.split("").map((c) => `${c}${c}`).join("")
      : clean;
    const num = Number.parseInt(normalized, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  private tintHex(hex: string, mix: number): string {
    const clamped = Math.max(0, Math.min(1, mix));
    const { r, g, b } = this.hexToRgb(hex);
    const rr = Math.round(r + (255 - r) * clamped);
    const gg = Math.round(g + (255 - g) * clamped);
    const bb = Math.round(b + (255 - b) * clamped);
    return `#${rr.toString(16).padStart(2, "0")}${gg.toString(16).padStart(2, "0")}${bb.toString(16).padStart(2, "0")}`;
  }

  private themeTokensFromAccent(accent: string): ThemeTokenMap {
    const bg = this.tintHex(accent, 0.9);
    const card = this.tintHex(accent, 0.94);
    const border = this.tintHex(accent, 0.72);
    const accentHover = this.tintHex(accent, 0.15);
    const accentMuted = this.tintHex(accent, 0.3);
    return {
      "--accent": accent,
      "--accent-foreground": "#fff9f3",
      "--accent-hover": accentHover,
      "--accent-muted": accentMuted,
      "--accent-subtle": `color-mix(in srgb, ${accent} 18%, white)`,
      "--ring": accent,
      "--text": "#2f2521",
      "--text-strong": "#201713",
      "--muted": "#6f625b",
      "--bg": bg,
      "--card": card,
      "--surface": "rgba(255, 255, 255, 0.72)",
      "--border": border,
      "--border-soft": this.tintHex(accent, 0.8),
      "--bg-muted": "#f5ece4",
      "--bg-hover": "rgba(245, 122, 59, 0.08)",
      "--app-shell-background":
        `radial-gradient(circle at 10% 8%, rgba(255,255,255,0.86), transparent 32%), radial-gradient(circle at 90% 8%, color-mix(in srgb, ${accent} 28%, white), transparent 30%), linear-gradient(180deg, ${this.tintHex(accent, 0.95)} 0%, ${this.tintHex(accent, 0.9)} 45%, ${this.tintHex(accent, 0.86)} 100%)`,
    };
  }

  private clearThemeOverrides(): void {
    const root = document.documentElement;
    const vars = [
      "--accent",
      "--accent-foreground",
      "--accent-hover",
      "--accent-muted",
      "--accent-subtle",
      "--ring",
      "--bg",
      "--card",
      "--border",
      "--text",
      "--text-strong",
      "--muted",
      "--surface",
      "--border-soft",
      "--bg-muted",
      "--bg-hover",
      "--app-shell-background",
    ];
    for (const key of vars) root.style.removeProperty(key);
  }

  private applyThemeFromAccent(accent: string): void {
    this.clearThemeOverrides();
    const tokens = this.themeTokensFromAccent(accent);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(tokens)) {
      root.style.setProperty(key, value);
    }
  }

  private loadProfileAppearance(): void {
    try {
      const image = localStorage.getItem(PROFILE_IMAGE_STORAGE_KEY);
      const accent = localStorage.getItem(PROFILE_ACCENT_STORAGE_KEY);
      const displayName = localStorage.getItem(USER_NAME_STORAGE_KEY);
      const lockUntilRaw = localStorage.getItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY);
      const style = localStorage.getItem(STYLE_SELECTION_STORAGE_KEY);
      const provider = localStorage.getItem(PROVIDER_SELECTION_STORAGE_KEY);
      if (image) this.profileImageUrl = image;
      if (accent) this.profileAccent = accent;
      if (displayName && displayName.trim()) this.userDisplayName = this.normalizeUserHandle(displayName.trim()) || "@you";
      if (lockUntilRaw) {
        const parsed = Number.parseInt(lockUntilRaw, 10);
        if (Number.isFinite(parsed) && parsed > Date.now()) {
          this.userNameChangeLockedUntil = parsed;
        } else {
          this.userNameChangeLockedUntil = null;
          localStorage.removeItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY);
        }
      } else {
        this.userNameChangeLockedUntil = null;
      }
      this.accountNameInput = this.userDisplayName;
      const current = this.normalizeUserHandle(this.userDisplayName);
      if (current) {
        const registry = new Set(this.loadHandleRegistry());
        registry.add(current);
        this.saveHandleRegistry([...registry]);
      }
      if (style && style.trim()) this.onboardingStyle = style.trim();
      if (provider && provider.trim()) this.onboardingProvider = provider.trim();
      this.applyThemeFromAccent(this.profileAccent);
    } catch {
      // ignore
    }
  }

  private applyProfileFromServerConfig(config: UiConfigResponse | null): void {
    const user = config?.ui?.user;
    if (!user) return;

    // Only hydrate from server when local profile isn't already set.
    const localHasHandle =
      Boolean((this.userDisplayName ?? "").trim()) && this.userDisplayName !== "@you";
    const localHasAccent = Boolean((this.profileAccent ?? "").trim());
    const localHasImage = Boolean((this.profileImageUrl ?? "").trim());

    if (!localHasHandle && typeof user.handle === "string" && user.handle.trim()) {
      const normalized = this.normalizeUserHandle(user.handle);
      if (normalized) {
        this.userDisplayName = normalized;
        this.accountNameInput = normalized;
        try {
          localStorage.setItem(USER_NAME_STORAGE_KEY, normalized);
        } catch {
          // ignore
        }
      }
    }

    if (!localHasAccent && typeof user.accent === "string" && user.accent.trim()) {
      this.profileAccent = user.accent.trim();
      try {
        localStorage.setItem(PROFILE_ACCENT_STORAGE_KEY, this.profileAccent);
      } catch {
        // ignore
      }
    }

    if (!localHasImage && typeof user.imageUrl === "string" && user.imageUrl.trim()) {
      this.profileImageUrl = user.imageUrl.trim();
      try {
        localStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, this.profileImageUrl);
      } catch {
        // ignore
      }
    }

    if (typeof user.responseMode === "string" && user.responseMode.trim() && !this.onboardingStyle) {
      this.onboardingStyle = user.responseMode.trim();
      try {
        localStorage.setItem(STYLE_SELECTION_STORAGE_KEY, this.onboardingStyle);
      } catch {
        // ignore
      }
    }

    this.applyThemeFromAccent(this.profileAccent);
  }

  private async syncProfileToServer(): Promise<void> {
    if (!this.onboardingComplete) return;
    try {
      await client.updateConfig({
        ui: {
          user: {
            handle: this.userDisplayName,
            accent: this.profileAccent,
            imageUrl: this.profileImageUrl,
            responseMode: this.onboardingStyle || undefined,
          },
        },
      });
      try {
        localStorage.setItem(SERVER_PROFILE_SYNCED_KEY, "1");
      } catch {
        // ignore
      }
    } catch {
      // Best-effort only.
    }
  }

  private saveProfileAppearance(imageUrl: string, accent: string): void {
    this.profileImageUrl = imageUrl;
    this.profileAccent = accent;
    this.applyThemeFromAccent(accent);
    try {
      localStorage.setItem(PROFILE_IMAGE_STORAGE_KEY, imageUrl);
      localStorage.setItem(PROFILE_ACCENT_STORAGE_KEY, accent);
    } catch {
      // ignore
    }
    void this.syncProfileToServer();
  }

  private normalizeUserHandle(name: string): string {
    const base = name
      .trim()
      .replace(/^@+/, "")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "");
    if (!base) return "";
    return `@${base}`;
  }

  private looksLikeApiKey(value: string, keyPrefix: string | null): boolean {
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/\s/.test(trimmed)) return false;
    // Key prefixes are hints from the backend provider catalog.
    if (keyPrefix && keyPrefix.trim()) {
      const prefixes = keyPrefix
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean);
      if (prefixes.length > 0 && !prefixes.some((p) => trimmed.startsWith(p))) return false;
    }
    // Avoid accepting arbitrary short text.
    return trimmed.length >= 20;
  }

  private providerNeedsKey(provider: ProviderOption | null | undefined): boolean {
    return Boolean(provider && provider.envKey && provider.id !== "ollama");
  }

  private isPresetOnboardingName(name: string): boolean {
    const opts = this.onboardingOptions;
    if (!opts) return false;
    const target = name.trim().toLowerCase();
    if (!target) return false;
    const presets = (opts.names ?? []).map((v: string) => String(v).trim().toLowerCase());
    return presets.includes(target);
  }

  private fnv1a32(value: string): number {
    // Small deterministic hash to generate stable-ish suffixes per user without
    // exposing anything sensitive.
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private presetHandleSuffix(ownerId: string, base: string, attempt: number): string {
    // Per-user deterministic suffix (varies by attempt) that looks "degen" but remains readable.
    // Example: "@reimu_gm7k3" / "@reimu_wagmi2p9".
    const words = [
      "gm",
      "wagmi",
      "ape",
      "based",
      "alpha",
      "send",
      "moon",
      "lfg",
      "hodl",
      "degen",
      "rekt",
      "chad",
      "ser",
      "fomo",
    ] as const;
    const h = this.fnv1a32(`${ownerId}:${base}:${attempt}`);
    const word = words[h % words.length];
    const encoded = h.toString(36);
    // 5 chars gives ~60M combos per word (14 words => ~840M), enough to stay unique at scale.
    const tail = encoded.padStart(5, "0").slice(-5);
    return `${word}${tail}`;
  }

  private randomPresetHandleSuffix(): string {
    // Extra safety: if a deterministic suffix ever collides, fall back to randomness.
    // Stays within [a-z0-9_] so it survives normalizeUserHandle().
    const words = [
      "gm",
      "wagmi",
      "ape",
      "based",
      "alpha",
      "send",
      "moon",
      "lfg",
      "hodl",
      "degen",
      "rekt",
      "chad",
      "ser",
      "fomo",
    ] as const;
    const word = words[Math.floor(Math.random() * words.length)];
    const rand = crypto.getRandomValues(new Uint32Array(2));
    const chunk = ((BigInt(rand[0]!) << 32n) | BigInt(rand[1]!)).toString(36);
    const tail = chunk.padStart(10, "0").slice(-10);
    return `${word}${tail}`;
  }

  private loadHandleRegistry(): string[] {
    try {
      const raw = localStorage.getItem(USER_HANDLE_REGISTRY_STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as string[];
      if (!Array.isArray(parsed)) return [];
      return parsed
        .map((v) => this.normalizeUserHandle(v))
        .filter((v) => v.length > 0);
    } catch {
      return [];
    }
  }

  private saveHandleRegistry(values: string[]): void {
    try {
      localStorage.setItem(USER_HANDLE_REGISTRY_STORAGE_KEY, JSON.stringify(values));
    } catch {
      // ignore
    }
  }

  private getOrCreateHandleOwnerId(): string {
    try {
      const existing = localStorage.getItem(USER_HANDLE_OWNER_ID_STORAGE_KEY)?.trim();
      if (existing) return existing;
      const created = crypto.randomUUID();
      localStorage.setItem(USER_HANDLE_OWNER_ID_STORAGE_KEY, created);
      return created;
    } catch {
      return crypto.randomUUID();
    }
  }

  private getUserNameLockRemainingMs(): number {
    const until = this.userNameChangeLockedUntil ?? 0;
    const remaining = until - Date.now();
    if (remaining <= 0) {
      if (this.userNameChangeLockedUntil != null) {
        this.clearUserNameLock();
      }
      return 0;
    }
    return remaining;
  }

  private clearUserNameLock(): void {
    this.userNameChangeLockedUntil = null;
    try {
      localStorage.removeItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private isUserNameChangeLocked(nextHandle?: string): boolean {
    const remaining = this.getUserNameLockRemainingMs();
    if (remaining <= 0) return false;
    if (!nextHandle) return true;
    const current = this.normalizeUserHandle(this.userDisplayName);
    return nextHandle !== current;
  }

  private formatUserNameLockRemaining(remainingMs: number): string {
    const totalMinutes = Math.max(1, Math.ceil(remainingMs / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }

  private async saveUserDisplayName(
    name: string,
    opts?: { allowOfflineFallback?: boolean },
  ): Promise<boolean> {
    const normalized = this.normalizeUserHandle(name);
    if (!normalized) {
      this.nameValidationMessage = "Choose an @name with letters, numbers, or underscores.";
      return false;
    }
    if (normalized.length < 3) {
      this.nameValidationMessage = "@name is too short.";
      return false;
    }

    const current = this.normalizeUserHandle(this.userDisplayName);
    if (this.isUserNameChangeLocked(normalized)) {
      // Local lock can be stale after a full reset. Confirm with backend; if
      // backend has no lock, clear locally and continue.
      try {
        const ownerId = this.getOrCreateHandleOwnerId();
        const check = await client.checkHandle(normalized, ownerId);
        const lockUntil =
          typeof check.lockUntil === "number"
            ? check.lockUntil
            : check.lockUntil == null
              ? null
              : Number.parseInt(String(check.lockUntil), 10);
        if (!lockUntil || !Number.isFinite(lockUntil) || lockUntil <= Date.now()) {
          this.clearUserNameLock();
        } else {
          this.userNameChangeLockedUntil = lockUntil;
          try {
            localStorage.setItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY, String(lockUntil));
          } catch {
            // ignore
          }
        }
      } catch {
        // ignore and keep local lock
      }
      if (!this.isUserNameChangeLocked(normalized)) {
        // Lock was cleared; continue with claim.
      } else {
      const remaining = this.formatUserNameLockRemaining(this.getUserNameLockRemainingMs());
      this.nameValidationMessage = `You can change your @name in ${remaining}.`;
      return false;
      }
    }
    const ownerId = this.getOrCreateHandleOwnerId();
    let claimResult: { lockUntil?: number | null } | null = null;
    try {
      claimResult = await client.claimHandle(normalized, ownerId, current || undefined);
    } catch (err) {
      const status = typeof err === "object" && err !== null && "status" in err
        ? Number((err as { status?: number }).status)
        : 0;
      if (status === 429) {
        const details =
          typeof err === "object" && err !== null && "details" in err
            ? (err as { details?: Record<string, unknown> }).details
            : undefined;
        const lockUntilRaw = details?.lockUntil;
        const lockUntil =
          typeof lockUntilRaw === "number"
            ? lockUntilRaw
            : Number.parseInt(String(lockUntilRaw ?? ""), 10);
        if (Number.isFinite(lockUntil) && lockUntil > Date.now()) {
          this.userNameChangeLockedUntil = lockUntil;
          try {
            localStorage.setItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY, String(lockUntil));
          } catch {
            // ignore
          }
        }
        const remaining = this.formatUserNameLockRemaining(this.getUserNameLockRemainingMs());
        this.nameValidationMessage = `You can change your @name in ${remaining}.`;
        return false;
      }
      if (status === 409) {
        this.nameValidationMessage = `${normalized} is already taken. Choose another @name.`;
        return false;
      }
      if (!opts?.allowOfflineFallback) {
        this.nameValidationMessage = "Could not save @name right now. Try again.";
        return false;
      }
    }

    const registry = new Set(this.loadHandleRegistry());

    if (current) registry.delete(current);
    registry.add(normalized);
    this.saveHandleRegistry([...registry]);

    this.userDisplayName = normalized;
    this.accountNameInput = normalized;
    const returnedLockUntil =
      claimResult && Number.isFinite(claimResult.lockUntil)
        ? Number(claimResult.lockUntil)
        : null;
    const nextLockUntil = returnedLockUntil && returnedLockUntil > Date.now()
      ? returnedLockUntil
      : Date.now() + USER_NAME_CHANGE_LOCK_MS;
    this.userNameChangeLockedUntil = nextLockUntil;
    this.nameValidationMessage = null;
    try {
      localStorage.setItem(USER_NAME_STORAGE_KEY, normalized);
      localStorage.setItem(USER_NAME_CHANGE_LOCK_UNTIL_STORAGE_KEY, String(nextLockUntil));
    } catch {
      // ignore
    }
    return true;
  }

  private hasPendingAccountNameDraft(): boolean {
    const current = this.normalizeUserHandle(this.userDisplayName);
    const draft = this.normalizeUserHandle(this.accountNameInput);
    return Boolean(this.accountNameInput.trim()) && draft !== current;
  }

  private resetAccountNameDraft(): void {
    this.accountNameInput = this.userDisplayName;
    this.nameValidationMessage = null;
  }

  private saveStyleSelection(styleCatchphrase: string): void {
    const value = styleCatchphrase.trim();
    if (!value) return;
    this.onboardingStyle = value;
    try {
      localStorage.setItem(STYLE_SELECTION_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  private async ensureOnboardingOptionsLoaded(): Promise<void> {
    if (this.onboardingOptions) return;
    try {
      this.onboardingOptions = await client.getOnboardingOptions();
    } catch {
      // ignore
    }
  }

  private async toggleStyleSettings(): Promise<void> {
    const opening = !this.styleSettingsOpen;
    this.styleSettingsOpen = opening;
    this.styleUpdateStatus = null;
    if (!opening) return;
    await this.ensureOnboardingOptionsLoaded();
    const styles = this.onboardingOptions?.styles ?? [];
    if (!this.onboardingStyle && styles.length > 0) {
      this.onboardingStyle = styles[0]?.catchphrase ?? "";
    }
  }

  private async openChatStyleSettings(): Promise<void> {
    this.setTab("chat");
    this.styleSettingsOpen = true;
    this.styleUpdateStatus = null;
    await this.ensureOnboardingOptionsLoaded();
    const styles = this.onboardingOptions?.styles ?? [];
    if (!this.onboardingStyle && styles.length > 0) {
      this.onboardingStyle = styles[0]?.catchphrase ?? "";
    }
  }

  private async applyStyleFromChatSettings(): Promise<void> {
    const opts = this.onboardingOptions;
    if (!opts || !this.onboardingStyle) return;
    const selectedStyle = opts.styles.find((s) => s.catchphrase === this.onboardingStyle);
    if (!selectedStyle) return;

    const agentName = "Milaidy";
    const systemPrompt = selectedStyle.system
      ? selectedStyle.system.replace(/\{name\}/g, agentName)
      : `You are ${agentName}, an autonomous AI agent powered by ElizaOS. ${opts.sharedStyleRules}`;

    this.styleUpdateBusy = true;
    this.styleUpdateStatus = null;
    try {
      await client.submitOnboarding({
        name: agentName,
        bio: selectedStyle.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: selectedStyle.style,
        adjectives: selectedStyle.adjectives,
        topics: selectedStyle.topics,
        messageExamples: selectedStyle.messageExamples,
      });
      this.saveStyleSelection(selectedStyle.catchphrase);
      try {
        this.setAgentStatus(await client.restartAgent());
      } catch {
        // ignore restart errors; style is still persisted server-side
      }
      this.styleUpdateStatus = "Response mode updated.";
      this.styleSettingsOpen = false;
    } catch (err) {
      this.styleUpdateStatus = `Failed to update response mode: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.styleUpdateBusy = false;
    }
  }

  private themeColorOptions(): ThemeColorOption[] {
    return [
      { label: "Crimson", value: "#c0392b" },
      { label: "Sun Gold", value: "#d4a017" },
      { label: "Ocean Blue", value: "#3f7ecf" },
      { label: "Violet", value: "#8e44ad" },
      { label: "Mint", value: "#16a085" },
      { label: "Forest", value: "#2d9a5f" },
      { label: "Slate", value: "#4e6a8b" },
      { label: "Coral", value: "#e2572f" },
    ];
  }

  private resolvedOnboardingAccent(): string {
    const name = this.onboardingName.trim();
    const presetNames = this.onboardingOptions?.names ?? [];
    const isPreset = presetNames.includes(name);
    if (!isPreset && this.onboardingCustomAccent) return this.onboardingCustomAccent;
    return this.characterTheme(name || "milaidy").accent;
  }

  private characterTheme(name: string): CharacterTheme {
    const overrides: Record<string, CharacterTheme> = {
      Reimu: { accent: "#c0392b", surface: "rgba(192,57,43,0.10)" },
      Marisa: { accent: "#d4a017", surface: "rgba(212,160,23,0.12)" },
      Sakuya: { accent: "#3f7ecf", surface: "rgba(63,126,207,0.12)" },
      Remilia: { accent: "#8e44ad", surface: "rgba(142,68,173,0.12)" },
      Koishi: { accent: "#16a085", surface: "rgba(22,160,133,0.12)" },
      Yukari: { accent: "#2d9a5f", surface: "rgba(45,154,95,0.12)" },
      Aya: { accent: "#a63d40", surface: "rgba(166,61,64,0.12)" },
      Nitori: { accent: "#1f8f8a", surface: "rgba(31,143,138,0.12)" },
      Sanae: { accent: "#2d9a5f", surface: "rgba(45,154,95,0.12)" },
      Suwako: { accent: "#7b8f2c", surface: "rgba(123,143,44,0.12)" },
      Miku: { accent: "#00a8a8", surface: "rgba(0,168,168,0.12)" },
    };
    if (overrides[name]) return overrides[name];

    const palette = ["#f57a3b", "#3f7ecf", "#16a085", "#9c6dff", "#c94f4f", "#2d9a5f"];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 33 + name.charCodeAt(i)) | 0;
    const accent = palette[Math.abs(hash) % palette.length];
    return { accent, surface: `${accent}1a` };
  }

  private miladyTokenImage(tokenId: number): string {
    return `https://www.miladymaker.net/milady/${tokenId}.png`;
  }

  private async canLoadImage(url: string): Promise<boolean> {
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
  }

  private fallbackCharacterImage(name: string): string {
    const fallbackTokenIds = [16, 19, 112, 241, 251, 339, 385, 777, 1024, 2048, 2571, 3317, 6819, 7577];
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 37 + name.charCodeAt(i)) | 0;
    const tokenId = fallbackTokenIds[Math.abs(hash) % fallbackTokenIds.length];
    return this.miladyTokenImage(tokenId);
  }

  private async fetchCharacterImage(name: string): Promise<string> {
    const normalized = name.trim().toLowerCase();
    const namedCandidates = [
      `https://www.miladymaker.net/milady/${encodeURIComponent(normalized)}.png`,
      `https://www.miladymaker.net/milady/${encodeURIComponent(normalized)}.jpg`,
      `https://www.miladymaker.net/milady/${encodeURIComponent(normalized)}.jpeg`,
      `https://www.miladymaker.net/milady/${encodeURIComponent(normalized)}.webp`,
    ];

    for (const candidate of namedCandidates) {
      if (await this.canLoadImage(candidate)) return candidate;
    }

    const fallback = this.fallbackCharacterImage(name);
    try {
      const ok = await this.canLoadImage(fallback);
      if (ok) return fallback;
    } catch {
      // ignore
    }
    return this.miladyTokenImage(241);
  }

  private async ensureCharacterImage(name: string): Promise<void> {
    const key = name.trim();
    if (!key || this.characterImageByName[key]) return;
    const imageUrl = await this.fetchCharacterImage(key);
    this.characterImageByName = { ...this.characterImageByName, [key]: imageUrl };
    if (this.onboardingName.trim() === key) {
      this.saveProfileAppearance(imageUrl, this.resolvedOnboardingAccent());
    }
  }

  private prefetchCharacterImages(names: string[]): void {
    for (const n of names.slice(0, 8)) {
      void this.ensureCharacterImage(n);
    }
  }

  private characterImage(name: string): string {
    return this.characterImageByName[name] ?? this.fallbackCharacterImage(name);
  }

  // --- Onboarding ---

  private async handleOnboardingNext(): Promise<void> {
    this.onboardingStep += 1;
  }

  private async handleOnboardingFinish(): Promise<void> {
    if (!this.onboardingOptions || this.onboardingFinishing) return;
    this.onboardingFinishing = true;
    try {
      const selectedProvider = this.onboardingOptions.providers.find(
        (p) => p.id === this.onboardingProvider,
      );
      const needsKey = this.providerNeedsKey(selectedProvider);
      const keyLooksValid = needsKey
        ? this.looksLikeApiKey(this.onboardingApiKey, selectedProvider?.keyPrefix ?? null)
        : false;
      this.providerSetupApplying = needsKey && keyLooksValid;

      const style = this.onboardingOptions.styles.find(
        (s) => s.catchphrase === this.onboardingStyle,
      );
      const agentName = "Milaidy";

      const systemPrompt = style?.system
        ? style.system.replace(/\{name\}/g, agentName)
        : `You are ${agentName}, an autonomous AI agent powered by ElizaOS. ${this.onboardingOptions.sharedStyleRules}`;

      const selectedAccent = this.resolvedOnboardingAccent();
      const onboardingNameRaw = this.onboardingName.trim();
      if (!onboardingNameRaw) {
        this.nameValidationMessage = "Choose an @name with letters, numbers, or underscores.";
        return;
      }

      // Preset character names must be globally unique, so we auto-suffix them.
      // Custom typed names are claimed as-is (must be unique globally).
      this.nameValidationMessage = null;
      if (this.isPresetOnboardingName(onboardingNameRaw)) {
        const ownerId = this.getOrCreateHandleOwnerId();
        let claimed = false;
        // Try deterministic suffixes first so the handle is stable for a given user.
        for (let attempt = 0; attempt < 12 && !claimed; attempt++) {
          const candidate = this.normalizeUserHandle(
            `${onboardingNameRaw}_${this.presetHandleSuffix(ownerId, onboardingNameRaw, attempt)}`,
          );
          if (!candidate) continue;
          claimed = await this.saveUserDisplayName(candidate);
          if (!claimed) {
            // If we failed for reasons other than "already taken", don't keep retrying
            // or overwrite the actual error (lock, auth, network, etc.).
            const msg = (this.nameValidationMessage ?? "").toLowerCase();
            if (!msg.includes("already taken")) {
              return;
            }
          }
        }
        // If we somehow collided on all deterministic candidates, fall back to random suffixes.
        for (let attempt = 0; attempt < 20 && !claimed; attempt++) {
          const candidate = this.normalizeUserHandle(
            `${onboardingNameRaw}_${this.randomPresetHandleSuffix()}`,
          );
          if (!candidate) continue;
          claimed = await this.saveUserDisplayName(candidate);
          if (!claimed) {
            const msg = (this.nameValidationMessage ?? "").toLowerCase();
            if (!msg.includes("already taken")) {
              return;
            }
          }
        }
        if (!claimed) {
          // Only hit this path if every candidate was taken.
          this.nameValidationMessage =
            "Could not allocate a unique @name right now. Please try again.";
          return;
        }
      } else {
        const ok = await this.saveUserDisplayName(onboardingNameRaw);
        if (!ok) return;
      }

      // Lock in the chosen avatar image before leaving onboarding. This avoids
      // persisting the default /pfp.jpg when image prefetch hasn't completed yet.
      const selectedAvatarKey = this.onboardingName.trim();
      if (selectedAvatarKey) {
        await this.ensureCharacterImage(selectedAvatarKey);
        this.saveProfileAppearance(this.characterImage(selectedAvatarKey), selectedAccent);
      } else {
        this.saveProfileAppearance(this.profileImageUrl, selectedAccent);
      }
      this.applyThemeFromAccent(selectedAccent);
      this.saveStyleSelection(this.onboardingStyle);
      try {
        if (this.onboardingProvider) {
          localStorage.setItem(PROVIDER_SELECTION_STORAGE_KEY, this.onboardingProvider);
        }
      } catch {
        // ignore
      }
      this.onboardingComplete = true;
      // Always land in Chat after onboarding even if the URL previously pointed
      // to another tab (e.g. after a reset flow).
      this.applyTab("chat", { pushHistory: true });

      // Do backend sync in background so mobile users never get stuck on Enter.
      void (async () => {
        let onboardingSaved = false;
        const payload = {
          name: agentName,
          bio: style?.bio ?? ["An autonomous AI agent."],
          systemPrompt,
          style: style?.style,
          adjectives: style?.adjectives,
          topics: style?.topics,
          messageExamples: style?.messageExamples,
          provider: this.onboardingProvider || undefined,
          providerApiKey: this.onboardingApiKey || undefined,
          telegramBotToken: this.onboardingTelegramToken || undefined,
          discordBotToken: this.onboardingDiscordToken || undefined,
        };
        for (let attempt = 0; attempt < 3 && !onboardingSaved; attempt++) {
          try {
            await client.submitOnboarding(payload);
            onboardingSaved = true;
          } catch (err) {
            console.error(`Onboarding submit failed (attempt ${attempt + 1}/3):`, err);
            if (attempt < 2) {
              await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
            }
          }
        }

        if (onboardingSaved) {
          // Persist profile/theme to backend config so it survives across devices.
          await this.syncProfileToServer();
          try {
            this.setAgentStatus(await client.restartAgent());
          } catch {
            // ignore
          }
          // Refresh plugins so the chat lock can clear without a manual reload.
          try {
            await this.loadPlugins();
          } catch {
            // ignore
          } finally {
            this.providerSetupApplying = false;
          }
        } else {
          this.providerSetupApplying = false;
        }
      })();
    } catch (err) {
      console.error("Onboarding finish failed:", err);
      this.nameValidationMessage = "Could not finish setup. Try again.";
    } finally {
      this.onboardingFinishing = false;
    }
  }

  // --- Render ---

  render() {
    if (this.onboardingLoading) {
      return html`<div class="app-shell"><div class="empty-state">Loading...</div></div>`;
    }

    if (this.authRequired) {
      return this.renderPairing();
    }

    if (!this.onboardingComplete) {
      return this.renderOnboarding();
    }

    return html`
      <div class="app-shell">
        <div class="bg-brand-layer" aria-hidden="true">
          <img class="bg-brand-mark a" src="/pfp.jpg" alt="" />
        </div>
        ${this.renderHeader()}
        ${this.renderMobileTabbar()}
        ${this.uiNotice
          ? html`<div class="app-notice" role="status" aria-live="polite">${this.uiNotice}</div>`
          : ""}
        <div class="layout">
          <aside class="sidebar">${this.renderNav()}</aside>
          <main class="main">${this.renderView()}</main>
          <aside class="context-rail">${this.renderContextRail()}</aside>
        </div>
        <footer>milaidy</footer>
        ${this.renderActionConfirmModal()}
      </div>
    `;
  }

  private renderMobileTabbar() {
    const navTabs: Tab[] = ["chat", "accounts", "inventory", "apps", "ai-setup", "config"];
    return html`
      <div class="mobile-tabbar">
        ${navTabs.map(
          (t) => html`
            <a
              href=${pathForTab(t, this.basePath)}
              class=${this.tab === t ? "active" : ""}
              @click=${(e: Event) => {
                e.preventDefault();
                this.setTab(t);
              }}
            >${titleForTab(t)}</a>
          `,
        )}
      </div>
    `;
  }

  private async handlePairingSubmit(): Promise<void> {
    const code = this.pairingCodeInput.trim();
    if (!code) {
      this.pairingError = "Enter the pairing code from the server logs.";
      return;
    }
    this.pairingError = null;
    this.pairingBusy = true;
    try {
      const { token } = await client.pair(code);
      client.setToken(token);
      window.location.reload();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === 410) {
        this.pairingError = "Pairing code expired. Check logs for a new code.";
      } else if (status === 429) {
        this.pairingError = "Too many attempts. Try again later.";
      } else {
        this.pairingError = "Pairing failed. Check the code and try again.";
      }
    } finally {
      this.pairingBusy = false;
    }
  }

  private renderPairing() {
    const expires =
      this.pairingExpiresAt ? Math.max(0, Math.round((this.pairingExpiresAt - Date.now()) / 60000)) : null;
    return html`
      <div class="app-shell">
        <div class="pairing-shell">
          <div class="pairing-title">Pair This UI</div>
          <div class="pairing-sub">
            ${this.pairingEnabled
              ? html`Enter the pairing code printed in the Milaidy server logs.${expires != null
                ? html` Code expires in about ${expires} minute${expires === 1 ? "" : "s"}.` : ""}`
              : html`Pairing is disabled. Set <code>MILAIDY_PAIRING_DISABLED</code> to <code>0</code> to enable pairing.`}
          </div>
          <input
            class="pairing-input"
            .value=${this.pairingCodeInput}
            placeholder="XXXX-XXXX"
            @input=${(e: Event) => { this.pairingCodeInput = (e.target as HTMLInputElement).value; }}
          />
          <div class="pairing-actions">
            <button class="lifecycle-btn" @click=${this.handlePairingSubmit} ?disabled=${this.pairingBusy}>
              ${this.pairingBusy ? "Pairing..." : "Pair"}
            </button>
          </div>
          ${this.pairingError ? html`<div class="pairing-error">${this.pairingError}</div>` : null}
        </div>
      </div>
    `;
  }

  private renderActionConfirmModal() {
    if (!this.actionConfirmOpen) return null;
    return html`
      <div class="modal-backdrop" @click=${() => this.closeActionConfirm()}>
        <div class="modal-card" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-head">${this.actionConfirmTitle}</div>
          <div class="modal-body">
            <div>${this.actionConfirmBody}</div>
          </div>
          <div class="modal-actions">
            <button class="plugin-secondary-btn" ?disabled=${this.actionConfirmBusy} @click=${() => this.closeActionConfirm()}>
              Cancel
            </button>
            <button
              class="btn plugin-pill-btn"
              style=${this.actionConfirmDanger ? "background:var(--danger,#c94f4f);border-color:var(--danger,#c94f4f);" : ""}
              ?disabled=${this.actionConfirmBusy}
              @click=${() => void this.confirmActionConfirm()}
            >${this.actionConfirmBusy ? "Processing..." : this.actionConfirmButton}</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderHeader() {
    const status = this.agentStatus;
    const state = status?.state ?? "not_started";
    const name = this.userDisplayName || "@you";
    const chosenProviderId = (this.onboardingProvider ?? "").trim();
    const chosenProvider =
      chosenProviderId ? (this.plugins.find((p) => p.id === chosenProviderId) ?? null) : null;
    const activeProvider =
      this.plugins.find((p) => p.category === "ai-provider" && p.enabled) ?? null;
    const providerForChat = chosenProvider ?? activeProvider;
    const providerConfigured = providerForChat ? this.isChatProviderReady(providerForChat) : false;
    const configuredProvider = providerConfigured ? providerForChat : null;
    const modelRaw = status?.model?.trim() ?? "";
    const normalizedModel =
      modelRaw && modelRaw.toLowerCase() !== "unknown"
        ? modelRaw.split("/").slice(-1)[0]
        : "";
    const modelName = normalizedModel || configuredProvider?.name || (providerConfigured ? "Connected" : "Not set");
    const walletConnected = Boolean(this.walletConfig?.solanaConfiguredAddress || this.walletConfig?.evmConfiguredAddress);

    return html`
      <div class="header-shell">
        <header>
          <div style="display:flex;align-items:center;gap:12px;">
            <div class="brand-block">
              <img class="brand-mark" src="/pfp.jpg" alt="milAIdy" />
              <div class="brand-copy">
                <span class="brand-title">milAIdy</span>
                <span class="brand-sub">Personal AI Workspace</span>
              </div>
            </div>
            <img
              src=${this.profileImageUrl}
              alt="Profile"
              style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:2px solid ${this.profileAccent};"
              @error=${(e: Event) => {
                const img = e.currentTarget as HTMLImageElement;
                img.src = "/pfp.jpg";
              }}
            />
            <span class="logo">${name}</span>
            ${this.renderWalletIcon()}
          </div>
          <div class="status-bar">
          <div class="header-meta">
            <span class="header-chip">Model: <b>${modelName}</b></span>
            <span class="header-chip ${walletConnected ? "ok" : ""}">
              <span class="verify-dot ${walletConnected ? "on" : ""}"></span>
              Wallet: <b>${walletConnected ? "Connected" : "Not connected"}</b>
            </span>
          </div>
          <span class="status-pill ${state}">${state}</span>
          ${state === "not_started" || state === "stopped" || state === "paused"
            ? html`<button class="lifecycle-btn" @click=${this.handleStart}>Start</button>`
            : state === "restarting"
              ? html`<span class="lifecycle-btn" style="opacity:0.6;cursor:default;">Restarting…</span>`
              : html`
                  <button class="lifecycle-btn" @click=${this.handleStop}>Stop</button>
                `}
            <button class="lifecycle-btn" @click=${this.handleRestart} ?disabled=${state === "restarting" || state === "not_started"} title="Restart the agent (reload code, config, plugins)">Restart</button>
          </div>
        </header>
      </div>
    `;
  }

  private renderWalletIcon() {
    const w = this.walletAddresses;
    if (!w || (!w.evmAddress && !w.solanaAddress)) return html``;

    return html`
      <div class="wallet-wrapper">
        <button class="wallet-btn" @click=${() => this.setTab("inventory")}
                title="View Inventory">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/>
            <path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/>
            <path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/>
          </svg>
        </button>
      </div>
    `;
  }

  private async copyToClipboard(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
  }

  private renderNav() {
    const navTabs: Tab[] = ["chat", "inventory", "apps", "ai-setup", "accounts", "config"];
    const search = this.sessionSearch.trim().toLowerCase();
    const visibleSessions = this.getVisibleSessions(search);
    const topVisibleSessions = this.getTopVisibleSessions(visibleSessions, 16);

    return html`
      <nav>
        <div class="nav-group">
          <div class="nav-label">Main</div>
          ${navTabs.map(
            (t) => html`
              <a
                href=${pathForTab(t, this.basePath)}
                class=${this.tab === t ? "active" : ""}
                @click=${(e: Event) => {
                  e.preventDefault();
                  this.setTab(t);
                }}
              >${titleForTab(t)}</a>
            `,
          )}
        </div>

        <div class="nav-group">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:6px;">
            <div class="nav-label">Chats</div>
            <button class="rail-btn" style="padding:3px 8px;" @click=${() => this.createNewSession()}>New chat</button>
          </div>
          <input
            class="plugin-search"
            style="margin:0;font-size:12px;padding:6px 8px;width:100%;max-width:100%;min-width:0;box-sizing:border-box;"
            placeholder="Search chats"
            .value=${this.sessionSearch}
            @input=${(e: Event) => { this.sessionSearch = (e.target as HTMLInputElement).value; }}
          />
          <div style="display:grid;gap:6px;">
            ${guard([topVisibleSessions, this.activeSessionId, this.tab], () =>
              repeat(
                topVisibleSessions,
                (s) => s.id,
                (s) => html`
                  <div style="display:flex;align-items:center;gap:6px;">
                    <a
                      href=${pathForTab("chat", this.basePath)}
                      class=${this.activeSessionId === s.id && this.tab === "chat" ? "active" : ""}
                      style="flex:1 1 auto;min-width:0;"
                      @click=${(e: Event) => {
                        e.preventDefault();
                        this.switchSession(s.id);
                        this.setTab("chat");
                      }}
                      title=${this.formatSessionUpdatedLabel(s.updatedAt)}
                    >${s.name}</a>
                    <button
                      class="plugin-secondary-btn"
                      style="padding:4px 8px;font-size:10px;line-height:1;white-space:nowrap;"
                      title="Clear this chat"
                      @click=${(e: Event) => this.handleSidebarClearChat(s.id, e)}
                    >Clear</button>
                  </div>
                `,
              ),
            )}
            ${visibleSessions.length === 0
              ? html`<div style="font-size:12px;color:var(--muted);padding:2px 0;">No chats</div>`
              : ""}
          </div>
        </div>
      </nav>
    `;
  }

  private renderContextRail() {
    const state = this.agentStatus?.state ?? "not_started";
    const enabledPlugins = this.plugins.filter((p) => p.enabled).length;
    const activeProvider = this.plugins.find((p) => p.category === "ai-provider" && p.enabled) ?? null;
    const chosenProviderId = (this.onboardingProvider ?? "").trim();
    const chosenProvider =
      chosenProviderId ? (this.plugins.find((p) => p.id === chosenProviderId) ?? null) : null;
    const providerForChat = chosenProvider ?? activeProvider;
    const configuredProvider = this.plugins.find((p) => this.isChatProviderReady(p)) ?? null;
    const providerReady = Boolean(providerForChat && this.isChatProviderReady(providerForChat));
    const providerIssue =
      !providerForChat
        ? "No provider enabled"
        : providerForChat.validationErrors.length > 0
          ? (providerForChat.validationErrors[0]?.message ?? "Needs setup")
          : !this.isChatProviderReady(providerForChat)
            ? "Provider key not connected"
            : null;
    const providerHealthLabel = this.providerHealth?.label ?? (providerReady ? "Healthy" : "Not ready");
    const providerHealthDetail = this.providerHealth?.detail ?? providerIssue ?? null;
    const providerHealthTone =
      this.providerHealth?.tone ?? (providerReady ? "ok" : "warn");
    const polymarket = this.plugins.find((p) => p.id === "polymarket");
    const polymarketEnabled = Boolean(polymarket?.enabled);
    const spendExecEnabled = this.pluginExecutionToggles.polymarket === true;
    const spendExecLabel = polymarketEnabled
      ? (spendExecEnabled ? "Allowed" : "Blocked")
      : "Unavailable";
    const spendExecClass = !polymarketEnabled
      ? "warn"
      : (spendExecEnabled ? "risk" : "warn");
    const solanaSigning = this.walletConfig?.solanaSigningEnabled === true;
    const connectedWallet =
      this.walletConfig?.solanaConfiguredAddress
      ?? this.walletConfig?.evmConfiguredAddress
      ?? this.walletConfig?.solanaAddress
      ?? this.walletConfig?.evmAddress
      ?? this.walletAddresses?.solanaAddress
      ?? this.walletAddresses?.evmAddress
      ?? null;
    const walletLabel = connectedWallet
      ? `${connectedWallet.slice(0, 4)}...${connectedWallet.slice(-4)}`
      : "None";
    const priceSource = this.walletConfig?.pricePublicSource
      ? "Live"
      : this.walletConfig?.heliusKeySet || this.walletConfig?.birdeyeKeySet
        ? "Configured"
        : "Unavailable";
    const compactUsd = (value: number): string => {
      if (!Number.isFinite(value) || value <= 0) return "$0";
      const rounded = Math.round(value);
      if (Math.abs(value - rounded) < 0.0001) return `$${rounded}`;
      return `$${value.toFixed(2)}`;
    };
    const spendGuard = this.securitySpendGuardEnabled
      ? `On · ${compactUsd(this.securityBetPerTradeLimitUsd)}/${compactUsd(this.securityBetDailyLimitUsd)}`
      : "Off";
    const deviceLabel = this.deviceProfile === "seeker" ? "Seeker" : "Standard";

    return html`
      <div class="rail-stack">
        <div class="rail-card">
          <div class="rail-title">Agent Status</div>
          <div class="rail-strong">Milaidy · ${state}</div>
          <div class="status-badge-grid">
            <div class="status-badge ${providerReady ? "ok" : "warn"}">Model Provider<b>${providerReady ? "Ready" : "Not Ready"}</b></div>
            <div class="status-badge ${enabledPlugins > 0 ? "ok" : "warn"}">Tools Loaded<b>${enabledPlugins}</b></div>
            <div class="status-badge ${polymarketEnabled ? "ok" : "warn"}">Polymarket<b>${polymarketEnabled ? "Enabled" : "Disabled"}</b></div>
            <div class="status-badge ${solanaSigning ? "ok" : "warn"}">Solana Signing<b>${solanaSigning ? "Enabled" : "Disabled"}</b></div>
            <div class="status-badge ${spendExecClass}">Bet Execution<b>${spendExecLabel}</b></div>
          </div>
          <div class="rail-sub" style="margin-top:8px;">
            Chat happens in Chat. Settings tabs control what Milaidy can do.
          </div>
          <div class="rail-detail-list">
            <div class="rail-detail-item">
              <span class="rail-detail-k">Provider</span>
              <span class="rail-detail-v">${configuredProvider?.name ?? activeProvider?.name ?? (providerReady ? "Connected" : "Not connected")}</span>
            </div>
            ${!providerReady && providerIssue
              ? html`
                  <div class="rail-detail-item">
                    <span class="rail-detail-k">Fix</span>
                    <span class="rail-detail-v" style="color:var(--warn);">${providerIssue}</span>
                  </div>
                `
              : ""}
            <div class="rail-detail-item">
              <span class="rail-detail-k">Provider health</span>
              <span
                class="rail-detail-v"
                style=${providerHealthTone === "ok"
                  ? "color:var(--ok);"
                  : providerHealthTone === "risk"
                    ? "color:var(--danger);"
                    : "color:var(--warn);"}
                title=${providerHealthDetail ?? providerHealthLabel}
              >${providerHealthLabel}</span>
            </div>
            <div class="rail-detail-item">
              <span class="rail-detail-k">Wallet</span>
              <span class="rail-detail-v">${walletLabel}</span>
            </div>
            <div class="rail-detail-item">
              <span class="rail-detail-k">Price Feed</span>
              <span class="rail-detail-v">${priceSource}</span>
            </div>
            <div class="rail-detail-item">
              <span class="rail-detail-k">Spend Guard</span>
              <span class="rail-detail-v" title=${spendGuard}>${spendGuard}</span>
            </div>
            <div class="rail-detail-item">
              <span class="rail-detail-k">Device</span>
              <span class="rail-detail-v">${deviceLabel}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderAccounts() {
    const walletSol = this.walletConfig?.solanaConfiguredAddress ?? this.walletConfig?.solanaAddress ?? this.walletAddresses?.solanaAddress ?? "";
    const walletEvm = this.walletConfig?.evmConfiguredAddress ?? this.walletConfig?.evmAddress ?? this.walletAddresses?.evmAddress ?? "";
    const walletConnected = Boolean(walletSol || walletEvm);
    const themeLabel = this.themeColorOptions().find((c) => c.value.toLowerCase() === this.profileAccent.toLowerCase())?.label ?? "Custom";
    const currentHandle = this.normalizeUserHandle(this.userDisplayName);
    const draftHandle = this.normalizeUserHandle(this.accountNameInput);
    const userNameLockRemainingMs = this.getUserNameLockRemainingMs();
    const userNameLocked = this.isUserNameChangeLocked(draftHandle);
    const userNameLockLabel = userNameLockRemainingMs > 0
      ? this.formatUserNameLockRemaining(userNameLockRemainingMs)
      : "48h";
    const canSaveName = Boolean(
      this.accountNameInput.trim()
      && draftHandle
      && draftHandle.length >= 3
      && draftHandle !== currentHandle,
    ) && !userNameLocked;
    const canCancelNameDraft = this.hasPendingAccountNameDraft();

    return html`
      <h2>Account</h2>
      <p class="subtitle">Account information, selected theme, display name, wallet status, and Milaidy response mode.</p>

      <div class="plugin-dashboard">
        <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
          <div class="plugin-item-top">
            <div style="display:flex;gap:12px;align-items:flex-start;flex:1;">
              <img
                src=${this.profileImageUrl}
                alt="Account avatar"
                style="width:54px;height:54px;border-radius:12px;object-fit:cover;border:2px solid ${this.profileAccent};"
                @error=${(e: Event) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.src = "/pfp.jpg";
                }}
              />
              <div style="flex:1;min-width:0;">
                <div class="plugin-title-row">
                  <div class="plugin-name">Profile</div>
                  <span class="plugin-state-tag ok">Active</span>
                </div>
                <div class="plugin-desc">Name used across your Milaidy workspace.</div>
              </div>
            </div>
          </div>
          <div class="plugin-settings-body">
            <label style="font-size:12px;color:var(--muted);">Display name</label>
            <input
              type="text"
              .value=${this.accountNameInput}
              placeholder="@yourname"
              @input=${(e: Event) => { this.accountNameInput = (e.target as HTMLInputElement).value; }}
            />
            <div style="display:flex;justify-content:flex-end;gap:8px;">
              <button
                class="plugin-secondary-btn"
                ?disabled=${!canCancelNameDraft}
                @click=${() => this.resetAccountNameDraft()}
              >Cancel</button>
              <button
                class="btn plugin-pill-btn"
                ?disabled=${!canSaveName}
                @click=${() => {
                  const next = this.accountNameInput.trim();
                  if (!next) {
                    this.nameValidationMessage = "Choose an @name.";
                    return;
                  }
                  void this.saveUserDisplayName(next);
                }}
              >Save name</button>
            </div>
            ${userNameLocked
              ? html`<div style="font-size:12px;color:var(--muted);">You can change your @name in ${userNameLockLabel}.</div>`
              : ""}
            ${this.nameValidationMessage
              ? html`<div style="font-size:12px;color:#c94f4f;">${this.nameValidationMessage}</div>`
              : ""}
          </div>
        </div>

        <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
          <div class="plugin-item-top">
            <div style="flex:1;">
              <div class="plugin-title-row">
                <div class="plugin-name">Theme</div>
                <span class="plugin-state-tag">${themeLabel}</span>
              </div>
              <div class="plugin-desc">Accent color: <code>${this.profileAccent}</code></div>
            </div>
          </div>
          <div class="plugin-settings-body">
            <div class="theme-swatch-row" style="margin-top:0;">
              ${this.themeColorOptions().map((c) => html`
                <button
                  class="theme-swatch ${this.profileAccent === c.value ? "selected" : ""}"
                  style="background:${c.value};"
                  title=${c.label}
                  @click=${() => this.saveProfileAppearance(this.profileImageUrl, c.value)}
                >${this.profileAccent === c.value ? "✓" : ""}</button>
              `)}
            </div>
          </div>
        </div>

        <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
          <div class="plugin-item-top">
            <div style="flex:1;">
              <div class="plugin-title-row">
                <div class="plugin-name">Wallet</div>
                <span class="plugin-state-tag ${walletConnected ? "ok" : "warn"}">${walletConnected ? "Connected" : "Not connected"}</span>
              </div>
              <div class="plugin-desc">Connected wallets used for portfolio and transactions.</div>
            </div>
          </div>
          <div class="plugin-settings-body">
            <div style="font-size:12px;color:var(--muted);">Solana: ${walletSol ? html`<code>${walletSol}</code>` : "not connected"}</div>
            <div style="font-size:12px;color:var(--muted);">EVM: ${walletEvm ? html`<code>${walletEvm}</code>` : "not connected"}</div>
            <div style="display:flex;gap:8px;justify-content:flex-end;">
              <button class="plugin-secondary-btn" @click=${() => this.setTab("inventory")}>Open portfolio</button>
              <button class="plugin-secondary-btn" @click=${() => this.setTab("config")}>Wallet security</button>
            </div>
          </div>
        </div>

        <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
          <div class="plugin-item-top">
            <div style="flex:1;">
              <div class="plugin-title-row">
                <div class="plugin-name">Milaidy Response Mode</div>
                <span class="plugin-state-tag">${this.onboardingStyle || "Default"}</span>
              </div>
              <div class="plugin-desc">Your response mode is set. You can edit it anytime.</div>
            </div>
          </div>
          <div class="plugin-settings-body">
            <div style="display:flex;justify-content:flex-end;">
              <button class="plugin-secondary-btn" @click=${() => void this.openChatStyleSettings()}>Open chat settings</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderView() {
    switch (this.tab) {
      case "chat": return this.renderChat();
      case "inventory": return this.renderInventory();
      case "accounts": return this.renderAccounts();
      case "ai-setup": return this.renderPlugins("ai");
      case "apps": return this.renderApps();
      case "skills": return this.renderSkills();
      case "config": return this.renderConfig();
      case "logs": return this.renderLogs();
      default: return this.renderChat();
    }
  }

  private renderChat() {
    const state = this.agentStatus?.state ?? "not_started";
    const activeSession = this.chatSessions.find((s) => s.id === this.activeSessionId) ?? null;
    const sessionName = activeSession?.name ?? "Current Chat";
    const enabledToolCount = this.plugins.filter((p) => p.enabled).length;
    const activeProvider = this.plugins.find((p) => p.category === "ai-provider" && p.enabled) ?? null;
    const chosenProviderId = (this.onboardingProvider ?? "").trim();
    const chosenProvider =
      chosenProviderId ? (this.plugins.find((p) => p.id === chosenProviderId) ?? null) : null;
    const providerForChat = chosenProvider ?? activeProvider;
    const chatProviderReady = providerForChat ? this.isChatProviderReady(providerForChat) : false;
    const chatProviderIssue =
      chatProviderReady
        ? null
        : this.providerSetupApplying
          ? "Applying your model provider settings. Milaidy will unlock chat after restart."
          : chosenProvider
            ? !chosenProvider.enabled
              ? `Enable ${chosenProvider.name} in AI Settings to unlock chat.`
              : chosenProvider.validationErrors.length > 0
                ? (chosenProvider.validationErrors[0]?.message ?? "Provider needs setup.")
                : (chosenProvider.envKey ?? "").trim() && chosenProvider.id !== "ollama"
                  ? `Add your ${chosenProvider.name} API key in AI Settings to unlock chat.`
                  : "Provider needs setup."
          : !activeProvider
            ? "Enable a model provider in AI Settings to start chatting."
            : activeProvider.validationErrors.length > 0
              ? (activeProvider.validationErrors[0]?.message ?? "Provider needs setup.")
              : "Provider needs setup.";
    const chatLockBanner = !chatProviderReady
      ? html`
          <div style="margin:10px 0 6px;padding:8px 10px;border:1px solid rgba(241,196,15,0.55);background:rgba(241,196,15,0.10);border-radius:12px;font-size:12px;color:var(--text-strong);display:flex;justify-content:space-between;gap:10px;align-items:center;">
            <div style="color:var(--muted);line-height:1.35;flex:1;min-width:0;">
              <b style="color:var(--text-strong);">Chat locked:</b> ${chatProviderIssue}
            </div>
            <button class="plugin-secondary-btn" @click=${() => void this.openAiProviderSettingsFromChat()}>Open AI Settings</button>
          </div>
        `
      : "";
    const inputLen = this.chatInput.trim().length;
    const showStop = this.chatSending;
    const showStartResume = !this.chatSending && this.chatResumePending;
    const hasMessageOverflow =
      !this.chatShowAllMessages && this.chatMessages.length > MAX_VISIBLE_CHAT_MESSAGES;
    const renderedMessages = hasMessageOverflow
      ? this.chatMessages.slice(-MAX_VISIBLE_CHAT_MESSAGES)
      : this.chatMessages;
    const hiddenMessageCount = hasMessageOverflow
      ? this.chatMessages.length - renderedMessages.length
      : 0;

	    if (state === "not_started" || (state === "stopped" && !this.chatResumePending)) {
	      return html`
	        <h2>Chat</h2>
	        <div class="start-agent-box">
	          <p>Milaidy is paused. Start the agent to begin chatting.</p>
	          <div style="display:flex;flex-direction:column;align-items:center;gap:8px;">
	            <button class="btn" style="min-width:180px;" @click=${this.handleStart}>Start Agent</button>
	            <button class="btn btn-outline" style="min-width:180px;" @click=${() => void this.toggleStyleSettings()}>Response mode</button>
	          </div>
	        </div>
          ${chatLockBanner}
	        ${this.styleSettingsOpen ? this.renderChatStylePanel() : ""}
	      `;
	    }

    return html`
      <div class="chat-container">
        <div class="chat-header-row">
          <div class="chat-title-group">
            <h2 class="chat-title">Milaidy Chat</h2>
            <div class="chat-title-sub">Chat-based conversation with memory + tools</div>
            <div class="chat-header-chips">
              <span class="chat-head-chip">Session: ${sessionName}</span>
              <span class="chat-head-chip">Tools: ${enabledToolCount}</span>
            </div>
          </div>
          <div class="chat-header-actions">
            <button class="clear-btn" @click=${() => this.createNewSession()}>New Chat</button>
            ${this.activeSessionId
              ? html`<button class="clear-btn" title="Delete current chat" @click=${this.handleHeaderClearActiveChat}>X</button>`
              : ""}
          </div>
        </div>
        <div class="chat-presence">
          <span class="chat-presence-dot"></span>
          <span>
            ${this.chatSending
              ? "Milaidy is working on your request."
              : this.chatResumePending
                ? "Response stopped. Add context if needed, then press Start."
                : "Milaidy is live."}
          </span>
        </div>
        ${chatLockBanner}
	        <div class="chat-messages" @scroll=${this.handleChatScroll}>
          ${hasMessageOverflow
            ? html`
                <div style="margin:0 0 8px 0;padding:8px 10px;border:1px solid var(--border-soft);border-radius:10px;background:var(--bg-muted);font-size:12px;color:var(--muted);display:flex;justify-content:space-between;align-items:center;gap:8px;">
                  <span>Showing latest ${renderedMessages.length} messages (${hiddenMessageCount} earlier hidden)</span>
                  <button
                    class="plugin-secondary-btn"
                    style="padding:4px 10px;font-size:11px;"
                    @click=${() => { this.chatShowAllMessages = true; }}
                  >Show full chat</button>
                </div>
              `
            : ""}
          ${this.chatMessages.length === 0
            ? html`
                <div class="chat-empty">
                  <div class="chat-empty-title">Start your first conversation</div>
                  <div class="chat-empty-sub">
                    Ask Milaidy for market context, portfolio insight, or connected-app actions.
                  </div>
	                  <div class="chat-suggest-grid">
	                    ${CHAT_QUICK_PROMPTS.slice(0, 4).map(
	                      (prompt) => html`
	                        <button class="chat-suggest-btn" @click=${() => this.useChatPrompt(prompt)}>
	                          ${prompt}
	                        </button>
	                      `,
	                    )}
	                  </div>
	                </div>
              `
            : guard([renderedMessages, this.userDisplayName, this.profileImageUrl], () =>
                repeat(
                  renderedMessages,
                  (msg, idx) => `${msg.role}:${msg.timestamp}:${idx}`,
                  (msg) => html`
                    <div class="chat-msg ${msg.role}">
                      <div class="chat-avatar ${msg.role === "assistant" ? "assistant" : ""}">
                        ${msg.role === "assistant"
                          ? html`<img src="/pfp.jpg" alt="Milaidy" />`
                          : html`<img src=${this.profileImageUrl} alt="@you" @error=${(e: Event) => {
                            const img = e.currentTarget as HTMLImageElement;
                            img.src = "/pfp.jpg";
                          }} />`}
                      </div>
                      <div class="chat-body">
                        <div class="chat-meta">
                          <span>${msg.role === "user" ? (this.userDisplayName || "@you") : "Milaidy"}</span>
                          <span class="chat-time">${this.formatChatTime(msg.timestamp || Date.now())}</span>
                        </div>
                        <div class="chat-bubble">${this.renderChatBubbleText(msg)}</div>
                      </div>
                    </div>
                  `,
                ),
              )}
          <div class="chat-end-anchor" aria-hidden="true"></div>
        </div>
        ${this.chatShowJumpToLatest
          ? html`
              <button
                class="chat-jump-latest"
                @click=${() => this.scrollChatToLatest("smooth", true)}
                title="Jump to latest messages"
                aria-label="Jump to latest messages"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 9l6 6 6-6"></path>
                </svg>
              </button>
            `
          : ""}
        <div class="chat-input-row">
          <textarea
            class="chat-input"
            rows="1"
            placeholder=${!chatProviderReady
              ? "Connect a model provider in AI Settings to chat..."
              : this.chatResumePending
                ? "Add new context before restarting..."
                : "Message Milaidy..."}
            .value=${this.chatInput}
            @input=${this.handleChatInput}
            @keydown=${this.handleChatKeydown}
            ?disabled=${this.chatSending || !chatProviderReady}
          ></textarea>
          <div class="chat-send-stack">
            ${(showStop || showStartResume) && chatProviderReady
              ? html`
                  <button
                    class="chat-control-btn"
                    @click=${showStop
                      ? () => void this.handleChatStop()
                      : () => void this.handleChatResumeStart()}
                  >
                    ${showStop ? "Stop" : "Start"}
                  </button>
                `
              : ""}
            <button
              class="chat-send-btn btn"
              @click=${() => void this.handleChatSend()}
              ?disabled=${this.chatSending || !chatProviderReady}
            >
              ${this.chatSending ? "..." : "Send"}
            </button>
          </div>
        </div>
        <div class="chat-composer-foot">
          <div class="chat-typing">
            ${this.chatSending
              ? html`
                  <span class="chat-typing live">
                    <span class="chat-typing-signal" aria-hidden="true"></span>
                    <span class="chat-typing-dots"><span></span><span></span><span></span></span>
                    <span class="chat-typing-status">
                      <span class="chat-typing-label">Milaidy is responding</span>
                      <span class="chat-typing-sub">live</span>
                    </span>
                  </span>
                `
              : html`<span>Milaidy can use enabled tools while staying in chat with you.</span>`}
          </div>
          <div class="chat-count">${inputLen}/12000</div>
        </div>
        <div class="chat-tools-row">
          <div class="chat-tools-group">
            <button
              class="chat-style-settings-btn"
              title="Open response mode settings"
              aria-label="Open response mode settings"
              @click=${() => void this.toggleStyleSettings()}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 3a2 2 0 0 1 2 2v1.1a6 6 0 0 1 1.7.7l.8-.8a2 2 0 1 1 2.8 2.8l-.8.8c.3.5.5 1.1.7 1.7H20a2 2 0 1 1 0 4h-1.1a6 6 0 0 1-.7 1.7l.8.8a2 2 0 1 1-2.8 2.8l-.8-.8a6 6 0 0 1-1.7.7V20a2 2 0 1 1-4 0v-1.1a6 6 0 0 1-1.7-.7l-.8.8a2 2 0 1 1-2.8-2.8l.8-.8a6 6 0 0 1-.7-1.7H4a2 2 0 1 1 0-4h1.1a6 6 0 0 1 .7-1.7l-.8-.8a2 2 0 1 1 2.8-2.8l.8.8c.5-.3 1.1-.5 1.7-.7V5a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="1.5"/>
                <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.5"/>
              </svg>
              <span>Settings</span>
            </button>
          </div>
        </div>
        ${this.styleSettingsOpen ? this.renderChatStylePanel() : ""}
        ${this.styleUpdateStatus
          ? html`<div style="margin-top:8px;font-size:12px;color:var(--muted);">${this.styleUpdateStatus}</div>`
          : ""}
      </div>
      ${this.renderClearChatDialog()}
    `;
  }

  private renderClearChatDialog() {
    if (!this.clearDialogOpen) return null;
    const sessionId = this.clearDialogSessionId;
    if (!sessionId) return null;
    const session = this.chatSessions.find((s) => s.id === sessionId) ?? null;
    if (!session) return null;
    const risky = this.sessionNeedsFundsConfirmation(session);
    return html`
      <div class="modal-backdrop" @click=${this.closeClearDialog}>
        <div class="modal-card" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-head">Delete this chat?</div>
          <div class="modal-body">
            ${risky
              ? html`<div>This chat includes live bet/fund-management context. Delete <strong>${session.name}</strong>?</div>`
              : html`<div>Delete <strong>${session.name}</strong>?</div>`}
          </div>
          <div class="modal-actions">
            <button class="plugin-secondary-btn" @click=${this.closeClearDialog}>Cancel</button>
            <button class="btn plugin-pill-btn" @click=${this.confirmClearDialog}>Delete Chat</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderChatStylePanel() {
    const styles = this.onboardingOptions?.styles ?? [];
    return html`
      <div class="chat-style-panel">
        <div class="chat-style-panel-title">Milaidy Response Mode</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
          Choose how Milaidy responds in this workspace.
        </div>
        ${styles.length === 0
          ? html`<div style="font-size:12px;color:var(--muted);">Loading style options...</div>`
          : html`
              <div class="onboarding-options" style="margin:0;">
                ${styles.map((style) => html`
                  <div
                    class="onboarding-option ${this.onboardingStyle === style.catchphrase ? "selected" : ""}"
                    @click=${() => { this.onboardingStyle = style.catchphrase; }}
                  >
                    <div class="label">${style.catchphrase}</div>
                    <div class="hint">${style.hint}</div>
                  </div>
                `)}
              </div>
              <div class="btn-row" style="justify-content:flex-end;margin-top:10px;">
                <button class="btn btn-outline" @click=${() => { this.styleSettingsOpen = false; this.styleUpdateStatus = null; }}>Cancel</button>
                <button class="btn" ?disabled=${this.styleUpdateBusy || !this.onboardingStyle} @click=${() => void this.applyStyleFromChatSettings()}>
                  ${this.styleUpdateBusy ? "Applying..." : "Apply"}
                </button>
              </div>
            `}
      </div>
    `;
  }

  private renderPlugins(viewMode: "accounts" | "ai") {
    const categories = viewMode === "accounts"
      ? (["all"] as const)
      : (["all", "ai-provider", "database"] as const);
    const activeFilter = categories.includes(this.pluginFilter as (typeof categories)[number])
      ? this.pluginFilter
      : "all";
    const categoryLabels: Record<string, string> = {
      "all": "All",
      "ai-provider": "Model",
      "database": "Memory",
      "feature": "Runtime",
      "connector": "Runtime",
    };

    const accountPlugins = this.plugins.filter((p) =>
      this.isAccountConnectionPlugin(p) && !this.isAppIntegrationPlugin(p),
    );
    const aiSetupPluginsAll = this.plugins.filter((p) =>
      !this.isHiddenSystemPlugin(p.id) &&
      (p.category === "ai-provider" || p.category === "database" || p.category === "connector" || p.category === "feature"),
    );
    const aiCorePlugins = aiSetupPluginsAll.filter((p) => p.category === "ai-provider" || p.category === "database");
    const availableConnections = viewMode === "accounts" ? accountPlugins : aiCorePlugins;
    const searchLower = this.pluginSearch.toLowerCase();
    const baseFiltered = availableConnections.filter((p) => {
      const matchesCategory = viewMode === "ai"
        ? (
          (activeFilter === "all" && (p.category === "ai-provider" || p.category === "database"))
          || p.category === activeFilter
        )
        : (activeFilter === "all" || p.category === activeFilter);
      const matchesSearch = !searchLower
        || p.name.toLowerCase().includes(searchLower)
        || (p.description ?? "").toLowerCase().includes(searchLower)
        || p.id.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });
    const focusedIds = new Set<string>([
      ...CURATED_APPS.map((a) => a.id),
      ...baseFiltered.filter((p) => p.category === "ai-provider" || p.id === "wallet").map((p) => p.id),
      ...baseFiltered.filter((p) => p.enabled || this.isPluginEffectivelyConfigured(p) || p.validationErrors.length > 0).map((p) => p.id),
    ]);
    const accountPrimaryIds = new Set<string>([
      ...CURATED_APPS.map((a) => a.id),
      "wallet",
      "polymarket",
      "telegram",
      "discord",
    ]);
    const focusedFiltered = baseFiltered.filter((p) =>
      viewMode === "accounts"
        ? accountPrimaryIds.has(p.id) || p.enabled || this.isPluginEffectivelyConfigured(p) || p.validationErrors.length > 0
        : focusedIds.has(p.id),
    );
    const baselineFocused = focusedFiltered.length > 0 ? focusedFiltered : baseFiltered.slice(0, viewMode === "accounts" ? 6 : 8);
    const advancedCount = Math.max(0, baseFiltered.length - baselineFocused.length);
    const filtered = viewMode === "accounts"
      ? (searchLower || this.accountsShowAll ? baseFiltered : baselineFocused)
      : baseFiltered;
    const runtimeModelHint = (this.agentStatus?.model ?? "").trim().toLowerCase();
    const selectedProviderHint = (this.onboardingProvider ?? "").trim().toLowerCase();
    const explicitSelectedAiProvider = viewMode === "ai"
      ? filtered.find((p) => {
        if (p.category !== "ai-provider") return false;
        if (!p.enabled) return false;
        const id = p.id.toLowerCase();
        const name = p.name.toLowerCase();
        const matchesRuntime =
          runtimeModelHint &&
          (runtimeModelHint.includes(id) || runtimeModelHint.includes(name));
        const matchesSelected = selectedProviderHint && selectedProviderHint === id;
        return Boolean(matchesRuntime || matchesSelected);
      }) ?? null
      : null;
    const activeAiProvider = viewMode === "ai"
      ? explicitSelectedAiProvider ?? filtered.find(
        (p) =>
          p.category === "ai-provider"
          && p.enabled
          && this.isPluginEffectivelyConfigured(p)
          && p.validationErrors.length === 0,
      ) ?? null
      : null;
    const orderedFiltered = (viewMode === "ai" || activeFilter === "all")
      ? [...filtered].sort((a, b) => {
          if (viewMode === "ai" && activeAiProvider) {
            if (a.id === activeAiProvider.id && b.id !== activeAiProvider.id) return -1;
            if (b.id === activeAiProvider.id && a.id !== activeAiProvider.id) return 1;
          }

          const aReady = a.enabled && this.isPluginEffectivelyConfigured(a) && a.validationErrors.length === 0;
          const bReady = b.enabled && this.isPluginEffectivelyConfigured(b) && b.validationErrors.length === 0;
          if (aReady !== bReady) return aReady ? -1 : 1;

          const aRequiresKeys = a.parameters.some((param) => param.required && !param.default);
          const bRequiresKeys = b.parameters.some((param) => param.required && !param.default);
          if (aRequiresKeys !== bRequiresKeys) return aRequiresKeys ? 1 : -1;

          const aNeeds = a.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(a);
          const bNeeds = b.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(b);
          if (aNeeds !== bNeeds) return aNeeds ? 1 : -1;

          if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
          if (viewMode === "ai") {
            const aName = a.name.toLowerCase();
            const bName = b.name.toLowerCase();
            const aIsVercel = aName.includes("vercel");
            const bIsVercel = bName.includes("vercel");
            const aIsOllama = aName.includes("ollama");
            const bIsOllama = bName.includes("ollama");
            if (aIsVercel && bIsOllama) return -1;
            if (aIsOllama && bIsVercel) return 1;
          }
          return a.name.localeCompare(b.name);
        })
      : filtered;
    const metricScope = viewMode === "ai" ? aiCorePlugins : availableConnections;
    const enabledCount = metricScope.filter((p) => p.enabled).length;
    const hasReadyAiProvider = viewMode === "ai" && metricScope.some(
      (p) => p.category === "ai-provider" && p.enabled && this.isPluginEffectivelyConfigured(p) && p.validationErrors.length === 0,
    );
    const configuredCount = metricScope.filter((p) => {
      if (viewMode === "ai" && hasReadyAiProvider && p.category === "ai-provider") return true;
      return this.isPluginEffectivelyConfigured(p);
    }).length;
    const needsSetupCount = metricScope.filter(
      (p) => {
        if (hasReadyAiProvider && p.category === "ai-provider") return false;
        return p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p);
      },
    ).length;
    const requiresSetup = metricScope.filter(
      (p) => p.enabled && (p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p)),
    );
    const nextSetupTarget =
      (viewMode === "accounts"
        ? metricScope.find((p) => p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p))
        : metricScope.find(
          (p) =>
            p.category === "ai-provider" &&
            p.enabled &&
            (p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p)),
        )) ??
      metricScope.find(
        (p) =>
          p.enabled &&
          (p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p)),
      ) ?? requiresSetup[0];

    const toggleSettings = (pluginId: string) => {
      const next = new Set(this.pluginSettingsOpen);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      this.pluginSettingsOpen = next;
    };
    const focusPlugin = (pluginId: string) => {
      if (!this.pluginSettingsOpen.has(pluginId)) {
        toggleSettings(pluginId);
      }
      requestAnimationFrame(() => {
        const el = this.shadowRoot?.querySelector(`[data-plugin-id="${pluginId}"]`);
        if (el instanceof HTMLElement) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      });
    };

    return html`
      <div class="plugins-surface ${viewMode === "ai" ? "ai-surface" : "accounts-surface"}">
      <h2>${viewMode === "accounts" ? "Account" : "AI Settings"}</h2>
      <p class="subtitle">
        ${viewMode === "accounts"
          ? "Manage account-level connections here. Market/social app connections live in Markets & Apps."
          : "Configure model, memory, and runtime modules for Milaidy."}
      </p>

      <div class="plugin-dashboard">
        <div class="plugin-hero">
          <div class="plugin-hero-top">
            <div>
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:var(--muted);">
                ${viewMode === "accounts" ? "Account" : "AI Configuration"}
              </div>
              <div style="font-size:18px;font-weight:700;color:var(--text-strong);">
                ${viewMode === "accounts"
                  ? "Manage account identity, wallet, and core user connection status"
                  : "Set up Milaidy’s model and memory stack"}
              </div>
            </div>
          </div>
          <div class="plugin-kpis">
            <div class="plugin-kpi">
              <div class="plugin-kpi-value">${enabledCount}</div>
              <div class="plugin-kpi-label">${viewMode === "ai" ? "Active" : "Enabled"}</div>
            </div>
            <div class="plugin-kpi">
              <div class="plugin-kpi-value">${configuredCount}</div>
              <div class="plugin-kpi-label">${viewMode === "ai" ? "Configured (all)" : "Configured"}</div>
            </div>
            <div class="plugin-kpi">
              <div class="plugin-kpi-value">${viewMode === "ai" ? needsSetupCount : requiresSetup.length}</div>
              <div class="plugin-kpi-label">Needs setup</div>
            </div>
          </div>

          ${nextSetupTarget
            ? html`
                <div class="plugin-next-step">
                  <div>
                    <div class="plugin-next-step-title">Recommended next step</div>
                    <div class="plugin-next-step-name">
                      Configure ${nextSetupTarget.name}
                    </div>
                  </div>
                  <div class="plugin-next-step-actions">
                    <button
                      class="btn plugin-pill-btn"
                      @click=${async () => {
                        if (!nextSetupTarget.enabled) {
                          await this.handlePluginToggle(nextSetupTarget.id, true);
                          await this.loadPlugins();
                        }
                        focusPlugin(nextSetupTarget.id);
                      }}
                    >Open settings</button>
                    ${viewMode === "ai"
                      ? html`<button class="plugin-secondary-btn" @click=${this.handleRestart}>Restart agent</button>`
                      : html`
                          ${advancedCount > 0
                            ? html`
                                <button class="plugin-secondary-btn" @click=${() => { this.accountsShowAll = !this.accountsShowAll; }}>
                                  ${this.accountsShowAll ? "Show fewer connections" : `Show all connections (+${advancedCount})`}
                                </button>
                              `
                            : ""}
                        `}
                  </div>
                </div>
              `
            : ""}
        </div>

        <div class="plugin-toolbar">
          <input
            class="plugin-search"
            type="text"
            placeholder=${viewMode === "accounts"
              ? "Search account connections..."
              : "Search model, memory, and runtime modules..."}
            .value=${this.pluginSearch}
            @input=${(e: Event) => { this.pluginSearch = (e.target as HTMLInputElement).value; }}
          />
          ${viewMode === "ai"
            ? html`
                <div class="plugin-filters">
                  ${categories.map(
                    (cat) => html`
                      <button
                        class="filter-btn ${activeFilter === cat ? "active" : ""}"
                        data-category=${cat}
                        @click=${() => { this.pluginFilter = cat; }}
                      >${cat === "all"
                        ? `All (${aiCorePlugins.length})`
                        : `${categoryLabels[cat]} (${availableConnections.filter((p) => p.category === cat).length})`}</button>
                    `,
                  )}
                </div>
              `
            : ""}
          ${!searchLower
            ? html`
                <div style="margin-top:8px;font-size:12px;color:var(--muted);">
                  ${viewMode === "accounts"
                      ? this.accountsShowAll
                        ? "Showing all available account connections."
                        : "Showing account-level connections."
                    : "Showing model and memory modules."}
                </div>
              `
            : ""}
        </div>
      </div>

      ${baseFiltered.length === 0
        ? html`
            <div class="empty-state">
              ${this.pluginSearch
                ? "No integrations match your search."
                : viewMode === "accounts"
                  ? "No account-level connections here right now. Use Markets & Apps for Discord, Telegram, and Polymarket."
                  : "No integrations in this category."}
            </div>
          `
        : html`
            <div class="plugin-list">
              ${orderedFiltered.map((p) => {
                const hasParams = p.parameters && p.parameters.length > 0;
                const allParamsSet = hasParams ? p.parameters.every((param) => param.isSet) : true;
                const settingsOpen = this.pluginSettingsOpen.has(p.id);
                const setCount = hasParams ? p.parameters.filter((param) => param.isSet).length : 0;
                const totalCount = hasParams ? p.parameters.length : 0;
                const setupComplete = p.enabled && this.isPluginEffectivelyConfigured(p) && p.validationErrors.length === 0;
                const needsAttention = p.validationErrors.length > 0 || !this.isPluginEffectivelyConfigured(p);
                const statusLabel = this.pluginStatusLabel(p);
                const risk = this.pluginRisk(p);
                const requiredKeys = p.parameters.filter((param) => param.required).map((param) => param.key);
                const hasManageSurface =
                  hasParams ||
                  risk === "CAN_SPEND" ||
                  (p.validationErrors?.length ?? 0) > 0 ||
                  (p.validationWarnings?.length ?? 0) > 0;
                const categoryLabel =
                  p.category === "ai-provider" ? "Model"
                    : p.category === "database" ? "Memory"
                      : "Runtime";

                return html`
                  <div class="plugin-item" data-plugin-id=${p.id} style="flex-direction:column;align-items:stretch;">
                    <div class="plugin-item-top">
                      <div style="flex:1;min-width:0;">
                        <div class="plugin-title-row">
                          <img
                            src=${this.appIconPath(p.id)}
                            alt=${`${p.name} icon`}
                            style="width:22px;height:22px;border-radius:6px;border:1px solid var(--border-soft);object-fit:cover;"
                            @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                          />
                          <div class="plugin-name">${p.name}</div>
                          ${viewMode === "ai" ? html`<span class="plugin-category-tag">${categoryLabel}</span>` : ""}
                          <span class="plugin-state-tag ${setupComplete ? "ok" : ""}">
                            ${setupComplete ? "Ready" : needsAttention ? "Needs Setup" : "Installed"}
                          </span>
                          ${viewMode === "ai"
                            ? html`
                                <span class="plugin-state-tag ${statusLabel === "Loaded" ? "ok" : statusLabel === "Missing keys" ? "warn" : ""}">
                                  ${statusLabel}
                                </span>
                              `
                            : ""}
                          <span class="plugin-state-tag ${risk === "CAN_SPEND" ? "risk" : risk === "CAN_EXECUTE" ? "warn" : ""}">
                            ${risk}
                          </span>
                        </div>
                        <div class="plugin-desc">${this.pluginDescription(p)}</div>
                        ${viewMode === "ai"
                          ? html`
                              <div class="plugin-required-keys">
                                <span>Required keys:</span>
                                ${requiredKeys.length > 0
                                  ? requiredKeys.map((k) => html`<code>${k}</code>`)
                                  : html`<span>none</span>`}
                              </div>
                            `
                          : ""}
                      </div>

                      <div class="plugin-inline-actions">
                        ${hasManageSurface
                          ? html`
                              <button
                                class="plugin-secondary-btn"
                                @click=${() => focusPlugin(p.id)}
                              >Manage</button>
                            `
                          : ""}
                        ${viewMode === "accounts"
                          ? html`
                              <button
                                class=${p.enabled ? "plugin-secondary-btn" : "btn plugin-pill-btn"}
                                @click=${() => this.handlePluginToggle(p.id, !p.enabled)}
                              >${p.enabled ? "Disconnect" : "Connect"}</button>
                            `
                          : html`
                              <label class="toggle-switch" style="position:relative;display:inline-block;width:40px;height:22px;">
                                <input
                                  type="checkbox"
                                  .checked=${p.enabled}
                                  data-plugin-toggle=${p.id}
                                  @change=${(e: Event) => this.handlePluginToggle(p.id, (e.target as HTMLInputElement).checked)}
                                  style="opacity:0;width:0;height:0;"
                                />
                                <span class="toggle-slider" style="
                                  position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;
                                  background:${p.enabled ? "var(--accent)" : "var(--muted)"};
                                  border-radius:22px;transition:0.2s;
                                ">
                                  <span style="
                                    position:absolute;content:'';height:16px;width:16px;left:${p.enabled ? "20px" : "3px"};
                                    bottom:3px;background:#fff;border-radius:50%;transition:0.2s;
                                  "></span>
                                </span>
                              </label>
                            `}
                      </div>
                    </div>

                    ${hasParams
                      ? html`
                          <div
                            class="plugin-settings-toggle ${settingsOpen ? "open" : ""}"
                            @click=${() => toggleSettings(p.id)}
                          >
                            <span class="settings-chevron ${settingsOpen ? "open" : ""}">&#9654;</span>
                            <span class="plugin-settings-dot ${allParamsSet ? "all-set" : "missing"}"></span>
                            <span>Settings</span>
                            <span style="color:var(--muted);font-weight:400;">(${setCount}/${totalCount} configured)</span>
                          </div>

                          ${settingsOpen
                            ? html`
                                <div class="plugin-settings-body">
                                  ${p.category === "ai-provider" || p.category === "database"
                                    ? html`
                                        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">
                                          Provider and memory changes may require a restart to take effect. Milaidy will restart automatically after saving or toggling.
                                        </div>
                                      `
                                    : ""}
                                  ${p.parameters.map(
                                    (param) => html`
                                      <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
                                        <div style="display:flex;align-items:center;gap:6px;">
                                          <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:${param.isSet ? "#2ecc71" : (param.required ? "#e74c3c" : "var(--muted)")};flex-shrink:0;"></span>
                                          <code style="font-size:11px;font-weight:600;color:var(--text-strong);">${param.key}</code>
                                          ${param.required ? html`<span style="font-size:10px;color:#e74c3c;">required</span>` : ""}
                                          ${param.isSet ? html`<span style="font-size:10px;color:#2ecc71;">set</span>` : ""}
                                        </div>
                                        <div style="color:var(--muted);font-size:11px;padding-left:12px;">${param.description}${param.default ? ` (default: ${param.default})` : ""}</div>
                                        <div class="secret-input-row">
                                          <input
                                            type="${param.sensitive
                                              ? (this.isSensitiveFieldVisible(p.id, param.key) ? "text" : "password")
                                              : "text"}"
                                            .value=${param.isSet && !param.sensitive ? (param.currentValue ?? "") : (param.isSet ? "" : (param.default ?? ""))}
                                            placeholder="${param.sensitive && param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}"
                                            data-plugin-param="${p.id}:${param.key}"
                                            data-plugin-dirty="0"
                                            @input=${(e: Event) => {
                                              (e.target as HTMLInputElement).setAttribute("data-plugin-dirty", "1");
                                            }}
                                          />
                                          ${param.sensitive
                                            ? html`
                                                <button
                                                  class="secret-toggle-btn"
                                                  type="button"
                                                  @click=${() => this.toggleSensitiveFieldVisibility(p.id, param.key)}
                                                  title=${this.isSensitiveFieldVisible(p.id, param.key) ? "Hide value" : "Show value"}
                                                  aria-label=${this.isSensitiveFieldVisible(p.id, param.key) ? "Hide value" : "Show value"}
                                                >${this.isSensitiveFieldVisible(p.id, param.key) ? "Hide" : "Show"}</button>
                                              `
                                            : ""}
                                        </div>
                                      </div>
                                    `,
                                  )}
                                  <button
                                    class="btn"
                                    style="align-self:flex-end;font-size:11px;padding:4px 14px;margin-top:4px;"
                                    @click=${() => this.handlePluginConfigSave(p.id)}
                                  >Save Settings</button>
                                </div>
                              `
                            : ""
                          }
                        `
                      : ""
                    }

                    ${risk === "CAN_SPEND"
                      ? html`
                          <div style="margin-top:8px;padding:8px 10px;border:1px dashed var(--border);border-radius:8px;background:rgba(140,47,33,0.04);">
                            <div style="font-size:12px;color:var(--muted);margin-bottom:6px;">High-risk action control</div>
                            <label style="display:flex;align-items:center;gap:8px;font-size:12px;">
                              <input
                                type="checkbox"
                                .checked=${this.pluginExecutionToggles[p.id] === true}
                                @change=${(e: Event) => this.setPluginExecution(p.id, (e.target as HTMLInputElement).checked)}
                              />
                              Enable execution (required before spend/bet actions)
                            </label>
                          </div>
                        `
                      : ""}

                    ${p.validationErrors && p.validationErrors.length > 0
                      ? html`
                          <div class="plugin-warn-box">
                            ${p.validationErrors.map(
                              (err) => html`<div>${err.field}: ${err.message}</div>`,
                            )}
                          </div>
                        `
                      : ""}
                    ${p.validationWarnings && p.validationWarnings.length > 0
                      ? html`
                          <div style="margin-top:4px;font-size:11px;">
                            ${p.validationWarnings.map(
                              (w) => html`<div style="color:var(--warn);">${w.message}</div>`,
                            )}
                          </div>
                        `
                      : ""
                    }
                  </div>
                `;
              })}
            </div>
          `}
      </div>
    `;
  }

  private isPluginEffectivelyConfigured(plugin: PluginInfo): boolean {
    if (plugin.configured) return true;
    if (plugin.validationErrors.length > 0) return false;
    const requiredParams = plugin.parameters.filter((param) => param.required);
    if (requiredParams.length === 0) return true;
    return requiredParams.every((param) => param.isSet || Boolean(param.default));
  }

  private isChatProviderReady(plugin: PluginInfo): boolean {
    if (plugin.category !== "ai-provider") return false;
    if (!plugin.enabled) return false;
    if (plugin.validationErrors.length > 0) return false;

    // For providers that require an API key, never trust `configured` alone.
    // Chat must stay locked until the provider key is actually present.
    const envKey = (plugin.envKey ?? "").trim();
    if (envKey && plugin.id !== "ollama") {
      const keyParam = plugin.parameters.find((p) => p.key === envKey) ?? null;
      return Boolean(keyParam?.isSet);
    }

    // Some provider manifests may omit `envKey` or mark params non-required.
    // Be strict: for any remote provider, require that an API key-like param
    // is actually set before unlocking chat.
    if (plugin.id !== "ollama") {
      const apiKeyParam =
        plugin.parameters.find((p) => /api[_-]?key/i.test(p.key) && p.sensitive) ??
        plugin.parameters.find((p) => /api[_-]?key/i.test(p.key)) ??
        null;
      if (apiKeyParam) return Boolean(apiKeyParam.isSet);
    }

    return this.isPluginEffectivelyConfigured(plugin);
  }

  private isHiddenSystemPlugin(id: string): boolean {
    const hidden = new Set([
      "sql",
      "local-embedding",
      "agent-skills",
      "agent-orchestrator",
      "directives",
      "commands",
      "shell",
      "personality",
      "experience",
      "plugin-manager",
      "cli",
      "code",
      "edge-tts",
      "knowledge",
      "mcp",
      "pdf",
      "scratchpad",
      "secrets-manager",
      "todo",
      "trust",
      "form",
      "goals",
      "scheduling",
    ]);
    return hidden.has(id);
  }

  private isAccountConnectionPlugin(plugin: PluginInfo): boolean {
    if (this.isHiddenSystemPlugin(plugin.id)) return false;
    if (CURATED_APP_ID_SET.has(plugin.id)) return true;
    return plugin.category === "connector" || plugin.category === "feature";
  }

  private isAppIntegrationPlugin(plugin: PluginInfo): boolean {
    if (CURATED_APP_ID_SET.has(plugin.id)) return true;
    const key = `${plugin.id} ${plugin.name}`.toLowerCase();
    return key.includes("telegram") || key.includes("discord") || key.includes("polymarket");
  }

  private isUserFacingConnection(plugin: PluginInfo): boolean {
    return this.isAccountConnectionPlugin(plugin);
  }

  private appPromptForPlugin(plugin: PluginInfo): string {
    if (plugin.id === "polymarket" && this.securitySpendGuardEnabled) {
      const market = this.polymarketMarket.trim();
      const outcome = this.polymarketOutcome.trim();
      const amount = this.polymarketAmount.trim();
      return `Use the Polymarket plugin to place a bet. Market: "${market}". Outcome: "${outcome}". Stake amount: "${amount}" USDC. If anything is missing, ask one concise clarification question before executing.`;
    }
    return `Use the ${plugin.name} plugin to help with the requested action. Ask one concise clarification question if required fields are missing, then proceed.`;
  }

  private getCuratedApps(): Array<{ app: AppEntry; plugin: PluginInfo | null }> {
    const cache = this.curatedAppsCache;
    if (cache.sourceRef === this.plugins) return cache.result;

    const byId = new Map<string, AppEntry>();
    for (const app of CURATED_APPS) byId.set(app.id, app);
    const pluginById = new Map(this.plugins.map((plugin) => [plugin.id, plugin] as const));

    // Auto-add enabled user-facing connections as assistant-driven apps.
    for (const plugin of this.plugins) {
      if (!plugin.enabled) continue;
      if (!this.isUserFacingConnection(plugin)) continue;
      if (byId.has(plugin.id)) continue;
      byId.set(plugin.id, {
        id: plugin.id,
        name: plugin.name,
        description: plugin.description || `Use ${plugin.name} through Chat.`,
        actionMode: "assistant",
      });
    }

    const ordered = [...byId.values()].sort((a, b) => {
      const ai = CURATED_APP_ORDER.get(a.id);
      const bi = CURATED_APP_ORDER.get(b.id);
      const aPinned = ai != null;
      const bPinned = bi != null;
      if (aPinned && bPinned) return (ai as number) - (bi as number);
      if (aPinned) return -1;
      if (bPinned) return 1;
      return a.name.localeCompare(b.name);
    });

    const result = ordered.map((app) => ({
      app,
      plugin: pluginById.get(app.id) ?? null,
    }));
    this.curatedAppsCache = { sourceRef: this.plugins, result };
    return result;
  }

  private async runAppAction(
    plugin: PluginInfo,
    opts?: { skipSpendConfirm?: boolean; skipExecuteConfirm?: boolean },
  ): Promise<void> {
    const risk = this.pluginRisk(plugin);
    const connectedWallet =
      this.walletConfig?.solanaConfiguredAddress
      ?? this.walletConfig?.evmConfiguredAddress
      ?? null;

    if (risk === "CAN_SPEND" && !connectedWallet) {
      this.appActionStatus = "Connect a wallet in Portfolio before running spend or bet actions.";
      this.addSecurityAudit(plugin, risk, "blocked", "Blocked: no connected wallet.");
      return;
    }

    if (plugin.id === "polymarket") {
      const amount = Number.parseFloat(this.polymarketAmount.trim());
      if (!Number.isFinite(amount) || amount <= 0) {
        this.appActionStatus = "Enter a valid USD amount before preparing a Polymarket action.";
        this.addSecurityAudit(plugin, risk, "blocked", "Blocked: invalid bet amount.");
        return;
      }
      if (amount > this.securityBetPerTradeLimitUsd) {
        this.appActionStatus = `Amount exceeds per-trade limit ($${this.securityBetPerTradeLimitUsd.toFixed(2)}).`;
        this.addSecurityAudit(plugin, risk, "blocked", `Blocked: trade limit exceeded ($${amount.toFixed(2)}).`);
        return;
      }
      const spentToday = this.getTodaySpendUsd();
      if (spentToday + amount > this.securityBetDailyLimitUsd) {
        this.appActionStatus = `Daily spend limit reached. Used ${this.formatUsd(spentToday)} of ${this.formatUsd(this.securityBetDailyLimitUsd)}.`;
        this.addSecurityAudit(
          plugin,
          risk,
          "blocked",
          `Blocked: daily limit exceeded ($${amount.toFixed(2)} attempted).`,
        );
        return;
      }
      const lastSpend = this.getLastSpendAtMs();
      if (lastSpend != null && this.securityBetCooldownSec > 0) {
        const elapsedSec = Math.floor((Date.now() - lastSpend) / 1000);
        if (elapsedSec < this.securityBetCooldownSec) {
          const wait = this.securityBetCooldownSec - elapsedSec;
          this.appActionStatus = `Cooldown active. Wait ${wait}s before another spend action.`;
          this.addSecurityAudit(plugin, risk, "blocked", `Blocked: cooldown active (${wait}s).`);
          return;
        }
      }
    }

    if (risk === "CAN_SPEND" && this.pluginExecutionToggles[plugin.id] !== true) {
      this.appActionStatus = "Execution is blocked for this spending module. Enable execution in Security first.";
      this.addSecurityAudit(plugin, risk, "blocked", "Execution blocked by policy toggle.");
      return;
    }
    if (
      risk === "CAN_SPEND"
      && this.securitySpendGuardEnabled
      && this.securityRequireSpendConfirm
      && !opts?.skipSpendConfirm
    ) {
      this.openActionConfirm({
        title: `Confirm ${plugin.name} spend action`,
        body: "This action can place a bet or spend funds. Review details before continuing.",
        confirmLabel: "Confirm action",
        danger: true,
        onCancel: () => {
          this.appActionStatus = "Action cancelled.";
          this.addSecurityAudit(plugin, risk, "blocked", "User declined spend confirmation.");
        },
        onConfirm: async () => {
          await this.runAppAction(plugin, { ...opts, skipSpendConfirm: true });
        },
      });
      return;
    }
    if (risk === "CAN_EXECUTE" && this.securityRequireExecuteConfirm && !opts?.skipExecuteConfirm) {
      this.openActionConfirm({
        title: `Confirm ${plugin.name} execution`,
        body: "This action can execute tool operations on your behalf.",
        confirmLabel: "Confirm action",
        danger: false,
        onCancel: () => {
          this.appActionStatus = "Action cancelled.";
          this.addSecurityAudit(plugin, risk, "blocked", "User declined execution confirmation.");
        },
        onConfirm: async () => {
          await this.runAppAction(plugin, { ...opts, skipExecuteConfirm: true });
        },
      });
      return;
    }

    this.appActionBusy = true;
    this.appActionStatus = null;
    try {
      const prompt = this.appPromptForPlugin(plugin);
      this.chatMessages = [
        ...this.chatMessages,
        { role: "user", text: prompt, timestamp: Date.now() },
      ];
      const data = await client.sendChatRest(
        prompt,
        this.buildChatSecurityContext(),
      );
      this.chatMessages = [
        ...this.chatMessages,
        { role: "assistant", text: data.text, timestamp: Date.now() },
      ];
      this.saveChatMessages();
      this.appActionStatus = `${plugin.name} action prepared. Review the response below or in Chat.`;
      if (plugin.id === "polymarket") {
        const amount = Number.parseFloat(this.polymarketAmount.trim());
        const amountText = Number.isFinite(amount) ? `$${amount.toFixed(2)}` : "unknown amount";
        const market = this.polymarketMarket.trim() || "Unknown market";
        const outcome = this.polymarketOutcome.trim() || "Unknown outcome";
        this.addSecurityAudit(
          plugin,
          risk,
          "prepared",
          `Prepared bet. Market: "${market}". Outcome: "${outcome}". Amount: ${amountText}.`,
        );
      } else {
        this.addSecurityAudit(plugin, risk, "prepared", "Action prepared through Chat.");
      }
    } catch (err) {
      this.appActionStatus = `Action failed: ${err instanceof Error ? err.message : "network error"}`;
      this.addSecurityAudit(plugin, risk, "failed", this.appActionStatus);
    } finally {
      this.appActionBusy = false;
    }
  }

  private async connectAppFromApps(plugin: PluginInfo): Promise<void> {
    this.appActionBusy = true;
    this.appActionStatus = null;
    try {
      await this.handlePluginConfigSave(plugin.id);
      await this.loadPlugins();
      const latest = this.plugins.find((p) => p.id === plugin.id);
      if (!latest) {
        this.appActionStatus = `${plugin.name} is not installed yet.`;
        return;
      }

      if (latest.validationErrors.length > 0) {
        const missing = latest.validationErrors.map((e) => e.field).join(", ");
        this.appActionStatus = `Missing required settings: ${missing}`;
        return;
      }

      await this.handlePluginToggle(plugin.id, true);
      await this.loadPlugins();
      const enabledNow = this.plugins.find((p) => p.id === plugin.id)?.enabled === true;
      this.appActionStatus = enabledNow
        ? `${plugin.name} connected.`
        : `${plugin.name} could not be enabled yet.`;
    } catch (err) {
      this.appActionStatus = `Connect failed: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.appActionBusy = false;
    }
  }

  private renderApps() {
    const curatedApps = this.getCuratedApps();
    const coreAppIds = new Set(["polymarket", "telegram", "discord", "slack"]);
    const activeEntry =
      curatedApps.find((x) => x.app.id === this.activeAppPluginId) ??
      curatedApps[0] ??
      null;
    const coreVisible = curatedApps.filter(({ app }) => coreAppIds.has(app.id));
    const extraEnabled = curatedApps
      .filter(({ app, plugin }) => !coreAppIds.has(app.id) && Boolean(plugin?.enabled))
      .slice(0, 6);
    const dedup = new Map<string, { app: AppEntry; plugin: PluginInfo | null }>();
    for (const row of [...coreVisible, ...extraEnabled]) dedup.set(row.app.id, row);
    const defaultVisible = [...dedup.values()];
    const collapsedVisible = defaultVisible.length > 0 ? defaultVisible : curatedApps.slice(0, 4);
    const isActiveHidden = activeEntry ? !collapsedVisible.some((x) => x.app.id === activeEntry.app.id) : false;
    const visibleCollapsed = isActiveHidden && activeEntry
      ? [...collapsedVisible, activeEntry]
      : collapsedVisible;
    const dedupVisible = new Map<string, { app: AppEntry; plugin: PluginInfo | null }>();
    for (const row of visibleCollapsed) dedupVisible.set(row.app.id, row);
    const visibleApps = this.appTabsExpanded
      ? curatedApps
      : [...dedupVisible.values()];
    const hiddenCount = Math.max(0, curatedApps.length - collapsedVisible.length);
    const active = activeEntry?.plugin ?? null;
    const activeApp = activeEntry?.app ?? null;

    return html`
      <div class="apps-surface">
      <h2>Markets & Apps</h2>
      <p class="subtitle">User-facing actions powered by your connected apps.</p>

      ${curatedApps.length === 0
        ? html`
            <div class="empty-state">
              No apps available yet.
            </div>
          `
        : html`
            <div class="plugin-dashboard" style="margin-bottom:10px;">
              <div class="plugin-toolbar">
                <div class="plugin-filters">
                  ${repeat(
                    visibleApps,
                    ({ app }) => app.id,
                    ({ app, plugin }) => html`
                      <button
                        class="filter-btn ${activeApp?.id === app.id ? "active" : ""}"
                        @click=${() => { this.activeAppPluginId = app.id; this.appActionStatus = null; }}
                      >${app.name}${plugin?.enabled ? "" : " (needs setup)"}</button>
                    `,
                  )}
                  ${hiddenCount > 0
                    ? html`
                        <button
                          class="filter-btn apps-toggle-btn ${this.appTabsExpanded ? "active" : ""}"
                          @click=${() => { this.appTabsExpanded = !this.appTabsExpanded; }}
                        >${this.appTabsExpanded ? "Show fewer apps" : `More apps (+${hiddenCount})`}</button>
                      `
                    : ""}
                </div>
              </div>
            </div>

            ${activeApp && this.appsDetailReady
              ? html`
                  <div class="plugin-item apps-detail-card" style="flex-direction:column;align-items:stretch;">
                    <div class="plugin-item-top">
                      <div>
                        <div class="plugin-title-row">
                          <img
                            src=${this.appIconPath(activeApp.id)}
                            alt=${`${activeApp.name} icon`}
                            style="width:24px;height:24px;border-radius:7px;border:1px solid var(--border-soft);object-fit:cover;"
                            @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                          />
                          <div class="plugin-name">${activeApp.name}</div>
                          <span class="plugin-state-tag ${active?.enabled ? "ok" : ""}">
                            ${active?.enabled ? "Ready" : "Pending Setup"}
                          </span>
                        </div>
                        <div class="plugin-desc">${activeApp.description}</div>
                      </div>
                    </div>

                    ${!active
                      ? html`
                          <div class="plugin-settings-body">
                            <div style="font-size:12px;color:var(--muted);">
                              This app is not enabled in this build yet.
                            </div>
                            <div style="display:flex;justify-content:flex-end;">
                              <button class="plugin-secondary-btn" @click=${() => this.setTab("ai-setup")}>Open AI Settings</button>
                            </div>
                          </div>
                        `
                      : !active.enabled
                      ? html`
                          <div class="plugin-settings-body">
                            <div style="font-size:12px;color:var(--muted);">
                              Connect ${active.name} here to use it in Markets & Apps.
                            </div>
                            ${active.parameters.length > 0
                              ? html`
                                  ${active.parameters.map(
                                    (param) => html`
                                      <div style="display:flex;flex-direction:column;gap:3px;font-size:12px;">
                                        <div style="display:flex;align-items:center;gap:6px;">
                                          <code style="font-size:11px;font-weight:600;color:var(--text-strong);">${param.key}</code>
                                          ${param.required ? html`<span style="font-size:10px;color:#e74c3c;">required</span>` : ""}
                                          ${param.isSet ? html`<span style="font-size:10px;color:#2ecc71;">set</span>` : ""}
                                        </div>
                                        <div style="color:var(--muted);font-size:11px;">
                                          ${param.description}${param.default ? ` (default: ${param.default})` : ""}
                                        </div>
                                        <div class="secret-input-row">
                                          <input
                                            type="${param.sensitive
                                              ? (this.isSensitiveFieldVisible(active.id, param.key) ? "text" : "password")
                                              : "text"}"
                                            .value=${param.isSet && !param.sensitive ? (param.currentValue ?? "") : (param.isSet ? "" : (param.default ?? ""))}
                                            placeholder="${param.sensitive && param.isSet ? "******** (already set, leave blank to keep)" : "Enter value..."}"
                                            data-plugin-param="${active.id}:${param.key}"
                                            data-plugin-dirty="0"
                                            @input=${(e: Event) => {
                                              (e.target as HTMLInputElement).setAttribute("data-plugin-dirty", "1");
                                            }}
                                          />
                                          ${param.sensitive
                                            ? html`
                                                <button
                                                  class="secret-toggle-btn"
                                                  type="button"
                                                  @click=${() => this.toggleSensitiveFieldVisibility(active.id, param.key)}
                                                  title=${this.isSensitiveFieldVisible(active.id, param.key) ? "Hide value" : "Show value"}
                                                  aria-label=${this.isSensitiveFieldVisible(active.id, param.key) ? "Hide value" : "Show value"}
                                                >${this.isSensitiveFieldVisible(active.id, param.key) ? "Hide" : "Show"}</button>
                                              `
                                            : ""}
                                        </div>
                                      </div>
                                    `,
                                  )}
                                `
                              : ""}
                            ${active.validationErrors.length > 0
                              ? html`
                                  <div class="plugin-warn-box">
                                    ${active.validationErrors.map((err) => html`<div>${err.field}: ${err.message}</div>`)}
                                  </div>
                                `
                              : ""}
                            <div style="display:flex;gap:8px;justify-content:flex-end;">
                              <button class="plugin-secondary-btn" @click=${() => this.setTab("ai-setup")}>AI Settings</button>
                              <button
                                class="btn plugin-pill-btn"
                                ?disabled=${this.appActionBusy}
                                @click=${() => this.connectAppFromApps(active)}
                              >${this.appActionBusy ? "Connecting..." : "Connect"}</button>
                            </div>
                          </div>
                        `
                      : activeApp.actionMode === "polymarket-bet"
                      ? html`
                          <div class="plugin-settings-body">
                            <div style="font-size:12px;color:var(--muted);">Bet Slip</div>
                            <input
                              type="text"
                              placeholder="Market (e.g. Will BTC close above 100k this month?)"
                              .value=${this.polymarketMarket}
                              @input=${(e: Event) => { this.polymarketMarket = (e.target as HTMLInputElement).value; }}
                            />
                            <input
                              type="text"
                              placeholder="Outcome (e.g. Yes)"
                              .value=${this.polymarketOutcome}
                              @input=${(e: Event) => { this.polymarketOutcome = (e.target as HTMLInputElement).value; }}
                            />
                            <input
                              type="text"
                              placeholder="Amount in USDC (e.g. 25)"
                              .value=${this.polymarketAmount}
                              @input=${(e: Event) => { this.polymarketAmount = (e.target as HTMLInputElement).value; }}
                            />
                            <div style="display:flex;gap:8px;justify-content:flex-end;">
                              <button
                                class="plugin-secondary-btn"
                                @click=${() => { this.setTab("config"); }}
                              >Security</button>
                              <button
                                class="plugin-secondary-btn"
                                @click=${() => { this.setTab("chat"); }}
                              >Open Chat</button>
                              <button
                                class="btn plugin-pill-btn"
                                ?disabled=${this.appActionBusy || !this.polymarketMarket.trim() || !this.polymarketOutcome.trim() || !this.polymarketAmount.trim()}
                                @click=${() => this.runAppAction(active)}
                              >${this.appActionBusy ? "Submitting..." : "Prepare Bet"}</button>
                            </div>
                          </div>
                        `
                      : html`
                          <div class="plugin-settings-body">
                            <div style="font-size:12px;color:var(--muted);">
                              This app is connected. Use Chat to run actions with ${active.name}.
                            </div>
                            <div style="display:flex;gap:8px;justify-content:flex-end;">
                              <button class="btn plugin-pill-btn" @click=${() => this.runAppAction(active)} ?disabled=${this.appActionBusy}>
                                ${this.appActionBusy ? "Running..." : "Run in Chat"}
                              </button>
                            </div>
                          </div>
                        `}

                    ${this.appActionStatus
                      ? html`<div style="margin-top:8px;color:var(--muted);font-size:12px;">${this.appActionStatus}</div>`
                      : ""}
                  </div>
                `
              : activeApp
                ? html`
                    <div class="plugin-item apps-detail-card" style="flex-direction:column;align-items:stretch;min-height:120px;justify-content:center;">
                      <div style="font-size:12px;color:var(--muted);">Loading app details...</div>
                    </div>
                  `
                : ""}
          `}
      </div>
    `;
  }

  private async handlePluginConfigSave(pluginId: string): Promise<void> {
    // Collect all input values for this plugin from the DOM
    const inputs = this.shadowRoot?.querySelectorAll(`input[data-plugin-param^="${pluginId}:"]`);
    if (!inputs) return;

    const config: Record<string, string> = {};
    let changedCount = 0;
    const explicitlyProvided = new Set<string>();
    const plugin = this.plugins.find((p) => p.id === pluginId) ?? null;
    const paramByKey = new Map((plugin?.parameters ?? []).map((p) => [p.key, p]));
    for (const input of inputs) {
      const attr = input.getAttribute("data-plugin-param") ?? "";
      const key = attr.split(":").slice(1).join(":");
      if (!key) continue;
      const element = input as HTMLInputElement;
      const value = element.value.trim();
      const isDirty = element.getAttribute("data-plugin-dirty") === "1";
      const prev = paramByKey.get(key);
      const isSensitive = Boolean(prev?.sensitive);
      // Only persist fields the user actually edited in this session.
      // For sensitive fields (API keys), a non-empty value should always be
      // treated as an explicit update even if the row rerendered and lost the
      // transient dirty marker.
      if (!isDirty && !isSensitive) continue;
      if (!value) continue;
      explicitlyProvided.add(key);

      // For non-sensitive fields, avoid no-op writes when value is unchanged.
      if (prev && !isSensitive && (prev.currentValue ?? "").trim() === value) continue;

      config[key] = value;
      changedCount += 1;
    }

    // Some providers expose two fields for the same credential. If the user
    // edits one side, mirror it to the paired key unless they explicitly
    // provided both values.
    const sharedCredentialPairsByPlugin: Record<string, Array<[string, string]>> = {
      openai: [["OPENAI_API_KEY", "OPENAI_EMBEDDING_API_KEY"]],
      "vercel-ai-gateway": [["AI_GATEWAY_API_KEY", "AIGATEWAY_API_KEY"]],
    };
    const sharedPairs = sharedCredentialPairsByPlugin[pluginId] ?? [];
    for (const [primaryKey, mirrorKey] of sharedPairs) {
      const primaryEdited = explicitlyProvided.has(primaryKey);
      const mirrorEdited = explicitlyProvided.has(mirrorKey);
      if (primaryEdited && !mirrorEdited) {
        const primaryValue = (config[primaryKey] ?? "").trim();
        if (primaryValue && config[mirrorKey] !== primaryValue) {
          config[mirrorKey] = primaryValue;
          changedCount += 1;
        }
      } else if (mirrorEdited && !primaryEdited) {
        const mirrorValue = (config[mirrorKey] ?? "").trim();
        if (mirrorValue && config[primaryKey] !== mirrorValue) {
          config[primaryKey] = mirrorValue;
          changedCount += 1;
        }
      }
    }

    if (changedCount === 0) {
      // No effective value changes.
      this.closePluginSettings(pluginId);
      this.showUiNotice("Settings saved.");
      return;
    }

    try {
      await client.updatePlugin(pluginId, { config });
      // Reload plugins to get updated validation and current values
      await this.loadPlugins();

      const pluginAfterSave = this.plugins.find((p) => p.id === pluginId);
      const requiresRuntimeRestart =
        pluginAfterSave?.category === "ai-provider" || pluginAfterSave?.category === "database";
      this.closePluginSettings(pluginId);
      this.showUiNotice("Settings saved.");
      if (requiresRuntimeRestart) {
        const restartBefore = Number(this.agentStatus?.startedAt ?? 0);
        this.showUiNotice("Applying provider settings. Restarting Milaidy...");
        await this.handleRestart();
        // Keep restart feedback visible and only mark loaded once restart settles.
        await this.waitForAgentAfterRestart();
        let restartAfter = restartBefore;
        try {
          const status = await client.getStatus();
          this.setAgentStatus(status);
          restartAfter = Number(status.startedAt ?? 0);
        } catch {
          // ignore
        }
        // Refresh plugin state after restart so UI reflects loaded keys/models.
        await this.loadPlugins();
        if (restartAfter > 0 && restartBefore > 0 && restartAfter === restartBefore) {
          this.showUiNotice("Provider settings saved. Restart still pending; press Restart once.");
        } else {
          this.showUiNotice("Provider settings loaded.");
        }
      }
    } catch (err) {
      console.error("Failed to save plugin config:", err);
      this.showUiNotice("Could not apply provider changes. Check settings and retry.");
    }
  }

  private closePluginSettings(pluginId: string): void {
    if (!this.pluginSettingsOpen.has(pluginId)) return;
    const next = new Set(this.pluginSettingsOpen);
    next.delete(pluginId);
    this.pluginSettingsOpen = next;
  }

  private async openAiProviderSettingsFromChat(): Promise<void> {
    this.setTab("ai-setup");
    this.pluginFilter = "ai-provider";
    this.pluginSearch = "";

    if (this.plugins.length === 0) {
      await this.loadPlugins();
    }

    const chosenProviderId = (this.onboardingProvider ?? "").trim();
    const targetId =
      chosenProviderId && this.plugins.some((p) => p.id === chosenProviderId)
        ? chosenProviderId
        : (this.plugins.find((p) => p.category === "ai-provider")?.id ?? "");

    if (!targetId) return;
    const next = new Set(this.pluginSettingsOpen);
    next.add(targetId);
    this.pluginSettingsOpen = next;

    await this.updateComplete;
    requestAnimationFrame(() => {
      const el = this.shadowRoot?.querySelector(`[data-plugin-id="${targetId}"]`);
      if (el instanceof HTMLElement) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  private async handlePluginToggle(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);
    const requiresRuntimeRestart = plugin?.category === "ai-provider" || plugin?.category === "database";

    // Keep model providers strict, but let memory modules be user-clickable
    // even when optional config is incomplete.
    if (
      enabled &&
      plugin?.category === "ai-provider" &&
      plugin.validationErrors &&
      plugin.validationErrors.length > 0
    ) {
      // Revert the checkbox
      this.requestUpdate();
      return;
    }

    try {
      if (enabled && plugin && (plugin.category === "ai-provider" || plugin.category === "database")) {
        const singleChoiceCategory = plugin.category;
        const otherEnabledInCategory = this.plugins.filter(
          (p) => p.category === singleChoiceCategory && p.enabled && p.id !== pluginId,
        );
        for (const other of otherEnabledInCategory) {
          await client.updatePlugin(other.id, { enabled: false });
          other.enabled = false;
        }
      }

      await client.updatePlugin(pluginId, { enabled });
      if (plugin) {
        plugin.enabled = enabled;
        this.curatedAppsCache.sourceRef = null;
        this.requestUpdate();
      }

      if (requiresRuntimeRestart) {
        // Apply the toggle immediately in UI, then restart in background so
        // runtime-loaded plugin snapshots don't appear to "undo" the click.
        this.showUiNotice("Applying model/memory change. Milaidy may need a restart to load it (restarting now).");
        void this.handleRestart();
        setTimeout(() => {
          void this.loadPlugins();
        }, 1500);
      }
    } catch (err) {
      console.error("Failed to toggle plugin:", err);
    }
  }

  private renderSkills() {
    return html`
      <h2>Skills</h2>
      <p class="subtitle">View available agent skills. ${this.skills.length > 0 ? `${this.skills.length} skills loaded.` : ""}</p>
      <div style="margin-bottom:8px;">
        <button class="btn" data-action="refresh-skills" @click=${this.refreshSkills} style="font-size:12px;padding:4px 12px;">Refresh</button>
      </div>
      ${this.skills.length === 0
        ? html`<div class="empty-state">No skills loaded yet. Click Refresh to re-scan.</div>`
        : html`
            <div class="plugin-list">
              ${this.skills.map(
                (s) => html`
                  <div class="plugin-item" data-skill-id=${s.id}>
                    <div style="flex:1;min-width:0;">
                      <div class="plugin-name">${s.name}</div>
                      <div class="plugin-desc">${s.description || "No description"}</div>
                    </div>
                    <span class="plugin-status ${s.enabled ? "enabled" : ""}">${s.enabled ? "active" : "inactive"}</span>
                  </div>
                `,
              )}
            </div>
          `}
    `;
  }

  private async checkExtensionStatus(): Promise<void> {
    this.extensionChecking = true;
    try {
      this.extensionStatus = await client.getExtensionStatus();
      this.extensionCheckedAt = Date.now();
    } catch {
      this.extensionStatus = { relayReachable: false, relayPort: 18792, extensionPath: null };
    }
    this.extensionChecking = false;
  }

  private handleOpenExtensionsPage(): void {
    window.open("chrome://extensions", "_blank");
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Inventory
  // ═══════════════════════════════════════════════════════════════════════

  private async loadInventory(): Promise<void> {
    // Load config/status first, then fetch live balances if at least one wallet exists.
    await this.loadWalletConfig();
    const hasWallet =
      Boolean(this.walletConfig?.evmAddress) || Boolean(this.walletConfig?.solanaAddress);
    if (hasWallet) {
      this.walletLoading = true;
      this.walletError = null;
      try {
        const snapshot = await client.getWalletConnectedData();
        this.walletBalances = snapshot.balances;
        this.walletNfts = snapshot.nfts;
        this.polymarketPortfolio = snapshot.polymarket;
        this.walletAccountUsername = snapshot.account.username
          ? (snapshot.account.username.startsWith("@")
            ? snapshot.account.username
            : `@${snapshot.account.username}`)
          : null;
      } catch (err) {
        this.walletError = `Failed to fetch wallet data: ${err instanceof Error ? err.message : "network error"}`;
      }
      this.walletLoading = false;
    } else {
      this.walletBalances = null;
      this.walletNfts = null;
      this.polymarketPortfolio = null;
    }
    this.inventoryLoadedAt = Date.now();
  }

  private async loadWalletConfig(): Promise<void> {
    try {
      this.walletConfig = await client.getWalletConfig();
      this.walletError = null;
      this.walletConfigLoadedAt = Date.now();
    } catch (err) {
      this.walletError = `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`;
    }
  }

  private async loadBalances(): Promise<void> {
    this.walletLoading = true;
    this.walletError = null;
    try {
      const snapshot = await client.getWalletConnectedData();
      this.walletBalances = snapshot.balances;
      this.polymarketPortfolio = snapshot.polymarket;
      this.walletAccountUsername = snapshot.account.username
        ? (snapshot.account.username.startsWith("@")
          ? snapshot.account.username
          : `@${snapshot.account.username}`)
        : null;
    } catch (err) {
      this.walletError = `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletLoading = false;
  }

  private async loadNfts(): Promise<void> {
    this.walletNftsLoading = true;
    this.walletError = null;
    try {
      const snapshot = await client.getWalletConnectedData();
      this.walletNfts = snapshot.nfts;
      this.walletAccountUsername = snapshot.account.username
        ? (snapshot.account.username.startsWith("@")
          ? snapshot.account.username
          : `@${snapshot.account.username}`)
        : null;
    } catch (err) {
      this.walletError = `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletNftsLoading = false;
  }

  private async loadPolymarketPortfolio(): Promise<void> {
    try {
      this.polymarketPortfolio = await client.getPolymarketPortfolio();
    } catch (err) {
      console.error("Failed to fetch Polymarket portfolio:", err);
      this.polymarketPortfolio = null;
    }
  }

  private renderInventory() {
    const hasWallet =
      Boolean(this.walletConfig?.evmAddress) || Boolean(this.walletConfig?.solanaAddress);
    // Do not auto-prompt profile/avatar customization from Portfolio.
    // Users already set their profile during onboarding; further edits live in Account.
    const shouldPromptAvatar = false;

    return html`
      <h2>Portfolio</h2>
      <p class="subtitle" style="margin-bottom:10px;">Track your wallet balances and NFTs.</p>
      ${this.walletAccountUsername
        ? html`<div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Connected as <b>${this.walletAccountUsername}</b></div>`
        : ""}

      ${hasWallet
        ? html`
            <div style="display:flex;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
              <button
                class="plugin-secondary-btn"
                ?disabled=${this.walletConnectBusy}
                @click=${() => this.handleWalletDisconnect()}
              >${this.walletConnectBusy ? "Disconnecting..." : "Disconnect wallet"}</button>
              <button
                class="plugin-secondary-btn"
                @click=${() => {
                  this.walletConnectOpen = !this.walletConnectOpen;
                  if (this.walletConnectOpen) this.walletConnectMode = "connect";
                  if (!this.walletConnectOpen) this.selectedWalletLauncher = null;
                  this.walletConnectStatus = null;
                  this.walletError = null;
                }}
              >${this.walletConnectOpen ? "Close wallet setup" : "Manage wallet"}</button>
            </div>
          `
        : ""}

      ${this.walletError ? html`
        <div style="margin-top:12px;padding:10px 14px;border:1px solid var(--danger, #e74c3c);background:rgba(231,76,60,0.06);font-size:12px;color:var(--danger, #e74c3c);">
          ${this.walletError}
        </div>
      ` : ""}

      ${(!hasWallet || this.walletConnectOpen) ? this.renderWalletConnectPrompt() : ""}
      ${shouldPromptAvatar ? this.renderAvatarCustomizationPrompt() : ""}
      ${hasWallet ? this.renderInventoryContent() : ""}
    `;
  }

  private renderWalletConnectModal() {
    return html`
      <div class="modal-backdrop mobile-wallet-modal" @click=${() => {
        this.walletConnectOpen = false;
        this.selectedWalletLauncher = null;
      }}>
        <div class="modal-card wallet-connect-sheet" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-head" style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
            <span>Connect Wallet</span>
            <button
              class="mobile-wallet-close"
              aria-label="Close wallet connect"
              title="Close"
              @click=${() => {
                this.walletConnectOpen = false;
                this.selectedWalletLauncher = null;
              }}
            >&times;</button>
          </div>
          <div class="modal-body">
            ${this.renderWalletConnectPrompt()}
          </div>
        </div>
      </div>
    `;
  }

  private renderAvatarCustomizationPrompt() {
    const choices = this.onboardingOptions?.names?.slice(0, 8) ?? [
      "Reimu",
      "Marisa",
      "Sakuya",
      "Remilia",
      "Koishi",
      "Aya",
      "Nitori",
      "Sanae",
    ];

    return html`
      <div class="setup-card" style="margin-top:12px;">
        <h3 style="margin-bottom:4px;">Customize your Milaidy experience</h3>
        <p style="margin-bottom:10px;">
          Wallet connected. Choose your avatar to personalize your profile and color theme.
        </p>
        <div class="onboarding-character-grid">
          ${choices.map((name) => {
            const theme = this.characterTheme(name);
            const selected = this.userDisplayName === name;
            return html`
              <div
                class="onboarding-character-card ${selected ? "selected" : ""}"
                style="border-color:${selected ? theme.accent : "var(--border)"};background:${selected ? theme.surface : "var(--card)"};"
                @click=${async () => {
                  const ok = await this.saveUserDisplayName(name);
                  if (!ok) return;
                  this.saveProfileAppearance(this.characterImage(name), theme.accent);
                  this.avatarCustomizeOpen = false;
                }}
              >
                <img
                  class="onboarding-character-avatar"
                  src=${this.characterImage(name)}
                  alt=${`${name} avatar`}
                  @error=${(e: Event) => {
                    const img = e.currentTarget as HTMLImageElement;
                    img.src = this.fallbackCharacterImage(name);
                  }}
                />
                <div>
                  <div class="label">${name}</div>
                  <div class="hint" style="color:${theme.accent};">Apply avatar + theme</div>
                </div>
              </div>
            `;
          })}
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:8px;">
          <button class="plugin-secondary-btn" @click=${() => { this.avatarCustomizeOpen = false; }}>Skip for now</button>
        </div>
      </div>
    `;
  }

  private async handleWalletGenerate(): Promise<void> {
    if (this.hasConnectedWallet()) {
      this.walletError = "Disconnect current wallet before creating another.";
      return;
    }
    this.walletConnectBusy = true;
    this.walletConnectStatus = null;
    this.walletError = null;
    try {
      const res = await client.generateWallet(this.walletConnectChain);
      const created = res.wallets.map((w) => `${w.chain.toUpperCase()} ${w.address}`).join(" • ");
      this.walletConnectStatus = created ? `Connected: ${created}` : "Wallet generated.";
      this.walletConnectMode = "choose";
      this.walletConnectOpen = false;
      await this.loadWalletConfig();
      this.walletAddresses = await client.getWalletAddresses();
      await this.loadBalances();
    } catch (err) {
      this.walletError = `Failed to create wallet: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.walletConnectBusy = false;
    }
  }

  private async handleWalletImport(): Promise<void> {
    const key = this.walletImportKey.trim();
    if (!key) return;
    if (this.hasConnectedWallet()) {
      this.walletError = "Disconnect current wallet before importing another.";
      return;
    }
    this.walletConnectBusy = true;
    this.walletConnectStatus = null;
    this.walletError = null;
    try {
      const res = await client.importWallet(this.walletImportChain, key);
      this.walletConnectStatus = `Connected ${res.chain.toUpperCase()} wallet${res.address ? `: ${res.address}` : ""}`;
      this.walletImportKey = "";
      this.walletConnectMode = "choose";
      this.walletConnectOpen = false;
      await this.loadWalletConfig();
      this.walletAddresses = await client.getWalletAddresses();
      await this.loadBalances();
    } catch (err) {
      this.walletError = `Failed to import wallet: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.walletConnectBusy = false;
    }
  }

  private resolveInjectedSolanaProvider(preferredWallet: string): unknown {
    const w = window as unknown as Record<string, unknown>;
    const solana = w.solana as Record<string, unknown> | undefined;
    const solanaMobileWalletAdapter = w.solanaMobileWalletAdapter as Record<string, unknown> | undefined;
    const solanaMobile = w.solanaMobile as Record<string, unknown> | undefined;
    const phantom = (w.phantom as Record<string, unknown> | undefined)?.solana ?? w.phantom;
    const solflare = (w.solflare as Record<string, unknown> | undefined) ?? null;
    const backpack = (w.backpack as Record<string, unknown> | undefined)?.solana ?? w.backpack;
    const nightly = (w.nightly as Record<string, unknown> | undefined)?.solana ?? w.nightly;
    const glow =
      (w.glow as Record<string, unknown> | undefined)?.solana ??
      (w.glowSolana as Record<string, unknown> | undefined) ??
      null;

    const hasFlag = (provider: unknown, flag: string): boolean =>
      Boolean(provider && typeof provider === "object" && (provider as Record<string, unknown>)[flag] === true);
    const canConnect = (provider: unknown): boolean =>
      Boolean(provider && typeof provider === "object" && typeof (provider as { connect?: unknown }).connect === "function");

    switch (preferredWallet) {
      case "Phantom":
        if (phantom && hasFlag(phantom, "isPhantom")) return phantom;
        if (solana && hasFlag(solana, "isPhantom")) return solana;
        return null;
      case "Solflare":
        if (solflare && hasFlag(solflare, "isSolflare")) return solflare;
        if (solana && hasFlag(solana, "isSolflare")) return solana;
        return null;
      case "Backpack":
        if (backpack && hasFlag(backpack, "isBackpack")) return backpack;
        if (solana && hasFlag(solana, "isBackpack")) return solana;
        return null;
      case "Nightly":
        if (nightly && hasFlag(nightly, "isNightly")) return nightly;
        if (solana && hasFlag(solana, "isNightly")) return solana;
        return null;
      case "Glow":
        if (glow && hasFlag(glow, "isGlow")) return glow;
        if (solana && hasFlag(solana, "isGlow")) return solana;
        return null;
      case "Seeker":
        if (canConnect(solana) && (
          hasFlag(solana, "isSeeker")
          || hasFlag(solana, "isSolanaMobile")
          || hasFlag(solana, "isMobileWalletAdapter")
          || hasFlag(solana, "isSaga")
        )) return solana;
        if (canConnect(solanaMobileWalletAdapter)) return solanaMobileWalletAdapter;
        if (canConnect(solanaMobile)) return solanaMobile;

        // Some mobile wallets expose a providers[] array on window.solana.
        const providerList = (solana?.providers as unknown[] | undefined) ?? [];
        if (Array.isArray(providerList)) {
          const mobileTagged = providerList.find((p) =>
            canConnect(p) && (
              hasFlag(p, "isSeeker")
              || hasFlag(p, "isSolanaMobile")
              || hasFlag(p, "isMobileWalletAdapter")
              || hasFlag(p, "isSaga")
            ));
          if (mobileTagged) return mobileTagged;
          const firstConnectable = providerList.find((p) => canConnect(p));
          if (firstConnectable) return firstConnectable;
        }

        // Last resort on mobile: try any injected connect-capable provider.
        if (this.isLikelyMobileDevice()) {
          if (canConnect(solana)) return solana;
          if (canConnect(phantom)) return phantom;
          if (canConnect(solflare)) return solflare;
          if (canConnect(backpack)) return backpack;
          if (canConnect(nightly)) return nightly;
          if (canConnect(glow)) return glow;
        }
        return null;
      default:
        return null;
    }
  }

  private async connectInjectedSolanaWallet(preferredWallet: string): Promise<boolean> {
    if (this.hasConnectedWallet()) {
      this.walletError = "Disconnect current wallet before connecting another.";
      return false;
    }
    const provider = this.resolveInjectedSolanaProvider(preferredWallet) as {
      connect?: (opts?: Record<string, unknown>) => Promise<{ publicKey?: { toString: () => string } }>;
      publicKey?: { toString: () => string };
      address?: string;
    } | null;
    if (!provider || typeof provider.connect !== "function") {
      if (preferredWallet === "Seeker" && this.isLikelyMobileDevice()) {
        this.walletError = "No mobile wallet adapter found. Open this app inside the Seeker wallet browser, then try Connect Seeker again.";
      }
      return false;
    }

    this.walletConnectBusy = true;
    this.walletConnectStatus = null;
    this.walletError = null;
    try {
      let result: unknown = null;
      const isSeekerMobileFlow = preferredWallet === "Seeker" && this.isLikelyMobileDevice();
      const connectWithTimeout = async (task: Promise<unknown>, ms: number): Promise<unknown> => {
        let timeoutHandle: number | undefined;
        try {
          return await Promise.race([
            task,
            new Promise<never>((_, reject) => {
              timeoutHandle = window.setTimeout(() => reject(new Error("Wallet connect timed out")), ms);
            }),
          ]);
        } finally {
          if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
        }
      };
      if (isSeekerMobileFlow) {
        // Keep Seeker flow responsive: one bounded attempt, no long retry lockups.
        result = await connectWithTimeout(provider.connect(), 5000);
      } else {
        try {
          const connectTask = provider.connect({ onlyIfTrusted: false });
          result = await connectTask;
        } catch {
          // Some adapters reject connect options and require a plain call.
          result = await provider.connect();
        }
      }
      const resultObj = (result ?? {}) as {
        publicKey?: { toString: () => string };
        address?: string;
        accounts?: Array<{ address?: string }>;
      };
      const address =
        resultObj.publicKey?.toString?.() ??
        provider.publicKey?.toString?.() ??
        resultObj.address ??
        resultObj.accounts?.[0]?.address ??
        provider.address ??
        "";
      if (!address) throw new Error("Wallet returned no public key");

      await client.updateWalletConfig({ SOLANA_ADDRESS: address });
      this.walletConnectStatus = `${preferredWallet} connected. Live balances synced.`;
      this.walletConnectMode = "choose";
      this.walletConnectOpen = false;
      this.selectedWalletLauncher = null;
      await this.loadWalletConfig();
      this.walletAddresses = await client.getWalletAddresses();
      await this.loadBalances();
      return true;
    } catch (err) {
      this.walletError = `Failed to connect ${preferredWallet}: ${err instanceof Error ? err.message : "network error"}`;
      return false;
    } finally {
      this.walletConnectBusy = false;
    }
  }

  private appIconPath(appId: string): string {
    const key = appId.toLowerCase();
    if (key.includes("polymarket")) return "https://www.google.com/s2/favicons?domain=polymarket.com&sz=64";
    if (key.includes("telegram")) return "https://www.google.com/s2/favicons?domain=telegram.org&sz=64";
    if (key.includes("discord")) return "https://www.google.com/s2/favicons?domain=discord.com&sz=64";
    if (key.includes("slack")) return "https://www.google.com/s2/favicons?domain=slack.com&sz=64";
    if (key.includes("whatsapp")) return "https://www.google.com/s2/favicons?domain=whatsapp.com&sz=64";
    if (key.includes("signal")) return "https://www.google.com/s2/favicons?domain=signal.org&sz=64";
    if (key.includes("imessage") || key.includes("bluebubbles")) return "https://www.google.com/s2/favicons?domain=bluebubbles.app&sz=64";
    if (key.includes("bluesky")) return "https://www.google.com/s2/favicons?domain=bsky.app&sz=64";
    if (key.includes("blooio")) return "https://www.google.com/s2/favicons?domain=bloo.io&sz=64";
    if (key.includes("msteams") || key.includes("teams")) return "https://www.google.com/s2/favicons?domain=microsoft.com&sz=64";
    if (key.includes("mattermost")) return "/brands/mattermost.svg";
    if (key.includes("auto-trader")) return "https://www.google.com/s2/favicons?domain=jup.ag&sz=64";
    if (key.includes("openai")) return "https://www.google.com/s2/favicons?domain=openai.com&sz=64";
    if (key.includes("anthropic")) return "https://www.google.com/s2/favicons?domain=anthropic.com&sz=64";
    if (key.includes("google") || key.includes("gemini")) return "https://www.google.com/s2/favicons?domain=ai.google.dev&sz=64";
    if (key.includes("groq")) return "https://www.google.com/s2/favicons?domain=groq.com&sz=64";
    if (key.includes("openrouter")) return "https://www.google.com/s2/favicons?domain=openrouter.ai&sz=64";
    if (key.includes("ollama")) return "https://www.google.com/s2/favicons?domain=ollama.com&sz=64";
    if (key.includes("local ai") || key.includes("local-ai") || key.includes("localai")) return "/brands/local-ai.svg";
    if (key.includes("xai")) return "https://www.google.com/s2/favicons?domain=x.ai&sz=64";
    if (key.includes("vercel")) return "https://www.google.com/s2/favicons?domain=vercel.com&sz=64";
    if (key.includes("sql")) return "https://www.google.com/s2/favicons?domain=sqlite.org&sz=64";
    if (key.includes("localdb")) return "/brands/localdb.svg";
    if (key.includes("inmemorydb") || key.includes("in-memory")) return "/brands/inmemorydb.svg";
    if (key.includes("mcp")) return "https://www.google.com/s2/favicons?domain=modelcontextprotocol.io&sz=64";
    if (key.includes("acp")) return "https://www.google.com/s2/favicons?domain=elizaos.ai&sz=64";
    return "/brands/generic-app.svg";
  }

  private pluginDescription(plugin: PluginInfo): string {
    const fromPlugin = (plugin.description ?? "").trim();
    if (fromPlugin.length > 0) return fromPlugin;
    const key = `${plugin.id} ${plugin.name}`.toLowerCase();
    if (key.includes("openai")) return "Run Milaidy on OpenAI models.";
    if (key.includes("anthropic")) return "Use Anthropic Claude models for Milaidy.";
    if (key.includes("google") || key.includes("gemini")) return "Use Google Gemini models.";
    if (key.includes("groq")) return "Low-latency model routing through Groq.";
    if (key.includes("openrouter")) return "Route model calls through OpenRouter providers.";
    if (key.includes("ollama")) return "Run local models through your Ollama endpoint.";
    if (key.includes("local ai") || key.includes("local-ai") || key.includes("localai")) return "Run Milaidy with local AI inference providers.";
    if (key.includes("xai")) return "Use xAI model endpoints.";
    if (key.includes("vercel")) return "Use Vercel AI Gateway/runtime integrations.";
    if (key.includes("sql")) return "Persist memory/state in SQL storage.";
    if (key.includes("localdb")) return "Store memory locally in embedded database storage.";
    if (key.includes("inmemorydb") || key.includes("in-memory")) return "Use in-memory database state for local runtime sessions.";
    if (key.includes("mcp")) return "Connect external tools through MCP servers.";
    if (key.includes("telegram")) return "Connect Telegram automation workflows.";
    if (key.includes("discord")) return "Connect Discord automation workflows.";
    if (key.includes("polymarket")) return "Enable Polymarket market and execution actions.";
    if (key.includes("slack")) return "Connect Slack workspace actions.";
    if (key.includes("whatsapp")) return "Connect WhatsApp messaging workflows.";
    if (key.includes("signal")) return "Connect Signal messaging workflows.";
    if (key.includes("bluesky")) return "Connect Bluesky posting and automation workflows.";
    if (key.includes("blooio")) return "Connect Blooio iMessage and SMS workflows.";
    if (key.includes("teams")) return "Connect Microsoft Teams actions.";
    if (key.includes("mattermost")) return "Connect Mattermost channel actions.";
    if (key.includes("auto-trader")) return "Automate Solana trading strategies and execution flows.";
    if (key.includes("acp")) return "Agent capability protocol runtime module.";
    return plugin.category === "ai-provider"
      ? "Model module for Milaidy."
      : plugin.category === "database"
        ? "Memory module for Milaidy."
        : "Runtime module for Milaidy.";
  }

  private handleIconError(e: Event, fallback: string): void {
    const img = e.currentTarget as HTMLImageElement;
    if (img.dataset.fallbackApplied === "1") return;
    img.dataset.fallbackApplied = "1";
    img.src = fallback;
  }

  private isLikelyMobileDevice(): boolean {
    return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  }

  private hydrateDeviceProfile(): void {
    const stored = localStorage.getItem(DEVICE_PROFILE_STORAGE_KEY);
    if (stored === "seeker") {
      this.deviceProfile = "seeker";
    }
    this.refreshDeviceProfile();
  }

  private refreshDeviceProfile(): void {
    const detected: "standard" | "seeker" = this.isLikelySeekerDevice() ? "seeker" : "standard";
    this.deviceProfile = detected;
    localStorage.setItem(DEVICE_PROFILE_STORAGE_KEY, detected);
  }

  private isLikelySeekerDevice(): boolean {
    const ua = navigator.userAgent.toLowerCase();
    const uaMatch =
      ua.includes("seeker")
      || ua.includes("solana mobile")
      || ua.includes("solanamobile")
      || ua.includes("saga");
    const w = window as unknown as Record<string, unknown>;
    const solana = w.solana as Record<string, unknown> | undefined;
    const hasMobileInjectedSolana = Boolean(
      solana
      && typeof solana.connect === "function"
      && this.isLikelyMobileDevice()
      && ua.includes("android"),
    );
    const providerMatch = Boolean(
      solana
      && (
        solana.isSeeker === true
        || solana.isSolanaMobile === true
        || solana.isMobileWalletAdapter === true
        || solana.isSaga === true
      ),
    );
    return uaMatch || providerMatch || hasMobileInjectedSolana;
  }

  private handleSeekerConnect(): void {
    this.selectedWalletLauncher = "Seeker";
    if (this.isLikelyMobileDevice()) {
      this.walletConnectStatus =
        "Seeker mobile detected. Tap Connect Seeker and approve wallet access.";
      return;
    }
    this.walletConnectStatus =
      "Seeker connect needs a mobile Solana device. Open this page on Seeker and approve wallet access.";
  }

  private openSeekerWalletDeepLink(): boolean {
    try {
      const currentUrl = encodeURIComponent(window.location.href);
      window.location.href = `solana-wallet://v1/browse/${currentUrl}`;
      return true;
    } catch {
      return false;
    }
  }

  private async connectSolanaMobileWalletAdapter(): Promise<string | null> {
    try {
      // Important: keep this as a dynamic import with @vite-ignore so the UI
      // can still boot even if the optional MWA deps aren't installed in the
      // current build. When present, this is the real Solana Mobile Wallet
      // Adapter path (no "fake connect").
      const mobilePkg = "@solana-mobile/wallet-adapter-mobile";
      const basePkg = "@solana/wallet-adapter-base";
      const mobile = await import(/* @vite-ignore */ mobilePkg) as Record<string, unknown>;
      const base = await import(/* @vite-ignore */ basePkg) as Record<string, unknown>;

      const AdapterCtor = mobile.SolanaMobileWalletAdapter as
        | (new (opts: Record<string, unknown>) => {
          connect: () => Promise<void>;
          disconnect?: () => Promise<void>;
          publicKey?: { toBase58?: () => string; toString?: () => string };
        })
        | undefined;
      if (!AdapterCtor) return null;

      const networkEnum = (base.WalletAdapterNetwork as Record<string, string> | undefined) ?? {};
      // WalletAdapterNetwork.Mainnet is the expected value; fall back to a string
      // to keep the UI resilient across adapter versions.
      const cluster = networkEnum.Mainnet ?? networkEnum.MainnetBeta ?? "mainnet-beta";
      const addressSelector = mobile.createDefaultAddressSelector as (() => unknown) | undefined;
      const authCache = mobile.createDefaultAuthorizationResultCache as (() => unknown) | undefined;
      const walletNotFound = mobile.createDefaultWalletNotFoundHandler as (() => unknown) | undefined;

      const adapter = new AdapterCtor({
        addressSelector: addressSelector?.(),
        authorizationResultCache: authCache?.(),
        cluster,
        onWalletNotFound: walletNotFound?.(),
        appIdentity: {
          name: "Milaidy",
          uri: window.location.origin,
          icon: `${window.location.origin}/favicon.ico`,
        },
      });

      await adapter.connect();
      const address =
        adapter.publicKey?.toBase58?.() ??
        adapter.publicKey?.toString?.() ??
        null;
      await adapter.disconnect?.();
      return address;
    } catch {
      return null;
    }
  }

  private async handleSeekerConnectFlow(): Promise<void> {
    // Seeker connection must be a real MWA connect, never a "fake connect".
    if (this.hasConnectedWallet()) {
      this.walletError = "Disconnect current wallet before connecting another.";
      return;
    }
    if (!this.isLikelyMobileDevice()) {
      this.walletError = "Seeker connection requires a mobile Solana device.";
      return;
    }

    this.selectedWalletLauncher = "Seeker";
    this.walletConnectBusy = true;
    this.walletError = null;
    this.walletConnectStatus = null;
    try {
      const mwaAddress = await this.connectSolanaMobileWalletAdapter();
      if (!mwaAddress) {
        const isLocalDev =
          window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
        this.walletError = isLocalDev
          ? "Mobile wallet adapter is unavailable in this UI build. Install UI deps, then reload, or open Milaidy in your Seeker wallet browser."
          : "Mobile wallet adapter was not detected. Open Milaidy in your Seeker wallet browser and try again.";
        return;
      }
      await client.updateWalletConfig({ SOLANA_ADDRESS: mwaAddress });
      this.walletConnectStatus = "Mobile wallet connected. Live balances synced.";
      this.walletConnectMode = "choose";
      this.walletConnectOpen = false;
      this.selectedWalletLauncher = null;
      await this.loadWalletConfig();
      this.walletAddresses = await client.getWalletAddresses();
      await this.loadBalances();
    } catch (err) {
      this.walletError = `Failed to connect Seeker: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.walletConnectBusy = false;
    }
  }

  private async launchWalletConnect(name: string, url: string): Promise<void> {
    if (this.hasConnectedWallet()) {
      this.walletError = "Disconnect current wallet before connecting another.";
      return;
    }
    this.selectedWalletLauncher = name;
    const connected = await this.connectInjectedSolanaWallet(name);
    if (connected) return;
    this.walletConnectStatus = `Opened ${name}. Approve wallet connect and return to Milaidy.`;
    window.open(url, "_blank");
  }

  private hasConnectedWallet(): boolean {
    return Boolean(this.walletConfig?.walletConnectionLocked)
      || Boolean(this.walletConfig?.evmConfiguredAddress)
      || Boolean(this.walletConfig?.solanaConfiguredAddress);
  }

  private async handleWalletDisconnect(): Promise<void> {
    this.walletConnectBusy = true;
    this.walletConnectStatus = null;
    this.walletError = null;
    try {
      await client.disconnectWallet();
      this.walletBalances = null;
      this.walletNfts = null;
      this.walletImportKey = "";
      this.selectedWalletLauncher = null;
      this.walletConnectMode = "choose";
      await this.loadWalletConfig();
      this.walletAddresses = await client.getWalletAddresses();
      this.walletConnectStatus = "Wallet disconnected. You can connect a new wallet now.";
    } catch (err) {
      this.walletError = `Failed to disconnect wallet: ${err instanceof Error ? err.message : "network error"}`;
    } finally {
      this.walletConnectBusy = false;
    }
  }

  private renderWalletConnectPrompt() {
    const hasConnectedWallet = this.hasConnectedWallet();
    const isMobileBrowser = this.isLikelyMobileDevice();
    const seekerDetected = this.deviceProfile === "seeker" || this.isLikelySeekerDevice();
    const prioritizeSeeker = isMobileBrowser || seekerDetected;
    const currentSolana = this.walletConfig?.solanaConfiguredAddress ?? null;
    const currentSolanaShort = currentSolana
      ? `${currentSolana.slice(0, 4)}...${currentSolana.slice(-4)}`
      : null;
    const currentUrl = encodeURIComponent(window.location.href);

    // Mobile/Seeker uses a dedicated sheet optimized around Solana Mobile Wallet Adapter.
    // Desktop uses the fuller launcher grid.
    if (isMobileBrowser) {
      return this.renderWalletConnectPromptMobile({
        hasConnectedWallet,
        seekerDetected,
        currentSolanaShort,
        currentUrl,
      });
    }

    let walletLaunchers = [
      {
        name: "Phantom",
        logo: "https://www.google.com/s2/favicons?domain=phantom.app&sz=64",
        hint: "Most-used Solana wallet",
        url: `https://phantom.app/ul/browse/${currentUrl}`,
        kind: "launch",
      },
      {
        name: "Solflare",
        logo: "https://www.google.com/s2/favicons?domain=solflare.com&sz=64",
        hint: "Solana wallet + staking",
        url: `https://solflare.com/ul/v1/browse/${currentUrl}`,
        kind: "launch",
      },
      {
        name: "Backpack",
        logo: "https://www.google.com/s2/favicons?domain=backpack.app&sz=64",
        hint: "xNFT + Solana wallet",
        url: "https://backpack.app/download",
        kind: "launch",
      },
      {
        name: "Nightly",
        logo: "https://www.google.com/s2/favicons?domain=nightly.app&sz=64",
        hint: "Multi-chain wallet",
        url: "https://nightly.app/download",
        kind: "launch",
      },
      {
        name: "Glow",
        logo: "https://www.google.com/s2/favicons?domain=glow.app&sz=64",
        hint: "Simple Solana wallet",
        url: "https://glow.app",
        kind: "launch",
      },
      {
        name: "Seeker",
        logo: "https://www.google.com/s2/favicons?domain=solanamobile.com&sz=64",
        hint: seekerDetected ? "Mobile Wallet Adapter (recommended on Seeker)" : "Solana Mobile wallet flow",
        url: "",
        kind: "seeker",
      },
    ] as const;
    if (prioritizeSeeker) {
      walletLaunchers = [...walletLaunchers].sort((a, b) => {
        if (a.kind === "seeker") return -1;
        if (b.kind === "seeker") return 1;
        return 0;
      });
    }
    const primarySeekerLauncher = prioritizeSeeker
      ? walletLaunchers.find((w) => w.kind === "seeker") ?? null
      : null;
    const secondaryLaunchers = prioritizeSeeker
      ? walletLaunchers.filter((w) => w.kind !== "seeker")
      : walletLaunchers;

    return html`
      <div class="setup-card" style="margin-top:12px;">
        <h3 style="margin-bottom:4px;">Connect wallet</h3>
        <p style="margin-bottom:10px;">
          Choose your wallet provider, connect, and view live balances. Native SOL balance works with just a wallet connection; token and NFT enrichment use backend data providers.
        </p>
        ${seekerDetected
          ? html`
              <div style="margin-bottom:10px;padding:8px 10px;border:1px solid color-mix(in srgb, var(--accent) 34%, var(--border-soft));background:var(--accent-subtle);font-size:12px;">
                Seeker device detected. Mobile Wallet Adapter is prioritized first.
              </div>
            `
          : ""}
        ${currentSolanaShort
          ? html`
              <div style="margin-bottom:10px;padding:8px 10px;border:1px solid var(--border);background:var(--bg-muted);font-size:12px;">
                Current Solana address: <code>${currentSolanaShort}</code>
              </div>
            `
          : ""}

        ${hasConnectedWallet
          ? html`
              <div class="plugin-settings-body">
                <div style="font-size:12px;color:var(--muted);">
                  A wallet is already connected. Disconnect it before connecting a different wallet.
                </div>
                <div style="display:flex;justify-content:flex-end;">
                  <button
                    class="btn plugin-pill-btn"
                    ?disabled=${this.walletConnectBusy}
                    @click=${() => this.handleWalletDisconnect()}
                  >${this.walletConnectBusy ? "Disconnecting..." : "Disconnect wallet"}</button>
                </div>
              </div>
            `
          : html`

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
          <button
            class="inventory-subtab ${this.walletConnectMode === "connect" || this.walletConnectMode === "choose" ? "active" : ""}"
            @click=${() => { this.walletConnectMode = "connect"; this.walletConnectStatus = null; }}
          >Connect wallet</button>
          <button
            class="inventory-subtab ${this.walletConnectMode === "import" ? "active" : ""}"
            @click=${() => { this.walletConnectMode = "import"; this.walletConnectStatus = null; this.selectedWalletLauncher = null; }}
          >Import wallet</button>
          <button
            class="inventory-subtab ${this.walletConnectMode === "generate" ? "active" : ""}"
            @click=${() => { this.walletConnectMode = "generate"; this.walletConnectStatus = null; this.selectedWalletLauncher = null; }}
          >Create wallet</button>
        </div>

        ${this.walletConnectMode === "connect" || this.walletConnectMode === "choose"
          ? html`
              <div class="plugin-settings-body">
                <div style="font-size:12px;color:var(--muted);font-weight:600;">
                  Step 1: Choose your wallet app
                </div>
                ${primarySeekerLauncher
                  ? html`
                      <div class="wallet-launcher-priority">
                        <div class="wallet-launcher-priority-title">${seekerDetected ? "Seeker Recommended" : "Mobile Recommended"}</div>
                        <div class="wallet-launcher-card">
                          <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                            <img
                              src=${primarySeekerLauncher.logo}
                              alt=${`${primarySeekerLauncher.name} logo`}
                              style="width:28px;height:28px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--border-soft);padding:2px;"
                              loading="lazy"
                              @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                            />
                            <div style="min-width:0;">
                              <div style="font-size:13px;font-weight:700;color:var(--text-strong);">Mobile Wallet Adapter</div>
                              <div style="font-size:11px;color:var(--muted);">${primarySeekerLauncher.hint}</div>
                            </div>
                          </div>
                          <button
                            class="btn plugin-pill-btn"
                            style="width:100%;"
                            ?disabled=${this.walletConnectBusy}
                            @click=${() => { void this.handleSeekerConnectFlow(); }}
                          >${this.walletConnectBusy ? "Connecting..." : "Connect Seeker"}</button>
                        </div>
                      </div>
                    `
                  : ""}
                <div class=${seekerDetected ? "wallet-launcher-stack" : "wallet-launcher-grid"}>
                  ${secondaryLaunchers.map((wallet) => html`
                    <div class="wallet-launcher-card">
                      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                        <img
                          src=${wallet.logo}
                          alt=${`${wallet.name} logo`}
                          style="width:28px;height:28px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--border-soft);padding:2px;"
                          loading="lazy"
                          @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                        />
                        <div style="min-width:0;">
                          <div style="font-size:13px;font-weight:700;color:var(--text-strong);">${wallet.name}</div>
                          <div style="font-size:11px;color:var(--muted);">${wallet.hint}</div>
                        </div>
                      </div>
                      <button
                        class="plugin-secondary-btn"
                        style="width:100%;"
                        ?disabled=${this.walletConnectBusy}
                        @click=${async () => {
                          await this.launchWalletConnect(wallet.name, wallet.url);
                        }}
                      >${this.walletConnectBusy ? "Connecting..." : `Connect ${wallet.name}`}</button>
                    </div>
                  `)}
                </div>
                <div style="font-size:12px;color:var(--muted);">
                  ${this.selectedWalletLauncher
                    ? `After approving in ${this.selectedWalletLauncher}, Milaidy reads your wallet address automatically.`
                    : "After wallet approval, Milaidy reads your wallet address automatically."}
                </div>
              </div>
            `
          : ""}

        ${this.walletConnectMode === "generate"
          ? html`
              <div class="plugin-settings-body">
                <div style="font-size:12px;color:var(--muted);">Choose chain(s)</div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  ${(["both", "evm", "solana"] as WalletChain[]).map((chain) => html`
                    <button
                      class="filter-btn ${this.walletConnectChain === chain ? "active" : ""}"
                      @click=${() => { this.walletConnectChain = chain; }}
                    >${chain === "both" ? "EVM + Solana" : chain.toUpperCase()}</button>
                  `)}
                </div>
                <div style="display:flex;justify-content:flex-end;">
                  <button class="btn plugin-pill-btn" ?disabled=${this.walletConnectBusy} @click=${() => this.handleWalletGenerate()}>
                    ${this.walletConnectBusy ? "Connecting..." : "Connect & Fetch Live Balance"}
                  </button>
                </div>
              </div>
            `
          : ""}

        ${this.walletConnectMode === "import"
          ? html`
              <div class="plugin-settings-body">
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                  <button
                    class="filter-btn ${this.walletImportChain === "evm" ? "active" : ""}"
                    @click=${() => { this.walletImportChain = "evm"; }}
                  >EVM</button>
                  <button
                    class="filter-btn ${this.walletImportChain === "solana" ? "active" : ""}"
                    @click=${() => { this.walletImportChain = "solana"; }}
                  >Solana</button>
                </div>
                <input
                  type="password"
                  placeholder=${this.walletImportChain === "evm" ? "Paste EVM private key (0x...)" : "Paste Solana private key (base58)"}
                  .value=${this.walletImportKey}
                  @input=${(e: Event) => { this.walletImportKey = (e.target as HTMLInputElement).value; }}
                />
                <div style="display:flex;justify-content:flex-end;">
                  <button
                    class="btn plugin-pill-btn"
                    ?disabled=${this.walletConnectBusy || !this.walletImportKey.trim()}
                    @click=${() => this.handleWalletImport()}
                  >${this.walletConnectBusy ? "Connecting..." : "Connect & Fetch Live Balance"}</button>
                </div>
              </div>
            `
          : ""}
        `}

        ${this.walletConnectStatus
          ? html`<div style="margin-top:8px;color:var(--ok);font-size:12px;">${this.walletConnectStatus}</div>`
          : ""}
        ${this.walletError
          ? html`<div style="margin-top:8px;color:var(--danger, #c94f4f);font-size:12px;">${this.walletError}</div>`
          : ""}
      </div>
    `;
  }

  private renderWalletConnectPromptMobile(input: {
    hasConnectedWallet: boolean;
    seekerDetected: boolean;
    currentSolanaShort: string | null;
    currentUrl: string;
  }) {
    const { hasConnectedWallet, seekerDetected, currentSolanaShort, currentUrl } = input;

    const deepLinkPhantom = `https://phantom.app/ul/browse/${currentUrl}`;
    const deepLinkSolflare = `https://solflare.com/ul/v1/browse/${currentUrl}`;

    return html`
      <div class="setup-card" style="margin-top:12px;">
        <h3 style="margin-bottom:4px;">Connect wallet</h3>
        <p style="margin-bottom:10px;">
          On mobile, connect using Solana Mobile Wallet Adapter for the cleanest flow.
        </p>
        ${seekerDetected
          ? html`
              <div style="margin-bottom:10px;padding:8px 10px;border:1px solid color-mix(in srgb, var(--accent) 34%, var(--border-soft));background:var(--accent-subtle);font-size:12px;">
                Seeker detected. Mobile Wallet Adapter is recommended.
              </div>
            `
          : ""}
        ${currentSolanaShort
          ? html`
              <div style="margin-bottom:10px;padding:8px 10px;border:1px solid var(--border);background:var(--bg-muted);font-size:12px;">
                Current Solana address: <code>${currentSolanaShort}</code>
              </div>
            `
          : ""}

        ${hasConnectedWallet
          ? html`
              <div class="plugin-settings-body">
                <div style="font-size:12px;color:var(--muted);">
                  A wallet is already connected. Disconnect it before connecting a different wallet.
                </div>
                <div style="display:flex;justify-content:flex-end;">
                  <button
                    class="btn plugin-pill-btn"
                    ?disabled=${this.walletConnectBusy}
                    @click=${() => this.handleWalletDisconnect()}
                  >${this.walletConnectBusy ? "Disconnecting..." : "Disconnect wallet"}</button>
                </div>
              </div>
            `
          : html`
              <div class="plugin-settings-body" style="gap:10px;">
                <div style="display:grid;gap:10px;">
                  <button
                    class="btn plugin-pill-btn"
                    style="width:100%;"
                    ?disabled=${this.walletConnectBusy}
                    @click=${() => { void this.handleSeekerConnectFlow(); }}
                  >${this.walletConnectBusy ? "Connecting..." : "Connect mobile wallet"}</button>
                  <button
                    class="plugin-secondary-btn"
                    style="width:100%;"
                    ?disabled=${this.walletConnectBusy}
                    @click=${() => { this.openSeekerWalletDeepLink(); }}
                  >Open in Seeker wallet</button>
                </div>

                <div style="font-size:12px;color:var(--muted);font-weight:700;margin-top:4px;">
                  Other wallets
                </div>
                <div class="wallet-launcher-grid" style="grid-template-columns:1fr 1fr;gap:10px;">
                  <div class="wallet-launcher-card">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                      <img
                        src="https://www.google.com/s2/favicons?domain=phantom.app&sz=64"
                        alt="Phantom logo"
                        style="width:28px;height:28px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--border-soft);padding:2px;"
                        loading="lazy"
                        @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                      />
                      <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:var(--text-strong);">Phantom</div>
                        <div style="font-size:11px;color:var(--muted);">Open wallet browser</div>
                      </div>
                    </div>
                    <button class="plugin-secondary-btn" style="width:100%;" ?disabled=${this.walletConnectBusy} @click=${() => window.open(deepLinkPhantom, "_blank")}>
                      Open
                    </button>
                  </div>

                  <div class="wallet-launcher-card">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                      <img
                        src="https://www.google.com/s2/favicons?domain=solflare.com&sz=64"
                        alt="Solflare logo"
                        style="width:28px;height:28px;border-radius:8px;object-fit:contain;background:#fff;border:1px solid var(--border-soft);padding:2px;"
                        loading="lazy"
                        @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                      />
                      <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:var(--text-strong);">Solflare</div>
                        <div style="font-size:11px;color:var(--muted);">Open wallet browser</div>
                      </div>
                    </div>
                    <button class="plugin-secondary-btn" style="width:100%;" ?disabled=${this.walletConnectBusy} @click=${() => window.open(deepLinkSolflare, "_blank")}>
                      Open
                    </button>
                  </div>
                </div>
              </div>
            `}
      </div>
    `;
  }

  private renderInventoryContent() {
    return html`
      <div class="inv-toolbar">
        <div class="inv-toolbar-left">
          <button class="inventory-subtab ${this.inventoryView === "tokens" ? "active" : ""}"
                  @click=${() => { this.inventoryView = "tokens"; if (!this.walletBalances) this.loadBalances(); }}>
            Tokens
          </button>
          <button class="inventory-subtab ${this.inventoryView === "nfts" ? "active" : ""}"
                  @click=${() => { this.inventoryView = "nfts"; if (!this.walletNfts) this.loadNfts(); }}>
            NFTs
          </button>
        </div>
        <div class="inv-toolbar-right">
          ${this.inventoryView === "tokens" ? html`
            <span class="inv-sort-label">Sort</span>
            <button class="sort-btn ${this.inventorySort === "value" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "value"; }}>Value</button>
            <button class="sort-btn ${this.inventorySort === "symbol" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "symbol"; }}>Name</button>
          ` : ""}
          <button class="btn inv-refresh-btn"
                  @click=${() => this.inventoryView === "tokens" ? this.loadBalances() : this.loadNfts()}>
            Refresh
          </button>
        </div>
      </div>

      <section class="portfolio-section">
        <div class="portfolio-section-title">Wallet</div>
        ${this.renderPortfolioOverview()}
        ${this.inventoryView === "tokens" ? this.renderTokensView() : this.renderNftsView()}
      </section>

      <div class="portfolio-section-divider" role="separator" aria-label="Wallet and Polymarket divider"></div>

      <section class="portfolio-section">
        <div class="portfolio-section-title">Polymarket</div>
        ${this.renderPortfolioPolymarket()}
      </section>
    `;
  }

  private renderPortfolioOverview() {
    const rows = this.flattenBalances();
    const totalUsd = rows.reduce((sum, row) => sum + row.valueUsd, 0);
    const hasAssetBalance = rows.some((row) => row.balanceRaw > 0);
    const portfolioValueLabel =
      totalUsd > 0
        ? this.formatUsd(totalUsd)
        : hasAssetBalance
          ? "Syncing price..."
          : this.formatUsd(0);
    const tokenPositions = rows.length;
    const hasSol = Boolean(this.walletConfig?.solanaAddress);

    const chainTotals = new Map<string, number>();
    for (const row of rows) {
      chainTotals.set(row.chain, (chainTotals.get(row.chain) ?? 0) + row.valueUsd);
    }
    const chainRows = [...chainTotals.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
    const denom = totalUsd > 0 ? totalUsd : 1;
    const solRow = rows.find((r) => r.chain === "Solana" && r.symbol.toUpperCase() === "SOL");
    const memeRows = rows.filter((r) => r.chain === "Solana" && r.symbol.toUpperCase() !== "SOL");
    const solValue = solRow?.valueUsd ?? 0;
    const memeValue = memeRows.reduce((sum, r) => sum + r.valueUsd, 0);
    const memeCount = memeRows.length;
    let nftCount: number | null = null;
    if (this.walletNfts) {
      const solNfts = this.walletNfts.solana?.nfts.length ?? 0;
      nftCount = solNfts;
    }

    return html`
      <div class="portfolio-overview">
        <div class="portfolio-balance-hero">
          <div class="portfolio-balance-label">Portfolio Value</div>
          <div class="portfolio-balance-value">${portfolioValueLabel}</div>
        </div>
        <div class="portfolio-kpis">
          <div class="portfolio-kpi">
            <div class="portfolio-kpi-label">Token Positions</div>
            <div class="portfolio-kpi-value">${tokenPositions}</div>
          </div>
          <div class="portfolio-kpi">
            <div class="portfolio-kpi-label">NFT Items</div>
            <div class="portfolio-kpi-value">${nftCount == null ? "—" : nftCount}</div>
          </div>
        </div>

        <div style="font-size:12px;color:var(--muted);display:flex;gap:12px;flex-wrap:wrap;">
          ${!hasSol ? html`<span>No Solana wallet connected</span>` : ""}
        </div>

        ${chainRows.length > 1
          ? html`
              <div class="portfolio-chain-list">
                ${chainRows.map(([chain, value]) => {
                  const percent = Math.max(0, Math.min(100, (value / denom) * 100));
                  return html`
                    <div class="portfolio-chain-row">
                      <div style="font-size:11px;color:var(--muted);">${chain}</div>
                      <div class="portfolio-bar">
                        <div class="portfolio-bar-fill" style="width:${percent}%;"></div>
                      </div>
                      <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${this.formatUsd(value)}</div>
                    </div>
                  `;
                })}
              </div>
            `
          : ""}

        ${hasSol
          ? html`
              <div class="portfolio-chain-list" style="margin-top:6px;">
                <div class="portfolio-subsection-title">Holdings</div>
                <div class="portfolio-chain-row">
                  <div style="font-size:11px;color:var(--muted);">SOL</div>
                  <div class="portfolio-bar">
                    <div class="portfolio-bar-fill" style="width:${Math.max(0, Math.min(100, (solValue / denom) * 100))}%;"></div>
                  </div>
                  <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${this.formatUsd(solValue)}</div>
                </div>
                <div class="portfolio-chain-row">
                  <div style="font-size:11px;color:var(--muted);">Others (${memeCount})</div>
                  <div class="portfolio-bar">
                    <div class="portfolio-bar-fill" style="width:${Math.max(0, Math.min(100, (memeValue / denom) * 100))}%;"></div>
                  </div>
                  <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${this.formatUsd(memeValue)}</div>
                </div>
              </div>
            `
          : ""}
      </div>
    `;
  }

  private renderPortfolioPolymarket() {
    const polymarket = this.plugins.find((p) => p.id === "polymarket");
    const polymarketEnabled = Boolean(polymarket?.enabled);
    const polymarketConfigured = Boolean(
      polymarket && this.isPluginEffectivelyConfigured(polymarket) && polymarket.validationErrors.length === 0,
    );
    const polymarketExecutionEnabled = this.pluginExecutionToggles.polymarket === true;
    const polymarketWallet =
      this.polymarketPortfolio?.wallet
      ?? this.walletConfig?.evmConfiguredAddress
      ?? this.walletConfig?.evmAddress
      ?? this.walletConfig?.solanaConfiguredAddress
      ?? this.walletConfig?.solanaAddress
      ?? null;
    const livePositions = this.polymarketPortfolio?.positions ?? [];
    const liveFromApi = livePositions.length > 0;
    const fallbackBets = this.securityAuditActions
      .filter((a) => a.pluginId === "polymarket" && a.kind === "prepared")
      .slice(0, 6);
    const balanceLabel =
      this.polymarketPortfolio?.availableBalanceUsd == null
        ? "Unavailable"
        : this.formatUsd(this.polymarketPortfolio.availableBalanceUsd);
    const exposureLabel =
      this.polymarketPortfolio?.openExposureUsd == null
        ? "Unavailable"
        : this.formatUsd(this.polymarketPortfolio.openExposureUsd);
    const pnlLabel =
      this.polymarketPortfolio?.unsettledPnlUsd == null
        ? "Unavailable"
        : this.formatUsd(this.polymarketPortfolio.unsettledPnlUsd);
    const positionsCount = this.polymarketPortfolio?.openPositionsCount ?? livePositions.length;
    const availableValue = this.polymarketPortfolio?.availableBalanceUsd;
    const exposureValue = this.polymarketPortfolio?.openExposureUsd;
    const pnlValue = this.polymarketPortfolio?.unsettledPnlUsd;
    const polymarketValue =
      availableValue == null && exposureValue == null
        ? null
        : (availableValue ?? 0) + (exposureValue ?? 0);
    const polymarketValueLabel = polymarketValue == null ? "Unavailable" : this.formatUsd(polymarketValue);

    return html`
      <div class="portfolio-overview" style="margin-top:12px;">
        <div class="portfolio-polymarket-header">
          <div class="portfolio-polymarket-title">Polymarket</div>
          <div class="portfolio-polymarket-tag">markets</div>
        </div>
        <div class="portfolio-chain-row">
          <div style="font-size:11px;color:var(--muted);">Connection</div>
          <div style="font-size:11px;color:var(--text-strong);">
            ${polymarketEnabled ? (polymarketConfigured ? "Connected" : "Setup required") : "Disabled"}
          </div>
          <div style="font-family:var(--mono);font-size:11px;color:${polymarketExecutionEnabled ? "var(--ok)" : "var(--warn)"};">
            ${polymarketExecutionEnabled ? "Execution on" : "Execution off"}
          </div>
        </div>
        <div class="portfolio-chain-row">
          <div style="font-size:11px;color:var(--muted);">Trading Wallet</div>
          <div style="font-size:11px;color:var(--text-strong);">
            ${polymarketWallet
              ? html`<code>${polymarketWallet.slice(0, 6)}...${polymarketWallet.slice(-4)}</code>`
              : "Not connected"}
          </div>
          <div>
            ${!polymarketEnabled || !polymarketConfigured
              ? html`<button class="plugin-secondary-btn" style="padding:4px 10px;font-size:11px;" @click=${() => this.setTab("apps")}>Open Markets & Apps</button>`
              : ""}
          </div>
        </div>
        <div class="portfolio-balance-hero" style="margin-top:6px;">
          <div class="portfolio-balance-label">Polymarket Value</div>
          <div class="portfolio-balance-value">${polymarketValueLabel}</div>
          <div class="portfolio-chain-list" style="margin-top:8px;">
            <div class="portfolio-chain-row">
              <div style="font-size:11px;color:var(--muted);">Available Balance</div>
              <div></div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${balanceLabel}</div>
            </div>
            <div class="portfolio-chain-row">
              <div style="font-size:11px;color:var(--muted);">Open Exposure</div>
              <div></div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${exposureLabel}</div>
            </div>
            <div class="portfolio-chain-row">
              <div style="font-size:11px;color:var(--muted);">Unsettled PnL</div>
              <div></div>
              <div style="font-family:var(--mono);font-size:11px;color:${(pnlValue ?? 0) < 0 ? "var(--danger, #e74c3c)" : "var(--text-strong)"};">${pnlLabel}</div>
            </div>
            <div class="portfolio-chain-row">
              <div style="font-size:11px;color:var(--muted);">Open Positions</div>
              <div></div>
              <div style="font-family:var(--mono);font-size:11px;color:var(--text-strong);">${positionsCount}</div>
            </div>
          </div>
        </div>
        <div style="border:1px solid var(--border-soft);border-radius:10px;overflow:hidden;background:var(--card);">
          <div style="display:grid;grid-template-columns:1.4fr 1fr auto;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-soft);font-size:10px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);">
            <span>Live Bets</span>
            <span>Outcome</span>
            <span>Amount</span>
          </div>
          ${liveFromApi
            ? livePositions.slice(0, 8).map((pos) => html`
                <div style="display:grid;grid-template-columns:1.4fr 1fr auto;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-soft);font-size:12px;">
                  <div style="min-width:0;">
                    <div style="font-weight:600;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pos.market || "Polymarket position"}</div>
                    <div style="font-size:10px;color:var(--muted);">${pos.updatedAt ? new Date(pos.updatedAt).toLocaleString() : "Live position"}</div>
                  </div>
                  <div style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pos.outcome || "—"}</div>
                  <div style="font-family:var(--mono);color:var(--text-strong);">${this.formatUsd(pos.sizeUsd)}</div>
                </div>
              `)
            : fallbackBets.length === 0
              ? html`<div style="padding:10px;font-size:12px;color:var(--muted);">No live bets in this session yet.</div>`
              : fallbackBets.map((bet) => {
                const detail = bet.detail;
                const marketMatch = /Market:\s*\"([^\"]+)\"/i.exec(detail);
                const outcomeMatch = /Outcome:\s*\"([^\"]+)\"/i.exec(detail);
                const amountMatch = /\$([0-9]+(?:\.[0-9]+)?)/.exec(detail);
                const market = marketMatch?.[1] ?? "Polymarket order";
                const outcome = outcomeMatch?.[1] ?? "—";
                const amount = amountMatch ? `$${amountMatch[1]}` : "—";
                return html`
                  <div style="display:grid;grid-template-columns:1.4fr 1fr auto;gap:8px;padding:8px 10px;border-bottom:1px solid var(--border-soft);font-size:12px;">
                    <div style="min-width:0;">
                      <div style="font-weight:600;color:var(--text-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${market}</div>
                      <div style="font-size:10px;color:var(--muted);">${new Date(bet.at).toLocaleString()}</div>
                    </div>
                    <div style="color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${outcome}</div>
                    <div style="font-family:var(--mono);color:var(--text-strong);">${amount}</div>
                  </div>
                `;
              })}
        </div>
      </div>
    `;
  }

  /** Map chain name to short code for the icon badge. */
  private chainIcon(chain: string): { code: string; cls: string } {
    const c = chain.toLowerCase();
    if (c === "ethereum" || c === "mainnet") return { code: "E", cls: "eth" };
    if (c === "base") return { code: "B", cls: "base" };
    if (c === "arbitrum") return { code: "A", cls: "arb" };
    if (c === "optimism") return { code: "O", cls: "op" };
    if (c === "polygon") return { code: "P", cls: "pol" };
    if (c === "solana") return { code: "S", cls: "sol" };
    return { code: chain.charAt(0).toUpperCase(), cls: "eth" };
  }

  /**
   * Flatten all balances from all chains into a single sortable list.
   */
  private flattenBalances(): Array<{
    chain: string;
    symbol: string;
    name: string;
    balance: string;
    valueUsd: number;
    balanceRaw: number;
    logoUrl: string;
  }> {
    const rows: Array<{
      chain: string;
      symbol: string;
      name: string;
      balance: string;
      valueUsd: number;
      balanceRaw: number;
      logoUrl: string;
    }> = [];

    const b = this.walletBalances;
    if (!b) return rows;

    if (b.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana",
        balance: b.solana.solBalance,
        valueUsd: Number.parseFloat(b.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(b.solana.solBalance) || 0,
        logoUrl: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
      });
      for (const t of b.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
          logoUrl: t.logoUrl || "",
        });
      }
    }

    return rows;
  }

  private tokenLogoFallback(symbol: string, chain: string): string {
    const s = symbol.toUpperCase();
    if (chain.toLowerCase() === "solana" && s === "SOL") {
      return "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png";
    }
    return "";
  }

  private sortedBalances() {
    const rows = this.flattenBalances();
    const solRows = rows.filter((r) => r.chain === "Solana" && r.symbol.toUpperCase() === "SOL");
    const otherRows = rows.filter((r) => !(r.chain === "Solana" && r.symbol.toUpperCase() === "SOL"));
    otherRows.sort((a, b) =>
      b.valueUsd - a.valueUsd
      || b.balanceRaw - a.balanceRaw
      || a.symbol.localeCompare(b.symbol),
    );
    return [...solRows, ...otherRows];
  }

  private renderTokensView() {
    if (this.walletLoading) {
      return html`<div class="empty-state" style="margin-top:24px;">Loading balances...</div>`;
    }
    if (!this.walletBalances) {
      return html`<div class="empty-state" style="margin-top:24px;">No balance data yet. Click Refresh.</div>`;
    }

    const rows = this.sortedBalances();

    if (!this.walletBalances.solana) {
      return html`
        <div class="empty-state" style="margin-top:24px;">
          No Solana wallet data available yet. Connect a Solana wallet and refresh.
        </div>
      `;
    }

    if (rows.length === 0) {
      return html`
        <div class="empty-state" style="margin-top:24px;">
          No Solana assets found yet. If this persists, refresh after wallet sync completes.
        </div>
      `;
    }

    return html`
      <div class="token-table-wrap">
        <table class="token-table">
          <thead>
            <tr>
              <th style="width:32px;"></th>
              <th class=${this.inventorySort === "symbol" ? "sorted" : ""}
                  @click=${() => { this.inventorySort = "symbol"; }}>Token</th>
              <th class=${this.inventorySort === "chain" ? "sorted" : ""}
                  @click=${() => { this.inventorySort = "chain"; }}>Chain</th>
              <th class="r ${this.inventorySort === "value" ? "sorted" : ""}"
                  @click=${() => { this.inventorySort = "value"; }}>Balance</th>
              <th class="r ${this.inventorySort === "value" ? "sorted" : ""}"
                  @click=${() => { this.inventorySort = "value"; }}>Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => {
              const icon = this.chainIcon(row.chain);
              const logo = row.logoUrl || this.tokenLogoFallback(row.symbol, row.chain);
              return html`
                <tr>
                  <td>
                    ${logo
                      ? html`
                          <img
                            class="token-logo"
                            src=${logo}
                            alt=${`${row.symbol} logo`}
                            loading="lazy"
                            @error=${(e: Event) => this.handleIconError(e, "/brands/generic-app.svg")}
                          />
                        `
                      : html`<span class="chain-icon ${icon.cls}">${icon.code}</span>`}
                  </td>
                  <td>
                    <span class="td-symbol">${row.symbol}</span>
                    <span class="td-name" style="margin-left:8px;">${row.name}</span>
                  </td>
                  <td style="font-size:11px;color:var(--muted);">${row.chain}</td>
                  <td class="td-balance">${this.formatBalance(row.balance)}</td>
                  <td class="td-value">${row.valueUsd > 0 ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
    `;
  }

  private renderNftsView() {
    if (this.walletNftsLoading) {
      return html`<div class="empty-state" style="margin-top:24px;">Loading NFTs...</div>`;
    }
    if (!this.walletNfts) {
      return html`<div class="empty-state" style="margin-top:24px;">No NFT data yet. Click Refresh.</div>`;
    }

    const n = this.walletNfts;
    // Flatten all NFTs into a single list with chain info
    type NftItem = { chain: string; name: string; imageUrl: string; collectionName: string };
    const allNfts: NftItem[] = [];

    if (n.solana) {
      for (const nft of n.solana.nfts) {
        allNfts.push({ chain: "Solana", name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName });
      }
    }

    if (allNfts.length === 0) {
      return html`<div class="empty-state" style="margin-top:24px;">No Solana NFTs found for this wallet.</div>`;
    }

    return html`
      <div class="nft-grid">
        ${allNfts.map((nft) => {
          const icon = this.chainIcon(nft.chain);
          return html`
            <div class="nft-card">
              ${nft.imageUrl
                ? html`<img src="${nft.imageUrl}" alt="${nft.name}" loading="lazy" />`
                : html`<div style="width:100%;height:150px;background:var(--bg-muted);display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--muted);">No image</div>`
              }
              <div class="nft-info">
                <div class="nft-name">${nft.name}</div>
                <div class="nft-collection">${nft.collectionName}</div>
                <div class="nft-chain">
                  <span class="chain-icon ${icon.cls}" style="width:12px;height:12px;line-height:12px;font-size:7px;">${icon.code}</span>
                  ${nft.chain}
                </div>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private formatBalance(balance: string): string {
    const num = Number.parseFloat(balance);
    if (Number.isNaN(num)) return balance;
    if (num === 0) return "0";
    if (num < 0.0001) return "<0.0001";
    if (num < 1) return num.toFixed(6);
    if (num < 1000) return num.toFixed(4);
    return num.toLocaleString("en-US", { maximumFractionDigits: 2 });
  }

  private formatUsd(value: number): string {
    if (!Number.isFinite(value)) return "$0.00";
    if (value <= 0) return "$0.00";
    return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Config
  // ═══════════════════════════════════════════════════════════════════════

  private renderConfig() {
    const audits = this.securityAuditActions.slice(0, 12);
    const sol = this.walletConfig?.solanaConfiguredAddress ?? this.walletConfig?.solanaAddress ?? null;
    const evm = this.walletConfig?.evmConfiguredAddress ?? this.walletConfig?.evmAddress ?? null;
    const solShort = sol ? `${sol.slice(0, 6)}...${sol.slice(-4)}` : null;
    const evmShort = evm ? `${evm.slice(0, 6)}...${evm.slice(-4)}` : null;
    const signingLabel = this.walletConfig?.solanaSigningEnabled
      ? "Enabled"
      : this.walletConfig?.solanaWalletConnected
        ? "Enabled (wallet app)"
        : "Disabled";
    const aiDiagnosticsPlugins = this.plugins
      .filter((p) => !this.isHiddenSystemPlugin(p.id) && (p.category === "ai-provider" || p.category === "database"))
      .sort((a, b) => {
        const aReady = a.enabled && this.isPluginEffectivelyConfigured(a) && a.validationErrors.length === 0;
        const bReady = b.enabled && this.isPluginEffectivelyConfigured(b) && b.validationErrors.length === 0;
        if (aReady !== bReady) return aReady ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    const aiReadyCount = aiDiagnosticsPlugins.filter(
      (p) => p.enabled && this.isPluginEffectivelyConfigured(p) && p.validationErrors.length === 0,
    ).length;
    const aiModuleTotal = aiDiagnosticsPlugins.length;
    const aiModuleSummary = aiModuleTotal > 0 ? `${aiReadyCount}/${aiModuleTotal}` : "0";
    const sourceChecks = [
      {
        label: "EVM source",
        status: this.walletConfig?.evmPublicSource ? "Connected (public mode)" : "Not available",
        ok: Boolean(this.walletConfig?.evmPublicSource),
      },
      {
        label: "Solana source",
        status: this.walletConfig?.solanaPublicSource ? "Connected (public mode)" : "Not available",
        ok: Boolean(this.walletConfig?.solanaPublicSource),
      },
      {
        label: "Price source",
        status: this.walletConfig?.pricePublicSource
          ? "Connected (public mode)"
          : this.walletConfig?.birdeyeKeySet
            ? "Configured (provider key set)"
            : "Optional / not available",
        ok: Boolean(this.walletConfig?.pricePublicSource || this.walletConfig?.birdeyeKeySet),
      },
      {
        label: "Helius key",
        status: this.walletConfig?.heliusKeySet ? "Set" : "Not set",
        ok: Boolean(this.walletConfig?.heliusKeySet),
      },
      {
        label: "Alchemy key",
        status: this.walletConfig?.alchemyKeySet ? "Set" : "Not set",
        ok: Boolean(this.walletConfig?.alchemyKeySet),
      },
      {
        label: "Wallet key export",
        status: this.walletConfig?.walletExportEnabled ? "Enabled (high risk)" : "Disabled (recommended)",
        ok: !this.walletConfig?.walletExportEnabled,
      },
    ];
    const sourceHealthyCount = sourceChecks.filter((s) => s.ok).length;

    return html`
      <h2>Security</h2>
      <p class="subtitle">Protect spend and execution actions with confirmations, wallet safeguards, and audit history.</p>

      <div style="margin-top:12px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="font-weight:bold;font-size:14px;margin-bottom:8px;">Action confirmations</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
          Keep both enabled for user safety. Spend/bet confirmation is strongly recommended.
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;">
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input
              type="checkbox"
              .checked=${this.securityRequireExecuteConfirm}
              @change=${(e: Event) => {
                this.securityRequireExecuteConfirm = (e.target as HTMLInputElement).checked;
                this.saveSecurityState();
              }}
            />
            Confirm before execution actions
          </label>
          <label style="display:flex;align-items:center;gap:8px;font-size:13px;">
            <input
              type="checkbox"
              .checked=${this.securityRequireSpendConfirm}
              ?disabled=${!this.securitySpendGuardEnabled}
              @change=${(e: Event) => {
                this.securityRequireSpendConfirm = (e.target as HTMLInputElement).checked;
                this.saveSecurityState();
              }}
            />
            Confirm before spend/bet actions
          </label>
          <div class="security-limits-grid" style="opacity:${this.securitySpendGuardEnabled ? "1" : "0.55"};">
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:12px;color:var(--muted);">Per-trade limit (USD)</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;color:var(--muted);">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  ?disabled=${!this.securitySpendGuardEnabled}
                  style="margin:0;height:30px;padding:4px 8px;"
                  .value=${String(this.securityBetPerTradeLimitUsd)}
                  @change=${(e: Event) => {
                    const next = Number.parseFloat((e.target as HTMLInputElement).value);
                    this.securityBetPerTradeLimitUsd = Number.isFinite(next) ? Math.max(1, next) : 20;
                    this.saveSecurityState();
                  }}
                />
              </div>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:12px;color:var(--muted);">Daily spend limit (USD)</span>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="font-size:12px;color:var(--muted);">$</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  ?disabled=${!this.securitySpendGuardEnabled}
                  style="margin:0;height:30px;padding:4px 8px;"
                  .value=${String(this.securityBetDailyLimitUsd)}
                  @change=${(e: Event) => {
                    const next = Number.parseFloat((e.target as HTMLInputElement).value);
                    this.securityBetDailyLimitUsd = Number.isFinite(next) ? Math.max(1, next) : 50;
                    this.saveSecurityState();
                  }}
                />
              </div>
            </label>
            <label style="display:flex;flex-direction:column;gap:4px;">
              <span style="font-size:12px;color:var(--muted);">Cooldown (seconds)</span>
              <div style="display:flex;align-items:center;gap:8px;padding-right:3px;">
                <input
                  type="number"
                  min="0"
                  step="1"
                  ?disabled=${!this.securitySpendGuardEnabled}
                  style="margin:0;height:30px;padding:4px 8px;width:96px;flex:0 0 96px;"
                  .value=${String(this.securityBetCooldownSec)}
                  @change=${(e: Event) => {
                    const next = Number.parseFloat((e.target as HTMLInputElement).value);
                    this.securityBetCooldownSec = Number.isFinite(next) ? Math.max(0, next) : 30;
                    this.saveSecurityState();
                  }}
                />
                <span style="font-size:12px;color:var(--muted);margin-right:3px;">sec</span>
              </div>
            </label>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:4px;">
            <span style="font-size:13px;">Spend guard</span>
            <div style="display:flex;gap:6px;">
              <button
                class=${this.securitySpendGuardEnabled ? "btn plugin-pill-btn" : "plugin-secondary-btn"}
                @click=${() => {
                  this.securitySpendGuardEnabled = true;
                  this.saveSecurityState();
                }}
              >On</button>
              <button
                class=${!this.securitySpendGuardEnabled ? "btn plugin-pill-btn" : "plugin-secondary-btn"}
                @click=${() => {
                  this.securitySpendGuardEnabled = false;
                  this.saveSecurityState();
                }}
              >Off</button>
            </div>
          </div>
          <div style="font-size:12px;color:var(--muted);">
            Enables spend protections: daily limit, per-trade limit, cooldown, and spend confirmations.
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px;">
            <span style="font-size:13px;">Allow Polymarket bet execution</span>
            <div style="display:flex;gap:6px;">
              <button
                class=${this.pluginExecutionToggles.polymarket === true ? "btn plugin-pill-btn" : "plugin-secondary-btn"}
                @click=${() => this.setPluginExecution("polymarket", true)}
              >On</button>
              <button
                class=${this.pluginExecutionToggles.polymarket === true ? "plugin-secondary-btn" : "btn plugin-pill-btn"}
                @click=${() => this.setPluginExecution("polymarket", false)}
              >Off</button>
            </div>
          </div>
          <div style="font-size:12px;color:var(--muted);">
            Controls whether Milaidy can execute spend/bet actions after confirmation.
          </div>
          ${!this.securitySpendGuardEnabled
            ? html`<div style="font-size:12px;color:var(--warn);">Spend guard is off. Spend limits, cooldown, and spend confirmation are currently bypassed.</div>`
            : ""}
        </div>
      </div>

      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="font-weight:bold;font-size:14px;margin-bottom:8px;">Wallet protection</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
          Connected wallet identity and signing state used for protected actions.
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="font-size:12px;color:var(--muted);">
            Solana wallet: ${solShort
              ? html`<span style="color:var(--ok);"><code>${solShort}</code></span>`
              : html`<span>not connected</span>`}
          </div>
          <div style="font-size:12px;color:var(--muted);">
            EVM wallet: ${evmShort
              ? html`<span style="color:var(--ok);"><code>${evmShort}</code></span>`
              : html`<span>not connected</span>`}
          </div>
          <div style="font-size:12px;color:var(--muted);">
            Solana signing: <span style="color:${this.walletConfig?.solanaSigningEnabled || this.walletConfig?.solanaWalletConnected ? "var(--ok)" : "var(--muted)"};">${signingLabel}</span>
          </div>
          <div style="display:flex;justify-content:flex-end;">
            <button class="plugin-secondary-btn" @click=${() => this.setTab("inventory")}>Open portfolio</button>
          </div>
        </div>
      </div>

      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <div style="font-weight:bold;font-size:14px;">Security activity</div>
          <button class="plugin-secondary-btn" @click=${() => { this.securityAuditActions = []; this.saveSecurityState(); }}>Clear</button>
        </div>
        ${audits.length === 0
          ? html`<div style="font-size:12px;color:var(--muted);">No security events yet. Bets, spend actions, confirmations, and policy blocks will appear here.</div>`
          : html`${audits.map((a) => html`
            <div style="font-size:12px;padding:8px 0;border-top:1px solid var(--border-soft);">
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <span style="font-weight:600;">${a.pluginName}</span>
                <span class="plugin-state-tag ${a.risk === "CAN_SPEND" ? "risk" : a.risk === "CAN_EXECUTE" ? "warn" : "ok"}">${a.risk}</span>
                <span style="color:var(--muted);">${a.kind}</span>
                <span style="color:var(--muted);">${new Date(a.at).toLocaleString()}</span>
              </div>
              <div style="color:var(--muted);margin-top:2px;">${a.detail}</div>
            </div>
          `)}`}
      </div>

      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="font-weight:bold;font-size:14px;margin-bottom:8px;">Security diagnostics</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:10px;">
          Live checks for model/memory modules and wallet data sources.
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px;margin-bottom:12px;">
          <div style="border:1px solid var(--border-soft);border-radius:10px;padding:10px;background:rgba(255,255,255,0.72);">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">AI module health</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="font-size:13px;font-weight:700;color:var(--text-strong);">${aiModuleTotal > 0 ? `${aiModuleSummary} ready` : "No modules detected"}</div>
              <span class="plugin-state-tag ${aiReadyCount > 0 ? "ok" : "warn"}">${aiReadyCount > 0 ? "OK" : "Check"}</span>
            </div>
          </div>
          <div style="border:1px solid var(--border-soft);border-radius:10px;padding:10px;background:rgba(255,255,255,0.72);">
            <div style="font-size:11px;color:var(--muted);margin-bottom:4px;">Wallet data sources</div>
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
              <div style="font-size:13px;font-weight:700;color:var(--text-strong);">${sourceHealthyCount}/${sourceChecks.length} healthy</div>
              <span class="plugin-state-tag ${sourceHealthyCount > 0 ? "ok" : "warn"}">${sourceHealthyCount > 0 ? "OK" : "Check"}</span>
            </div>
          </div>
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-strong);margin:4px 0 8px;">AI modules</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;">
          ${aiDiagnosticsPlugins.length === 0
            ? html`<div style="font-size:12px;color:var(--muted);border:1px solid var(--border-soft);border-radius:10px;padding:10px;background:rgba(255,255,255,0.72);">No model/memory modules discovered.</div>`
            : aiDiagnosticsPlugins.map((p) => {
              const setupComplete = p.enabled && this.isPluginEffectivelyConfigured(p) && p.validationErrors.length === 0;
              const statusLabel = this.pluginStatusLabel(p);
              const requiredCount = p.parameters.filter((param) => param.required).length;
              const requiredSetCount = p.parameters.filter((param) => param.required && (param.isSet || Boolean(param.default))).length;
              return html`
                <div style="border:1px solid var(--border);border-radius:10px;padding:10px;background:rgba(255,255,255,0.88);">
                  <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start;">
                    <div style="font-size:13px;font-weight:700;color:var(--text-strong);">${p.name}</div>
                    <span class="plugin-state-tag ${setupComplete ? "ok" : statusLabel === "Missing keys" ? "warn" : ""}">${setupComplete ? "Ready" : statusLabel}</span>
                  </div>
                  <div style="font-size:11px;color:var(--muted);margin-top:4px;">
                    ${p.category === "ai-provider" ? "Model" : "Memory"} · Required keys ${requiredSetCount}/${requiredCount}
                  </div>
                </div>
              `;
            })}
        </div>

        <div style="font-size:12px;font-weight:700;color:var(--text-strong);margin:12px 0 8px;">Wallet data sources</div>
        <div style="margin-top:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px;">
          ${sourceChecks.map((item) => html`
            <div style="border:1px solid var(--border-soft);border-radius:10px;padding:8px 10px;background:rgba(255,255,255,0.72);">
              <div style="font-size:11px;color:var(--muted);margin-bottom:2px;">${item.label}</div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="font-size:12px;color:var(--text-strong);">${item.status}</div>
                <span class="plugin-state-tag ${item.ok ? "ok" : "warn"}">${item.ok ? "OK" : "Check"}</span>
              </div>
            </div>
          `)}
        </div>
      </div>

      <div style="margin-top:32px;padding-top:18px;border-top:1px solid var(--border);">
        <div style="border:1px solid var(--danger, #e74c3c);padding:16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Reset Agent</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Wipe all config, memory, and data. Returns to onboarding.</div>
          </div>
          <button
            class="btn"
            style="background:var(--danger, #e74c3c);border-color:var(--danger, #e74c3c);white-space:nowrap;margin-top:0;"
            @click=${this.handleReset}
          >Reset Everything</button>
        </div>
      </div>
    `;
  }

  private renderLogs() {
    return html`
      <h2>Activity</h2>
      <p class="subtitle">System events and diagnostics. ${this.logs.length > 0 ? `${this.logs.length} entries.` : ""}</p>
      <div style="margin-bottom:8px;">
        <button class="btn" data-action="refresh-logs" @click=${this.loadLogs} style="font-size:12px;padding:4px 12px;">Refresh</button>
      </div>
      <div class="logs-container">
        ${this.logs.length === 0
          ? html`<div class="empty-state">No log entries yet.</div>`
          : html`
              ${this.logs.map(
                (entry) => html`
                  <div class="log-entry" style="
                    font-family: var(--font-mono, monospace);
                    font-size: 12px;
                    padding: 4px 8px;
                    border-bottom: 1px solid var(--border);
                    display: flex;
                    gap: 8px;
                  ">
                    <span style="color:var(--muted);white-space:nowrap;">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span style="
                      font-weight:600;
                      width:48px;
                      text-transform:uppercase;
                      color: ${entry.level === "error" ? "var(--danger)" : entry.level === "warn" ? "var(--warn)" : "var(--muted)"};
                    ">${entry.level}</span>
                    <span style="color:var(--muted);width:60px;overflow:hidden;text-overflow:ellipsis;">[${entry.source}]</span>
                    <span style="flex:1;word-break:break-all;">${entry.message}</span>
                  </div>
                `,
              )}
            `}
      </div>
    `;
  }

  private async loadLogs(): Promise<void> {
    try {
      const data = await client.getLogs();
      this.logs = data.entries;
      this.logsLoadedAt = Date.now();
    } catch (err) {
      console.error("Failed to load logs:", err);
      this.showUiNotice("Could not load activity logs right now.");
    }
  }

  // --- Onboarding ---

  private renderOnboarding() {
    const opts = this.onboardingOptions;
    if (!opts) {
      return html`<div class="app-shell"><div class="empty-state">Loading onboarding...</div></div>`;
    }

    return html`
      <div class="app-shell">
        <div class="onboarding">
          ${this.onboardingStep === 0 ? this.renderOnboardingWelcome() : ""}
          ${this.onboardingStep === 1 ? this.renderOnboardingName(opts) : ""}
          ${this.onboardingStep === 2 ? this.renderOnboardingStyle(opts) : ""}
          ${this.onboardingStep === 3 ? this.renderOnboardingProvider(opts) : ""}
        </div>
      </div>
    `;
  }

  private renderOnboardingWelcome() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" />
      <h1 class="onboarding-welcome-title">Welcome to milAIdy!</h1>
      <p class="onboarding-welcome-sub">
        milAIdy is your AI assistant for chat, markets, and onchain moves. Set your profile identity, visual theme, and model provider to shape your personal command room.
      </p>
      <button class="btn" @click=${() => void this.handleOnboardingNext()}>Start setup</button>
    `;
  }

  private renderOnboardingName(opts: OnboardingOptions) {
    const colorOptions = this.themeColorOptions();
    const customSelected = this.onboardingName.trim().length > 0 && !opts.names.includes(this.onboardingName.trim());
    const selectedCustomAccent = this.onboardingCustomAccent || colorOptions[0].value;
    const previewAccent = customSelected
      ? selectedCustomAccent
      : this.characterTheme(this.onboardingName.trim() || opts.names[0] || "milaidy").accent;

    return html`
      <img
        class="onboarding-avatar"
        src=${this.characterImage(this.onboardingName.trim() || opts.names[0] || "milaidy")}
        alt="Profile preview"
        style="width:100px;height:100px;border:3px solid ${previewAccent};"
      />
      <div class="onboarding-speech">Pick your character to set your look and aura.</div>
      <div class="onboarding-character-grid">
        ${opts.names.map(
          (name) => {
            const theme = this.characterTheme(name);
            const selected = this.onboardingName === name;
            return html`
            <div
              class="onboarding-character-card ${selected ? "selected" : ""}"
              style="border-color:${selected ? theme.accent : "var(--border)"};background:${selected ? theme.surface : "var(--card)"};"
              @click=${() => {
                this.onboardingName = name;
                this.onboardingCustomAccent = "";
                this.nameValidationMessage = null;
                // Immediately apply the selected character image (fallback OK while the real one loads).
                this.saveProfileAppearance(this.characterImage(name), theme.accent);
                this.applyThemeFromAccent(theme.accent);
                void this.ensureCharacterImage(name);
              }}
            >
              <img
                class="onboarding-character-avatar"
                src=${this.characterImage(name)}
                alt=${`${name} portrait`}
                style="border:2px solid ${theme.accent};box-shadow:0 0 0 2px color-mix(in srgb, ${theme.accent} 20%, white);"
                @error=${(e: Event) => {
                  const img = e.currentTarget as HTMLImageElement;
                  img.src = this.fallbackCharacterImage(name);
                }}
              />
              <div>
                <div class="label">${name}</div>
                <div class="hint" style="color:${theme.accent};">Theme preview</div>
              </div>
            </div>
          `;
          },
        )}
      </div>
      <div class="onboarding-options" style="margin-top:10px;">
        <div
          class="onboarding-option ${this.onboardingName && !opts.names.includes(this.onboardingName) ? "selected" : ""}"
          @click=${(e: Event) => {
            const input = (e.currentTarget as HTMLElement).querySelector("input");
            if (input) input.focus();
          }}
        >
          <input
            type="text"
            placeholder="Or enter your @name..."
            .value=${opts.names.includes(this.onboardingName) ? "" : this.onboardingName}
            @input=${(e: Event) => {
              const nextName = (e.target as HTMLInputElement).value;
              this.onboardingName = nextName;
              this.nameValidationMessage = null;
              if (nextName.trim()) {
                const isPreset = opts.names.includes(nextName.trim());
                if (!isPreset && !this.onboardingCustomAccent) {
                  this.onboardingCustomAccent = colorOptions[0].value;
                }
                const accent = (!isPreset && this.onboardingCustomAccent)
                  ? this.onboardingCustomAccent
                  : this.characterTheme(nextName).accent;
                this.saveProfileAppearance(this.profileImageUrl, accent);
                this.applyThemeFromAccent(accent);
              }
            }}
            @focus=${() => { /* clear preset selection when typing custom */ }}
            style="
              border: none;
              background: transparent;
              font-size: 14px;
              font-weight: bold;
              width: 100%;
              padding: 0;
              outline: none;
              color: inherit;
              font-family: inherit;
            "
          />
        </div>
      </div>
      ${customSelected
        ? html`
            <div class="onboarding-options" style="margin-top:10px;">
              <label style="font-size:12px;color:var(--muted);font-weight:600;">Choose your color aura</label>
              <div class="theme-swatch-row">
                ${colorOptions.map((opt) => {
                  const selected = selectedCustomAccent === opt.value;
                  return html`
                    <button
                      type="button"
                      class="theme-swatch ${selected ? "selected" : ""}"
                      style="background:${opt.value};"
                      title=${opt.label}
                      aria-label=${`Select ${opt.label}`}
                      @click=${() => {
                        this.onboardingCustomAccent = opt.value;
                        this.saveProfileAppearance(this.profileImageUrl, opt.value);
                        this.applyThemeFromAccent(opt.value);
                      }}
                    >${selected ? "✓" : ""}</button>
                  `;
                })}
              </div>
            </div>
          `
        : ""}
      <button
        class="btn"
        @click=${() => void this.handleOnboardingNext()}
        ?disabled=${!this.onboardingName.trim()}
      >Next</button>
      ${this.nameValidationMessage
        ? html`<div style="margin-top:8px;font-size:12px;color:#c94f4f;">${this.nameValidationMessage}</div>`
        : ""}
    `;
  }

  private renderOnboardingStyle(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">Pick your response mode.</div>
      <div class="onboarding-options">
        ${opts.styles.map(
          (style) => html`
            <div
              class="onboarding-option ${this.onboardingStyle === style.catchphrase ? "selected" : ""}"
              @click=${() => {
                this.onboardingStyle = style.catchphrase;
                const accent = this.resolvedOnboardingAccent();
                this.applyThemeFromAccent(accent);
              }}
            >
              <div class="label">${style.catchphrase}</div>
              <div class="hint">${style.hint}</div>
            </div>
          `,
        )}
      </div>
      <button
        class="btn"
        @click=${() => void this.handleOnboardingNext()}
        ?disabled=${!this.onboardingStyle}
      >Next</button>
    `;
  }

  private renderOnboardingProvider(opts: OnboardingOptions) {
    const selected = opts.providers.find((p) => p.id === this.onboardingProvider);
    const needsKey = this.providerNeedsKey(selected);
    const hasKey = Boolean(this.onboardingApiKey.trim());
    const keyLooksValid = needsKey
      ? this.looksLikeApiKey(this.onboardingApiKey, selected?.keyPrefix ?? null)
      : true;
    const missingKey = Boolean(needsKey && !hasKey);
    const finishLabel = this.onboardingFinishing
      ? "Entering..."
      : missingKey
        ? "Set up later"
        : needsKey && !keyLooksValid
          ? "Fix key"
          : "Enter milAIdy";

    const apiKeyBox = needsKey
      ? html`
          <div style="margin-top:10px;padding:10px 12px;border:1px solid rgba(201,79,79,0.45);background:rgba(201,79,79,0.08);border-radius:12px;">
            <div style="font-weight:800;font-size:12px;color:var(--text-strong);margin-bottom:4px;">
              API key required to chat with this provider
            </div>
            <div style="font-size:12px;color:var(--muted);line-height:1.35;">
              Add your ${selected?.name ?? "provider"} key below. This is stored locally in your Milaidy config and never shown in plain text.
            </div>
          </div>
          <input
            class="onboarding-input"
            type="password"
            placeholder="Paste provider API key to continue"
            .value=${this.onboardingApiKey}
            @input=${(e: Event) => { this.onboardingApiKey = (e.target as HTMLInputElement).value; }}
          />
          ${hasKey && !keyLooksValid
            ? html`<div style="margin-top:8px;font-size:12px;color:#c94f4f;line-height:1.35;">
                That key doesn't look valid for ${selected?.name ?? "this provider"}. Check the prefix and try again.
              </div>`
            : ""}
        `
      : "";

    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">Choose the model provider that powers your milAIdy chats.</div>
      <div style="font-size:12px;color:var(--muted);margin-top:6px;">
        Provider changes take effect after a restart. milAIdy will restart automatically after setup.
      </div>
      <div class="onboarding-options">
        ${opts.providers.map(
          (provider) => html`
            <div
              class="onboarding-option ${this.onboardingProvider === provider.id ? "selected" : ""}"
              @click=${() => { this.onboardingProvider = provider.id; this.onboardingApiKey = ""; }}
            >
              <div class="label">${provider.name}</div>
              <div class="hint">${provider.description}</div>
            </div>
            ${this.onboardingProvider === provider.id ? apiKeyBox : ""}
            ${this.onboardingProvider === provider.id && provider.id === "ollama"
              ? html`
                  <div style="margin-top:10px;padding:10px 12px;border:1px solid var(--border);background:rgba(255,255,255,0.7);border-radius:12px;">
                    <div style="font-weight:800;font-size:12px;color:var(--text-strong);margin-bottom:4px;">
                      Ollama must be running on this device
                    </div>
                    <div style="font-size:12px;color:var(--muted);line-height:1.35;">
                      Ollama has no API key, but it is a local server. If it isn't installed and running, chats will fail.
                    </div>
                  </div>
                `
              : ""}
          `,
        )}
      </div>
      <button
        class="btn"
        @click=${() => void this.handleOnboardingFinish()}
        ?disabled=${this.onboardingFinishing || !this.onboardingProvider || (needsKey && hasKey && !keyLooksValid)}
      >${finishLabel}</button>
      ${missingKey
        ? html`
            <div style="margin-top:10px;font-size:12px;color:var(--muted);line-height:1.35;">
              You can add a key later in AI Settings. Chat will be locked until a provider key is connected.
            </div>
          `
        : ""}
      ${this.nameValidationMessage
        ? html`<div style="margin-top:10px;font-size:12px;color:#c94f4f;line-height:1.35;">${this.nameValidationMessage}</div>`
        : ""}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "milaidy-app": MilaidyApp;
  }
}
