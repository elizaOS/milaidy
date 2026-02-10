/**
 * Main Milaidy App component.
 *
 * Single-agent dashboard with onboarding wizard, chat, plugins, skills,
 * config, and logs views.
 */

import { LitElement, html, css } from "lit";
import { customElement, state } from "lit/decorators.js";
import {
  client,
  type AgentStatus,
  type CharacterData,
  type ChatMessage,
  type PluginInfo,
  type PluginParamDef,
  type SkillInfo,
  type LogEntry,
  type OnboardingOptions,
  type InventoryProviderOption,
  type ExtensionStatus,
  type RegistryPlugin,
  type CatalogSkill,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletNftsResponse,
  type WalletConfigStatus,
  type WalletExportResult,
  type SkillMarketplaceResult,
  type ShareIngestPayload,
  type ShareIngestItem,
  type WorkbenchGoal,
  type WorkbenchTodo,
  type WorkbenchOverview,
  type McpServerConfig,
  type McpMarketplaceResult,
  type McpRegistryServerDetail,
  type McpServerStatus,
  type UpdateStatus,
  type ReleaseChannel,
} from "./api-client.js";
import { type Conversation, type ConversationMessage } from "./api-client.js";
import { tabFromPath, pathForTab, type Tab, TAB_GROUPS, titleForTab } from "./navigation.js";
import "./database-viewer.js";
import "./apps-view.js";
import "./game-view.js";
import "./conversations-sidebar.js";
import "./widget-sidebar.js";

const THEME_STORAGE_KEY = "milaidy:theme";

type ThemeName = "milady" | "qt314" | "web2000" | "programmer" | "haxor" | "psycho";

const THEMES: ReadonlyArray<{ id: ThemeName; label: string; hint: string }> = [
  { id: "milady", label: "milady", hint: "clean black & white" },
  { id: "qt314", label: "qt3.14", hint: "soft pastels" },
  { id: "web2000", label: "web2000", hint: "green hacker vibes" },
  { id: "programmer", label: "programmer", hint: "vscode dark" },
  { id: "haxor", label: "haxor", hint: "terminal green" },
  { id: "psycho", label: "psycho", hint: "pure chaos" },
];

const VALID_THEMES = new Set<string>(THEMES.map(t => t.id));

@customElement("milaidy-app")
export class MilaidyApp extends LitElement {
  // --- State ---
  @state() tab: Tab = "chat";
  @state() currentTheme: ThemeName = "milady";
  @state() connected = false;
  @state() agentStatus: AgentStatus | null = null;
  @state() onboardingComplete = false;
  @state() onboardingLoading = true;
  @state() chatMessages: ChatMessage[] = [];
  @state() chatInput = "";
  @state() chatSending = false;
  @state() conversations: Conversation[] = [];
  @state() activeConversationId: string | null = null;
  @state() conversationMessages: ConversationMessage[] = [];
  @state() plugins: PluginInfo[] = [];
  @state() pluginFilter: "all" | "ai-provider" | "connector" | "feature" = "all";
  @state() pluginStatusFilter: "all" | "enabled" | "disabled" = "all";
  @state() pluginSearch = "";
  @state() pluginSettingsOpen: Set<string> = new Set();
  @state() pluginAdvancedOpen: Set<string> = new Set();
  @state() pluginSaving: Set<string> = new Set();
  @state() pluginSaveSuccess: Set<string> = new Set();
  @state() skills: SkillInfo[] = [];
  @state() logs: LogEntry[] = [];
  @state() logSources: string[] = [];
  @state() logTags: string[] = [];
  @state() logTagFilter = "";
  @state() logLevelFilter = "";
  @state() logSourceFilter = "";
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

  // Cloud state
  @state() cloudConnected = false;
  @state() cloudCredits: number | null = null;
  @state() cloudCreditsLow = false;
  @state() cloudCreditsCritical = false;
  @state() cloudTopUpUrl = "https://www.elizacloud.ai/dashboard/billing";
  private cloudPollInterval: number | null = null;

  // Software updates state
  @state() updateStatus: UpdateStatus | null = null;
  @state() updateLoading = false;
  @state() updateChannelSaving = false;
  @state() walletAddresses: WalletAddresses | null = null;
  @state() walletConfig: WalletConfigStatus | null = null;
  @state() walletBalances: WalletBalancesResponse | null = null;
  @state() walletNfts: WalletNftsResponse | null = null;
  @state() walletLoading = false;
  @state() walletNftsLoading = false;
  @state() inventoryView: "tokens" | "nfts" = "tokens";
  @state() walletExportData: WalletExportResult | null = null;
  @state() walletExportVisible = false;
  @state() walletApiKeySaving = false;
  @state() inventorySort: "chain" | "symbol" | "value" = "value";
  @state() walletError: string | null = null;
  @state() providerModalOpen: "alchemy" | "helius" | "birdeye" | null = null;

  // Plugin Store state
  @state() storePlugins: RegistryPlugin[] = [];
  @state() storeSearch = "";
  @state() storeFilter: "all" | "installed" | "ai-provider" | "connector" | "feature" = "all";
  @state() storeShowBundled = false;
  @state() storeLoading = false;
  @state() storeInstalling: Set<string> = new Set();
  @state() storeUninstalling: Set<string> = new Set();
  @state() storeError: string | null = null;
  @state() storeDetailPlugin: RegistryPlugin | null = null;

  // Store sub-tab: plugins vs skills
  @state() storeSubTab: "plugins" | "skills" = "plugins";

  // Skill Catalog state
  @state() catalogSkills: CatalogSkill[] = [];
  @state() catalogTotal = 0;
  @state() catalogPage = 1;
  @state() catalogTotalPages = 1;
  @state() catalogSort: "downloads" | "stars" | "updated" | "name" = "downloads";
  @state() catalogSearch = "";
  @state() catalogLoading = false;
  @state() catalogError: string | null = null;
  @state() catalogDetailSkill: CatalogSkill | null = null;
  @state() catalogInstalling: Set<string> = new Set();
  @state() catalogUninstalling: Set<string> = new Set();

  // Character state
  @state() characterData: CharacterData | null = null;
  @state() characterLoading = false;
  @state() characterSaving = false;
  @state() characterSaveSuccess: string | null = null;
  @state() characterSaveError: string | null = null;
  @state() characterDraft: CharacterData = {};

  // Agent export/import state
  @state() exportBusy = false;
  @state() exportPassword = "";
  @state() exportIncludeLogs = false;
  @state() exportError: string | null = null;
  @state() exportSuccess: string | null = null;
  @state() importBusy = false;
  @state() importPassword = "";
  @state() importFile: File | null = null;
  @state() importError: string | null = null;
  @state() importSuccess: string | null = null;

  // Onboarding wizard state
  @state() onboardingStep: "welcome" | "name" | "style" | "theme" | "runMode" | "cloudProvider" | "modelSelection" | "llmProvider" | "inventorySetup" = "welcome";
  @state() onboardingOptions: OnboardingOptions | null = null;
  @state() onboardingName = "";
  @state() onboardingStyle = "";
  @state() onboardingTheme: ThemeName = "milady";
  @state() onboardingRunMode: "local" | "cloud" | "" = "";
  @state() onboardingCloudProvider = "";
  @state() onboardingSmallModel = "claude-haiku";
  @state() onboardingLargeModel = "claude-sonnet-4-5";
  @state() onboardingProvider = "";
  @state() onboardingApiKey = "";
  @state() onboardingSelectedChains: Set<string> = new Set(["evm", "solana"]);
  @state() onboardingRpcSelections: Record<string, string> = {};
  @state() onboardingRpcKeys: Record<string, string> = {};
  @state() private isMobileDevice = false;

  // Active game state (for the "game" tab)
  @state() private activeGameApp = "";
  @state() private activeGameDisplayName = "";
  @state() private activeGameViewerUrl = "";
  @state() private activeGameSandbox = "allow-scripts allow-same-origin allow-popups";
  @state() private activeGamePostMessageAuth = false;

  // Skills Marketplace state
  @state() skillsMarketplaceQuery = "";
  @state() skillsMarketplaceResults: SkillMarketplaceResult[] = [];
  @state() skillsMarketplaceError = "";
  @state() skillsMarketplaceLoading = false;
  @state() skillsMarketplaceApiKeySet = false;
  @state() skillsMarketplaceApiKeyInput = "";
  @state() skillsMarketplaceApiKeySaving = false;
  @state() skillsMarketplaceAction = "";
  @state() skillsMarketplaceManualGithubUrl = "";
  @state() skillToggleAction = "";
  @state() skillsSubTab: "my" | "browse" = "my";
  @state() skillCreateFormOpen = false;
  @state() skillCreateName = "";
  @state() skillCreateDescription = "";
  @state() skillCreating = false;
  @state() skillReviewReport: import("./api-client").SkillScanReportSummary | null = null;
  @state() skillReviewId = "";
  @state() skillReviewLoading = false;

  // Native desktop state
  @state() nativeEvents: string[] = [];
  @state() nativeDesktopAvailable = false;
  @state() nativeShortcutEnabled = false;
  @state() nativeTrayEnabled = false;
  private nativeListenerHandles: Array<{ remove: () => Promise<void> }> = [];

  // Action notice state
  @state() actionNotice: { tone: string; text: string } | null = null;
  private actionNoticeTimer: number | null = null;

  // Command palette state
  @state() commandPaletteOpen = false;
  @state() commandQuery = "";
  @state() commandActiveIndex = 0;

  // Workbench state
  @state() workbenchLoading = false;
  @state() workbench: WorkbenchOverview | null = null;
  @state() workbenchGoalsAvailable = false;
  @state() workbenchTodosAvailable = false;
  @state() workbenchEditingGoalId: string | null = null;
  @state() workbenchGoalName = "";
  @state() workbenchGoalDescription = "";
  @state() workbenchGoalTags = "";
  @state() workbenchGoalPriority = "3";
  @state() workbenchTodoName = "";
  @state() workbenchTodoDescription = "";
  @state() workbenchTodoPriority = "3";
  @state() workbenchTodoUrgent = false;

  // MCP state
  @state() mcpConfigLoading = false;
  @state() mcpConfiguredServers: Record<string, McpServerConfig> = {};
  @state() mcpServerStatuses: McpServerStatus[] = [];
  @state() mcpMarketplaceQuery = "";
  @state() mcpMarketplaceResults: McpMarketplaceResult[] = [];
  @state() mcpMarketplaceLoading = false;
  @state() mcpAction = "";
  @state() mcpAddingServer: McpRegistryServerDetail | null = null;
  @state() mcpAddingResult: McpMarketplaceResult | null = null;
  @state() mcpEnvInputs: Record<string, string> = {};
  @state() mcpHeaderInputs: Record<string, string> = {};
  @state() mcpManualName = "";
  @state() mcpManualType: McpServerConfig["type"] = "stdio";
  @state() mcpManualCommand = "";
  @state() mcpManualArgs = "";
  @state() mcpManualUrl = "";
  @state() mcpManualEnvPairs: Array<{ key: string; value: string }> = [];
  private mcpStatusTimers: number[] = [];

  // Config state
  @state() configRaw: Record<string, unknown> = {};
  @state() configText = "";

  // Share ingest state
  @state() droppedFiles: string[] = [];
  @state() shareIngestNotice = "";
  private shareIngestTimer: number | null = null;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      font-family: var(--font-body);
      color: var(--text);
      background: var(--bg);
    }

    /* Layout */
    .app-shell {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
      max-width: 80%;
      margin: 0 auto;
      padding: 0 32px;
      width: 100%;
      box-sizing: border-box;
    }

    .app-shell.chat-layout {
      padding: 0;
    }

    .app-shell.chat-layout > header,
    .app-shell.chat-layout > nav {
      padding-left: 20px;
      padding-right: 20px;
    }

    .content-row {
      display: flex;
      flex: 1;
      min-height: 0;
    }

    .content-row > main {
      flex: 1;
      min-width: 0;
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

    /* Header */
    header {
      border-bottom: 1px solid var(--border);
      padding: 16px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .logo {
      font-size: 18px;
      font-weight: bold;
      color: var(--text-strong);
      text-decoration: none;
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
      padding: 2px 10px;
      border: 1px solid var(--border);
      font-size: 12px;
      font-family: var(--mono);
    }

    .status-pill.running { border-color: var(--ok); color: var(--ok); }
    .status-pill.paused { border-color: var(--warn); color: var(--warn); }
    .status-pill.stopped { border-color: var(--muted); color: var(--muted); }
    .status-pill.restarting { border-color: var(--warn); color: var(--warn); }
    .status-pill.error { border-color: var(--danger, #e74c3c); color: var(--danger, #e74c3c); }

    .lifecycle-btn {
      padding: 4px 12px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--mono);
    }

    .lifecycle-btn:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    /* Theme selector (in config) */
    .theme-btn {
      padding: 6px 14px;
      text-align: center;
      cursor: pointer;
      font-family: inherit;
      border: 2px solid var(--border);
      background: var(--card);
      border-radius: var(--radius);
      transition: all var(--duration-fast) ease;
    }

    .theme-btn:hover {
      border-color: var(--accent);
    }

    .theme-btn.active {
      border-color: var(--accent);
      background: var(--accent-subtle);
    }

    /* Wallet icon */
    .wallet-wrapper {
      position: relative;
      display: inline-flex;
    }

    .wallet-btn {
      padding: 4px 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      font-size: 14px;
      line-height: 1;
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
      padding: 10px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      z-index: 100;
      min-width: 280px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
    }

    /* Invisible bridge so the hover doesn't break crossing the gap */
    .wallet-wrapper::after {
      content: "";
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      height: 8px;
    }

    .wallet-wrapper:hover::after {
      display: block;
    }

    .wallet-wrapper:hover .wallet-tooltip {
      display: block;
      margin-top: 8px;
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


    /* Cloud credit badge */
    .credit-badge-wrapper { display: inline-flex; }
    .credit-badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 3px 10px; border: 1px solid var(--border);
      background: var(--bg); font-family: var(--mono);
      font-size: 12px; line-height: 1; text-decoration: none;
      color: var(--fg); transition: border-color 0.15s, color 0.15s;
    }
    .credit-badge:hover { border-color: var(--accent); color: var(--accent); }
    .credit-badge.credit-ok { border-color: #2d8a4e; color: #2d8a4e; }
    .credit-badge.credit-low { border-color: #b8860b; color: #b8860b; }
    .credit-badge.credit-critical { border-color: #c0392b; color: #c0392b; }
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
      gap: 8px;
      margin-top: 12px;
      flex-wrap: wrap;
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
      max-height: 60vh;
      overflow-y: auto;
      background: var(--card);
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
      background: var(--card);
      overflow: hidden;
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
      background: var(--card);
      padding: 20px;
      margin-top: 16px;
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

    /* Provider tiles (progressive disclosure) */
    .provider-tiles {
      display: flex;
      gap: 16px;
      margin-top: 16px;
    }

    .provider-tile {
      flex: 1;
      aspect-ratio: 1;
      max-width: 160px;
      border: 1px solid var(--border);
      background: var(--card);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: border-color 0.15s, background 0.15s;
      position: relative;
    }

    .provider-tile:hover {
      border-color: var(--accent);
      background: var(--bg-muted);
    }

    .provider-tile .tile-icon {
      font-size: 48px;
      font-weight: 700;
      color: var(--muted);
      line-height: 1;
    }

    .provider-tile:hover .tile-icon {
      color: var(--accent);
    }

    .provider-tile .tile-label {
      margin-top: 10px;
      font-size: 12px;
      font-weight: 600;
    }

    .provider-tile .tile-tag {
      position: absolute;
      top: 8px;
      right: 8px;
      font-size: 9px;
      padding: 2px 6px;
      border-radius: 3px;
    }

    .provider-tile .tile-tag.configured {
      background: rgba(46, 204, 113, 0.12);
      color: var(--ok);
    }

    .provider-tile .tile-tag.optional {
      color: var(--muted);
      background: var(--bg-muted);
    }

    /* Provider modal */
    .provider-modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .provider-modal {
      background: var(--bg);
      border: 1px solid var(--border);
      width: 480px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .provider-modal h3 {
      margin: 0 0 8px 0;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .provider-modal .modal-close {
      background: none;
      border: none;
      color: var(--muted);
      font-size: 20px;
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
    }

    .provider-modal .modal-close:hover {
      color: var(--text);
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

    /* Navigation */
    nav {
      border-bottom: 1px solid var(--border);
      padding: 8px 0;
    }

    nav a {
      display: inline-block;
      padding: 4px 12px;
      margin-right: 4px;
      color: var(--muted);
      text-decoration: none;
      font-size: 13px;
      border-bottom: 2px solid transparent;
    }

    nav a:hover {
      color: var(--text);
      text-decoration: none;
    }

    nav a.active {
      color: var(--accent);
      border-bottom-color: var(--accent);
    }

    /* Main content */
    main {
      flex: 1;
      min-height: 0;
      padding: 24px 0;
      overflow-y: auto;
    }

    /* When chat is active, main becomes a flex column so chat-container fills it
       and only .chat-messages scrolls — no double scrollbar */
    main.chat-active {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding-top: 12px;
      padding-bottom: 0;
    }

    h2 {
      font-size: 18px;
      font-weight: normal;
      margin: 0 0 8px 0;
      color: var(--text-strong);
    }

    .subtitle {
      color: var(--muted);
      font-size: 13px;
      margin-bottom: 20px;
    }

    /* Footer (removed) */
    footer {
      display: none;
      color: var(--muted);
      text-align: center;
    }

    /* Onboarding */
    .onboarding {
      max-width: 500px;
      margin: 40px auto;
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
      background: var(--card);
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

    .onboarding-option {
      padding: 12px 16px;
      border: 1px solid var(--border);
      cursor: pointer;
      background: var(--card);
    }

    .onboarding-option:hover {
      border-color: var(--accent);
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

    .onboarding-options-scroll {
      max-height: 300px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
    }

    .theme-option {
      transition: border-color 0.15s, background 0.15s;
    }

    .inventory-chain-block {
      margin-bottom: 12px;
    }

    .inventory-chain-block:last-child {
      margin-bottom: 0;
    }

    @media (max-width: 768px) {
      .onboarding {
        margin: 20px auto;
        padding: 0 8px;
      }

      .onboarding-options-scroll {
        max-height: 240px;
      }

      .onboarding-avatar {
        width: 80px !important;
        height: 80px !important;
      }
    }

    .btn {
      padding: 8px 24px;
      border: 1px solid var(--accent);
      background: var(--accent);
      color: var(--accent-foreground);
      cursor: pointer;
      font-size: 14px;
      margin-top: 20px;
    }

    .btn:hover:not(:disabled) {
      background: var(--accent-hover);
      border-color: var(--accent-hover);
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

    /* Chat */
    .chat-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-height: 0;
    }

    .chat-header-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 8px;
    }

    .clear-btn {
      padding: 4px 14px;
      border: 1px solid var(--border);
      background: var(--bg);
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      font-family: var(--mono);
    }

    .clear-btn:hover {
      border-color: var(--danger, #e74c3c);
      color: var(--danger, #e74c3c);
    }

    .chat-messages {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }

    .chat-msg {
      margin-bottom: 16px;
      line-height: 1.6;
    }

    .chat-msg .role {
      font-weight: bold;
      font-size: 13px;
      color: var(--muted-strong);
      margin-bottom: 2px;
    }

    .chat-msg.user .role { color: var(--text-strong); }
    .chat-msg.assistant .role { color: var(--accent); }

    .typing-indicator {
      display: flex;
      gap: 4px;
      padding: 4px 0;
    }
    .typing-indicator span {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--muted-strong);
      animation: typing-bounce 1.2s ease-in-out infinite;
    }
    .typing-indicator span:nth-child(2) { animation-delay: 0.2s; }
    .typing-indicator span:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typing-bounce {
      0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-4px); }
    }

    .chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid var(--border);
      padding-top: 12px;
      padding-bottom: 16px;
    }

    .chat-input {
      flex: 1;
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 14px;
      font-family: inherit;
      line-height: 1.5;
      resize: none;
      overflow-y: hidden;
      min-height: 38px;
      max-height: 200px;
      box-sizing: border-box;
    }

    .chat-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .chat-send-btn {
      margin-top: 0;
      height: 38px;
      align-self: flex-end;
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
      padding: 8px 12px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 13px;
      font-family: var(--font-body);
      margin-bottom: 12px;
    }

    .plugin-search::placeholder {
      color: var(--muted);
    }

    /* Plugin list container - scrollable wrapper */
    .plugins-scroll-container {
      overflow-y: auto;
      max-height: calc(100vh - 380px);
      margin-top: 16px;
    }

    /* Plugin list */
    .plugin-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .plugin-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border: 1px solid var(--border);
      background: var(--card);
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

    /* ── Plugin UI Design Language ─────────────────────────────────────── */

    /* Shared chevron for expand/collapse */
    .settings-chevron {
      display: inline-block;
      transition: transform 0.15s ease;
      font-size: 10px;
    }

    .settings-chevron.open {
      transform: rotate(90deg);
    }

    /* Search with clear button */
    .pc-search-wrap {
      position: relative;
      margin-bottom: 12px;
    }

    .pc-search-wrap .plugin-search {
      margin-bottom: 0;
      padding-right: 32px;
    }

    .pc-search-clear {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      background: none;
      border: none;
      color: var(--muted);
      cursor: pointer;
      font-size: 14px;
      padding: 2px 6px;
      line-height: 1;
    }

    .pc-search-clear:hover {
      color: var(--text);
    }

    .pc-summary {
      display: flex;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      margin-bottom: 14px;
      flex-wrap: wrap;
      align-items: center;
    }

    .pc-summary strong {
      color: var(--text);
    }

    .pc-summary-sep {
      color: var(--muted);
      opacity: 0.5;
    }

    .pc-filters {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }

    .pc-filter-btn {
      padding: 3px 10px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text);
      cursor: pointer;
      font-size: 11px;
      transition: background var(--duration-fast), color var(--duration-fast);
    }

    .pc-filter-btn.active {
      background: var(--accent);
      color: var(--accent-foreground);
      border-color: var(--accent);
    }

    .pc-filter-btn:hover:not(.active) {
      background: var(--bg-hover);
    }

    .pc-filter-row {
      display: flex;
      gap: 4px;
      margin-bottom: 14px;
      flex-wrap: wrap;
      align-items: center;
    }

    .pc-filter-label {
      font-size: 11px;
      color: var(--muted);
      margin-right: 4px;
    }

    /* Toolbar */
    .pc-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 14px;
      flex-wrap: wrap;
    }

    .pc-toolbar-actions {
      display: flex;
      gap: 6px;
      flex-shrink: 0;
    }

    .pc-toolbar-btn {
      padding: 3px 10px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--muted);
      cursor: pointer;
      font-size: 11px;
      transition: all var(--duration-fast);
    }

    .pc-toolbar-btn:hover {
      color: var(--text);
      background: var(--bg-hover);
    }

    /* Version + deps in cards */
    .pc-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 2px;
      flex-wrap: wrap;
    }

    .pc-version {
      font-size: 10px;
      font-family: var(--mono);
      color: var(--muted);
      opacity: 0.7;
    }

    .pc-npm {
      font-size: 10px;
      font-family: var(--mono);
      color: var(--muted);
      opacity: 0.6;
    }

    .pc-deps {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .pc-dep-tag {
      font-size: 9px;
      padding: 1px 5px;
      border: 1px solid var(--border);
      background: var(--accent-subtle);
      color: var(--muted);
      letter-spacing: 0.2px;
    }

    .pc-dep-label {
      font-size: 9px;
      color: var(--muted);
      opacity: 0.7;
    }

    /* Hidden file input for import */
    .pc-file-input {
      display: none;
    }

    .pc-empty {
      text-align: center;
      padding: 40px 20px;
      color: var(--muted);
      border: 1px dashed var(--border);
    }

    .pc-list {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    /* Plugin card */

    .pc-card {
      border: 1px solid var(--border);
      background: var(--card);
      transition: background var(--duration-fast);
    }

    .pc-card.pc-enabled {
      border-left: 3px solid var(--accent);
    }

    .pc-card.pc-needs-config {
      border-left-color: var(--warn);
    }

    .pc-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 14px 18px;
      cursor: pointer;
      gap: 12px;
    }

    .pc-header:hover {
      background: var(--bg-hover);
    }

    .pc-info {
      flex: 1;
      min-width: 0;
    }

    .pc-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }

    .pc-name {
      font-weight: 700;
      font-size: 14px;
    }

    .pc-badge {
      font-size: 10px;
      padding: 1px 6px;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--muted);
      text-transform: lowercase;
      letter-spacing: 0.3px;
      white-space: nowrap;
    }

    .pc-badge-warn {
      color: var(--warn);
      border-color: var(--warn);
      background: var(--warn-subtle);
    }

    .pc-desc {
      font-size: 12px;
      color: var(--muted);
      margin-top: 3px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .pc-controls {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }

    /* Progress bar */

    .pc-progress {
      width: 52px;
      height: 5px;
      background: var(--surface);
      border: 1px solid var(--border);
      overflow: hidden;
    }

    .pc-progress-fill {
      height: 100%;
      background: var(--accent);
      transition: width var(--duration-normal);
    }

    /* Toggle switch */

    .pc-toggle {
      position: relative;
      display: inline-flex;
      cursor: pointer;
    }

    .pc-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    .pc-toggle-track {
      width: 36px;
      height: 18px;
      background: var(--muted);
      position: relative;
      transition: background var(--duration-fast);
    }

    .pc-toggle-track.on {
      background: var(--accent);
    }

    .pc-toggle-thumb {
      position: absolute;
      width: 14px;
      height: 14px;
      background: #fff;
      top: 2px;
      left: 2px;
      transition: left var(--duration-fast);
    }

    .pc-toggle-track.on .pc-toggle-thumb {
      left: 20px;
    }

    /* Settings bar */

    .pc-settings-bar {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 18px 10px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }

    .pc-settings-bar:hover {
      opacity: 0.8;
    }

    /* Status dots */

    .pc-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .pc-dot.set {
      background: var(--ok);
    }

    .pc-dot.missing {
      background: var(--destructive);
    }

    .pc-dot.req-missing {
      background: var(--destructive);
    }

    .pc-dot.opt-missing {
      background: var(--muted);
    }

    /* Settings panel */

    .pc-settings {
      border-top: 1px solid var(--border);
      padding: 18px;
      background: var(--surface);
      animation: pc-slide-in var(--duration-normal) ease;
    }

    @keyframes pc-slide-in {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Individual field */

    .pc-field {
      margin-bottom: 16px;
    }

    .pc-field-label {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      margin-bottom: 4px;
    }

    .pc-field-req {
      font-size: 10px;
      color: var(--destructive);
      font-weight: 400;
    }

    .pc-field-set {
      font-size: 10px;
      color: var(--ok);
      font-weight: 400;
    }

    .pc-field-env {
      font-family: var(--mono);
      font-size: 10px;
      color: var(--muted);
      margin-bottom: 5px;
    }

    .pc-field-env code {
      background: var(--bg-hover);
      padding: 1px 4px;
      border: 1px solid var(--border);
    }

    .pc-field-help {
      font-size: 11px;
      color: var(--muted);
      margin-top: 4px;
      line-height: 1.5;
    }

    .pc-input {
      width: 100%;
      padding: 7px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 13px;
      font-family: var(--mono);
      transition: border-color var(--duration-fast);
      box-sizing: border-box;
    }

    .pc-input:focus {
      border-color: var(--accent);
      outline: none;
    }

    .pc-input::placeholder {
      color: var(--muted);
      font-family: var(--font-body);
      font-style: italic;
    }

    /* Password field */

    .pc-password-wrap {
      display: flex;
      gap: 0;
    }

    .pc-password-wrap .pc-input {
      flex: 1;
      border-right: none;
    }

    .pc-password-btn {
      padding: 7px 12px;
      border: 1px solid var(--border);
      background: var(--bg-hover);
      cursor: pointer;
      font-size: 11px;
      color: var(--muted);
      white-space: nowrap;
      min-width: 48px;
      text-align: center;
      transition: background var(--duration-fast);
    }

    .pc-password-btn:hover {
      background: var(--surface);
      color: var(--text);
    }

    /* Boolean toggle in fields */

    .pc-bool-toggle {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .pc-bool-toggle input {
      opacity: 0;
      width: 0;
      height: 0;
      position: absolute;
    }

    .pc-bool-label {
      font-size: 12px;
      color: var(--muted);
    }

    /* Advanced section */

    .pc-advanced-toggle {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: var(--muted);
      cursor: pointer;
      padding: 8px 0;
      margin: 4px 0 8px;
      border-top: 1px dashed var(--border);
      user-select: none;
    }

    .pc-advanced-toggle:hover {
      color: var(--text);
    }

    /* Actions */

    .pc-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
    }

    .pc-btn-secondary {
      background: transparent;
      border: 1px solid var(--border);
      color: var(--muted);
      cursor: pointer;
      font-size: 12px;
      padding: 5px 16px;
    }

    .pc-btn-secondary:hover {
      color: var(--text);
      background: var(--bg-hover);
    }

    /* Validation */

    .pc-validation {
      padding: 8px 18px;
      border-top: 1px solid var(--destructive);
      background: rgba(153, 27, 27, 0.04);
      font-size: 12px;
    }

    .pc-validation-item {
      color: var(--destructive);
      margin-bottom: 2px;
    }

    .pc-warning {
      color: var(--warn);
      font-size: 11px;
    }

    /* Save success flash */

    .pc-btn-success {
      background: var(--ok) !important;
      color: #fff !important;
      border-color: var(--ok) !important;
    }

    /* Logs */
    .logs-container {
      font-family: var(--mono);
      font-size: 12px;
      max-height: 600px;
      overflow-y: auto;
      border: 1px solid var(--border);
      padding: 8px;
      background: var(--card);
    }

    .log-entry {
      padding: 2px 0;
      border-bottom: 1px solid var(--bg-muted);
    }

    .log-filters {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
      align-items: center;
    }

    .log-filters select {
      font-size: 12px;
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--card);
      color: var(--fg);
    }

    .log-tag-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
    }

    .log-tag-pill {
      font-size: 11px;
      padding: 2px 10px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg-muted);
      color: var(--muted);
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }

    .log-tag-pill:hover {
      border-color: var(--accent);
      color: var(--fg);
    }

    .log-tag-pill[data-active] {
      background: var(--accent);
      color: #fff;
      border-color: var(--accent);
    }

    .log-tag-badge {
      display: inline-block;
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      background: var(--bg-muted);
      color: var(--muted);
      margin-right: 2px;
      font-family: var(--font-sans, sans-serif);
    }

    .log-tag-badge[data-tag="agent"] {
      background: rgba(99, 102, 241, 0.15);
      color: rgb(99, 102, 241);
    }
    .log-tag-badge[data-tag="server"] {
      background: rgba(34, 197, 94, 0.15);
      color: rgb(34, 197, 94);
    }
    .log-tag-badge[data-tag="system"] {
      background: rgba(156, 163, 175, 0.15);
      color: rgb(156, 163, 175);
    }
    .log-tag-badge[data-tag="cloud"] {
      background: rgba(59, 130, 246, 0.15);
      color: rgb(59, 130, 246);
    }
    .log-tag-badge[data-tag="plugins"] {
      background: rgba(168, 85, 247, 0.15);
      color: rgb(168, 85, 247);
    }
    .log-tag-badge[data-tag="autonomy"] {
      background: rgba(245, 158, 11, 0.15);
      color: rgb(245, 158, 11);
    }
    .log-tag-badge[data-tag="websocket"] {
      background: rgba(20, 184, 166, 0.15);
      color: rgb(20, 184, 166);
    }

    .empty-state {
      text-align: center;
      padding: 40px;
      color: var(--muted);
      font-style: italic;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.initializeTheme();
    this.initializeApp();
    window.addEventListener("popstate", this.handlePopState);
    window.addEventListener("keydown", this.handleGlobalKeydown);
    document.addEventListener("milaidy:command-palette", this.handleExternalCommandPalette);
    document.addEventListener("milaidy:tray-action", this.handleExternalTrayAction);
    document.addEventListener("milaidy:share-target", this.handleExternalShareTarget);
    document.addEventListener("milaidy:app-resume", this.handleAppResume);

    // Acknowledge WIP methods pending template integration.
    // Remove entries below as each gets wired into render templates.
    void [
      this.handleSaveSkillsMarketplaceApiKey,
      this.uninstallMarketplaceSkill,
      this.reprioritizeGoal,
      this.reprioritizeTodo,
      this.toggleTodoUrgent,
      this.searchMcpMarketplace,
      this.addMcpFromMarketplace,
      this.confirmMcpAdd,
      this.addMcpManual,
      this.removeMcpServer,
      this.handleOpenExtensionsPage,
      this._renderWorkbenchLegacy,
    ];
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
    window.removeEventListener("keydown", this.handleGlobalKeydown);
    document.removeEventListener("milaidy:command-palette", this.handleExternalCommandPalette);
    document.removeEventListener("milaidy:tray-action", this.handleExternalTrayAction);
    document.removeEventListener("milaidy:share-target", this.handleExternalShareTarget);
    document.removeEventListener("milaidy:app-resume", this.handleAppResume);
    void this.teardownNativeBindings();
    if (this.cloudPollInterval) clearInterval(this.cloudPollInterval);
    client.disconnectWs();
  }

  private handlePopState = (): void => {
    const tab = tabFromPath(window.location.pathname);
    if (tab) this.tab = tab;
  };

  private async initializeApp(): Promise<void> {
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

    // Load conversations (select latest on refresh) and workbench data
    void this.loadConversations().then(() => {
      if (!this.activeConversationId && this.conversations.length > 0) {
        const latest = this.conversations[0];
        this.activeConversationId = latest.id;
        void this.loadConversationMessages(latest.id);
      }
    });
    void this.loadWorkbench();

    // Connect WebSocket
    client.connectWs();
    client.onWsEvent("status", (data) => {
      this.agentStatus = data as unknown as AgentStatus;
    });
    // Chat is handled via the REST POST /api/chat endpoint (see
    // handleChatSend).  WebSocket is kept for status events only.

    // Load initial status
    try {
      this.agentStatus = await client.getStatus();
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


    // Initialize native platform integrations (Electron shortcuts, tray, etc.)
    void this.initializeNativeLayer();
    this.consumePendingShareQueue();

    // Pre-load marketplace state
    void this.loadSkillsMarketplaceConfig();
    void this.loadInstalledMarketplaceSkills();

    // Load cloud credit status and start polling
    this.pollCloudCredits();
    this.cloudPollInterval = window.setInterval(() => this.pollCloudCredits(), 60_000);
    // Load tab from URL and trigger data loading for it
    const tab = tabFromPath(window.location.pathname);
    if (tab) {
      this.tab = tab;
      if (tab === "inventory") this.loadInventory();
      if (tab === "plugins") this.loadPlugins();
      if (tab === "skills") this.loadSkills();
      if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); this.loadCharacter(); this.loadUpdateStatus(); }
      if (tab === "logs") this.loadLogs();
    }
  }

  private setTab(tab: Tab): void {
    this.tab = tab;
    const path = pathForTab(tab);
    window.history.pushState(null, "", path);

    // Load data for the tab
    if (tab === "inventory") this.loadInventory();
    if (tab === "plugins") this.loadPlugins();
    if (tab === "skills") this.loadSkills();
    if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); this.loadCharacter(); this.loadUpdateStatus(); }
    if (tab === "logs") this.loadLogs();
  }

  private async loadUpdateStatus(force = false): Promise<void> {
    this.updateLoading = true;
    try {
      this.updateStatus = await client.getUpdateStatus(force);
    } catch { /* ignore — server may not support this endpoint yet */ }
    this.updateLoading = false;
  }

  private async handleChannelChange(channel: ReleaseChannel): Promise<void> {
    if (this.updateStatus?.channel === channel) return;
    this.updateChannelSaving = true;
    try {
      await client.setUpdateChannel(channel);
      await this.loadUpdateStatus(true);
    } catch { /* ignore */ }
    this.updateChannelSaving = false;
  }

  private async loadPlugins(): Promise<void> {
    try {
      const { plugins } = await client.getPlugins();
      this.plugins = plugins;
    } catch { /* ignore */ }
  }

  private async loadSkills(): Promise<void> {
    try {
      const { skills } = await client.getSkills();
      this.skills = skills;
    } catch { /* ignore */ }
  }

  private async refreshSkills(): Promise<void> {
    try {
      const { skills } = await client.refreshSkills();
      this.skills = skills;
    } catch {
      // Fall back to a normal load if refresh endpoint not available
      await this.loadSkills();
    }
  }

  private async searchSkillsMarketplace(): Promise<void> {
    const query = this.skillsMarketplaceQuery.trim();
    if (!query) {
      this.skillsMarketplaceResults = [];
      this.skillsMarketplaceError = "";
      return;
    }

    this.skillsMarketplaceLoading = true;
    this.skillsMarketplaceError = "";
    try {
      const { results } = await client.searchSkillsMarketplace(query, false, 20);
      this.skillsMarketplaceResults = results;
    } catch (err) {
      this.skillsMarketplaceResults = [];
      const message = err instanceof Error ? err.message : "unknown error";
      this.skillsMarketplaceError = message;
      this.setActionNotice(`Skill search failed: ${message}`, "error", 4200);
    } finally {
      this.skillsMarketplaceLoading = false;
    }
  }

  private async loadSkillsMarketplaceConfig(): Promise<void> {
    try {
      const { keySet } = await client.getSkillsMarketplaceConfig();
      this.skillsMarketplaceApiKeySet = keySet;
    } catch {
      this.skillsMarketplaceApiKeySet = false;
    }
  }

  private async handleSaveSkillsMarketplaceApiKey(): Promise<void> {
    const apiKey = this.skillsMarketplaceApiKeyInput.trim();
    if (!apiKey) return;

    this.skillsMarketplaceApiKeySaving = true;
    try {
      const { keySet } = await client.updateSkillsMarketplaceConfig(apiKey);
      this.skillsMarketplaceApiKeySet = keySet;
      this.skillsMarketplaceApiKeyInput = "";
      this.setActionNotice("Skills Marketplace API key saved.", "success");
    } catch (err) {
      this.setActionNotice(`Failed to save API key: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceApiKeySaving = false;
    }
  }


  private async installSkillFromMarketplace(item: SkillMarketplaceResult): Promise<void> {
    this.skillsMarketplaceAction = `install:${item.id}`;
    try {
      await client.installMarketplaceSkill({
        githubUrl: item.githubUrl,
        repository: item.repository,
        path: item.path ?? undefined,
        name: item.name,
        description: item.description,
        source: "skillsmp",
        autoRefresh: true,
      });
      await this.refreshSkills();
      this.setActionNotice(`Installed skill: ${item.name}`, "success");
    } catch (err) {
      this.setActionNotice(`Skill install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async installSkillFromGithubUrl(): Promise<void> {
    const githubUrl = this.skillsMarketplaceManualGithubUrl.trim();
    if (!githubUrl) return;

    this.skillsMarketplaceAction = "install:manual";
    try {
      let repository: string | undefined;
      let skillPath: string | undefined;
      let inferredName: string | undefined;
      try {
        const parsed = new URL(githubUrl);
        if (parsed.hostname === "github.com") {
          const parts = parsed.pathname.split("/").filter(Boolean);
          if (parts.length >= 2) {
            repository = `${parts[0]}/${parts[1]}`;
          }
          if (parts[2] === "tree" && parts.length >= 5) {
            skillPath = parts.slice(4).join("/");
            inferredName = parts[parts.length - 1];
          }
        }
      } catch {
        // Keep raw URL fallback handling on backend.
      }

      await client.installMarketplaceSkill({
        githubUrl,
        repository,
        path: skillPath,
        name: inferredName,
        source: "manual",
        autoRefresh: true,
      });
      this.skillsMarketplaceManualGithubUrl = "";
      await this.refreshSkills();
      this.setActionNotice("Skill installed from GitHub URL.", "success");
    } catch (err) {
      this.setActionNotice(`GitHub install failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async uninstallMarketplaceSkill(skillId: string, name: string): Promise<void> {
    this.skillsMarketplaceAction = `uninstall:${skillId}`;
    try {
      await client.uninstallMarketplaceSkill(skillId, true);
      await this.refreshSkills();
      this.setActionNotice(`Uninstalled skill: ${name}`, "success");
    } catch (err) {
      this.setActionNotice(`Skill uninstall failed: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillsMarketplaceAction = "";
    }
  }

  private async handleSkillToggle(skillId: string, enabled: boolean): Promise<void> {
    this.skillToggleAction = skillId;
    try {
      const { skill } = await client.updateSkill(skillId, enabled);
      const next = this.skills.map((entry) => (entry.id === skillId ? { ...entry, enabled: skill.enabled } : entry));
      this.skills = next;
      this.setActionNotice(`${skill.name} ${skill.enabled ? "enabled" : "disabled"}.`, "success");
    } catch (err) {
      this.setActionNotice(`Failed to update skill: ${err instanceof Error ? err.message : "unknown error"}`, "error", 4200);
    } finally {
      this.skillToggleAction = "";
    }
  }

  private getDesktopPlugin(): Record<string, (...args: unknown[]) => Promise<unknown>> | null {
    const bridge = (window as unknown as { Milaidy?: { pluginCapabilities?: { desktop?: { available?: boolean } }; plugins?: { desktop?: { plugin?: unknown } } } }).Milaidy;
    const available = Boolean(bridge?.pluginCapabilities?.desktop?.available);
    if (!available) return null;
    const plugin = bridge?.plugins?.desktop?.plugin;
    if (!plugin || typeof plugin !== "object") return null;
    return plugin as Record<string, (...args: unknown[]) => Promise<unknown>>;
  }

  private pushNativeEvent(message: string): void {
    const stamp = new Date().toLocaleTimeString();
    this.nativeEvents = [`${stamp} ${message}`, ...this.nativeEvents].slice(0, 8);
  }

  private setActionNotice(
    text: string,
    tone: "info" | "success" | "error" = "info",
    ttlMs = 2800,
  ): void {
    this.actionNotice = { tone, text };
    if (this.actionNoticeTimer != null) {
      window.clearTimeout(this.actionNoticeTimer);
      this.actionNoticeTimer = null;
    }
    this.actionNoticeTimer = window.setTimeout(() => {
      this.actionNotice = null;
      this.actionNoticeTimer = null;
    }, ttlMs);
  }

  private lifecycleTrayActionLabel(): string {
    const state = this.agentStatus?.state ?? "not_started";
    if (state === "running") return "Pause Agent";
    if (state === "paused") return "Resume Agent";
    return "Start Agent";
  }

  private async initializeNativeLayer(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    this.nativeDesktopAvailable = Boolean(desktop);
    if (!desktop) return;

    try {
      const isRegistered = await desktop.isShortcutRegistered?.({ accelerator: "CommandOrControl+K" }) as { registered: boolean } | undefined;
      if (!isRegistered?.registered) {
        const registered = await desktop.registerShortcut?.({
          id: "command-palette",
          accelerator: "CommandOrControl+K",
        }) as { success: boolean } | undefined;
        this.nativeShortcutEnabled = Boolean(registered?.success);
      } else {
        this.nativeShortcutEnabled = true;
      }

      const shortcutListener = await desktop.addListener?.("shortcutPressed", (event: { id: string }) => {
        if (event.id === "command-palette") this.openCommandPalette();
      }) as { remove: () => Promise<void> } | undefined;
      if (shortcutListener) this.nativeListenerHandles.push(shortcutListener);

      const trayClickListener = await desktop.addListener?.("trayMenuClick", (event: { itemId: string }) => {
        this.handleTrayMenuAction(event.itemId);
      }) as { remove: () => Promise<void> } | undefined;
      if (trayClickListener) this.nativeListenerHandles.push(trayClickListener);

      const notificationActionListener = await desktop.addListener?.("notificationAction", (event: { action?: string }) => {
        const action = event.action ?? "";
        if (action.toLowerCase().includes("pause")) {
          void this.handlePauseResume();
        }
        if (action.toLowerCase().includes("workbench")) {
          this.setTab("chat");
          void this.loadWorkbench();
        }
      }) as { remove: () => Promise<void> } | undefined;
      if (notificationActionListener) this.nativeListenerHandles.push(notificationActionListener);

      await this.configureNativeTrayMenu();
    } catch (err) {
      this.pushNativeEvent(`Native init failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private async teardownNativeBindings(): Promise<void> {
    for (const handle of this.nativeListenerHandles) {
      try {
        await handle.remove();
      } catch {
        // ignore cleanup errors
      }
    }
    this.nativeListenerHandles = [];
  }

  private async configureNativeTrayMenu(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    if (!desktop) return;
    try {
      const lifecycleLabel = this.lifecycleTrayActionLabel();
      await desktop.setTrayMenu?.({
        menu: [
          { id: "tray-open-chat", label: "Open Chat" },
          { id: "tray-open-workbench", label: "Open Workbench" },
          { id: "tray-toggle-pause", label: lifecycleLabel },
          { id: "tray-restart", label: "Restart Agent" },
          { id: "tray-notify", label: "Send Test Notification" },
          { id: "tray-sep-1", type: "separator" },
          { id: "tray-show-window", label: "Show Window" },
          { id: "tray-hide-window", label: "Hide Window" },
        ],
      });
      this.nativeTrayEnabled = true;
      this.pushNativeEvent("Tray menu configured");
    } catch (err) {
      this.pushNativeEvent(`Tray setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleTrayMenuAction(itemId: string): void {
    switch (itemId) {
      case "tray-open-chat":
        this.setTab("chat");
        break;
      case "tray-open-workbench":
        this.setTab("chat");
        void this.loadWorkbench();
        break;
      case "tray-toggle-pause":
        void this.handlePauseResume();
        break;
      case "tray-restart":
        void this.handleRestart();
        break;
      case "tray-notify":
        void this.sendNativeNotification();
        break;
      case "tray-show-window":
        void this.getDesktopPlugin()?.showWindow?.();
        break;
      case "tray-hide-window":
        void this.getDesktopPlugin()?.hideWindow?.();
        break;
      default:
        break;
    }
  }

  private async sendNativeNotification(): Promise<void> {
    const desktop = this.getDesktopPlugin();
    if (!desktop) return;
    try {
      await desktop.showNotification?.({
        title: "Milaidy",
        body: "Agent control actions are available from this notification.",
        actions: [
          { type: "button", text: "Open Workbench" },
          { type: "button", text: "Pause Agent" },
        ],
      });
      this.pushNativeEvent("Notification sent");
    } catch (err) {
      this.pushNativeEvent(`Notification failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  private handleExternalCommandPalette = (): void => {
    this.openCommandPalette();
  };

  private handleExternalTrayAction = (event: Event): void => {
    const detail = (event as CustomEvent<{ itemId?: string }>).detail;
    if (detail?.itemId) {
      this.handleTrayMenuAction(detail.itemId);
    }
  };

  private handleExternalShareTarget = (event: Event): void => {
    const detail = (event as CustomEvent<ShareIngestPayload>).detail;
    if (!detail) return;
    void this.ingestSharePayload(detail);
  };

  private handleAppResume = (): void => {
    void this.pullShareIngest();
  };

  private consumePendingShareQueue(): void {
    const global = window as unknown as { __MILAIDY_SHARE_QUEUE__?: ShareIngestPayload[] };
    const queue = Array.isArray(global.__MILAIDY_SHARE_QUEUE__) ? [...global.__MILAIDY_SHARE_QUEUE__] : [];
    global.__MILAIDY_SHARE_QUEUE__ = [];
    for (const payload of queue) {
      void this.ingestSharePayload(payload);
    }
  }

  private applySharePrompt(prompt: string, files: Array<{ name: string }>): void {
    if (!prompt.trim()) return;
    this.chatInput = `${this.chatInput.trim()}\n\n${prompt}`.trim();
    this.droppedFiles = files.map((file) => file.name);
    this.shareIngestNotice = `Share ingested (${files.length} file${files.length === 1 ? "" : "s"})`;
    this.setTab("chat");
    this.requestUpdate();
    if (this.shareIngestTimer != null) clearTimeout(this.shareIngestTimer);
    this.shareIngestTimer = window.setTimeout(() => {
      this.shareIngestNotice = "";
      this.shareIngestTimer = null;
    }, 5000);
  }

  private async ingestSharePayload(payload: ShareIngestPayload): Promise<void> {
    try {
      const result = await client.ingestShare(payload);
      const consumed = await client.consumeShareIngest().catch(() => null);
      if (consumed?.items && consumed.items.length > 0) {
        const latest = consumed.items[consumed.items.length - 1];
        this.applySharePrompt(latest.suggestedPrompt, latest.files);
      } else {
        this.applySharePrompt(result.item.suggestedPrompt, result.item.files);
      }
    } catch {
      const fileNames = (payload.files ?? []).map((file) => file.name).filter(Boolean);
      const lines: string[] = [];
      lines.push("Shared content:");
      if (payload.title) lines.push(`Title: ${payload.title}`);
      if (payload.url) lines.push(`URL: ${payload.url}`);
      if (payload.text) lines.push(payload.text);
      if (fileNames.length > 0) {
        lines.push("Files:");
        for (const fileName of fileNames) lines.push(`- ${fileName}`);
      }
      this.applySharePrompt(lines.join("\n"), fileNames.map((name) => ({ name })));
    }
  }

  private async pullShareIngest(): Promise<void> {
    try {
      const inbox = await client.consumeShareIngest();
      if (!Array.isArray(inbox.items) || inbox.items.length === 0) return;
      const latest = inbox.items[inbox.items.length - 1] as ShareIngestItem;
      this.applySharePrompt(latest.suggestedPrompt, latest.files);
    } catch {
      // Endpoint may be unavailable in older runtimes.
    }
  }

  private handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (this.commandPaletteOpen) {
      const items = this.filteredCommandItems();
      if (event.key === "Escape") {
        event.preventDefault();
        this.closeCommandPalette();
        return;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        if (items.length > 0) this.commandActiveIndex = (this.commandActiveIndex + 1) % items.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        if (items.length > 0) this.commandActiveIndex = (this.commandActiveIndex - 1 + items.length) % items.length;
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        const selected = items[this.commandActiveIndex] ?? items[0];
        if (selected) void this.executeCommand(selected.id);
        return;
      }
    }

    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      this.openCommandPalette();
      return;
    }
  };

  private openCommandPalette(): void {
    this.commandQuery = "";
    this.commandActiveIndex = 0;
    this.commandPaletteOpen = true;
    window.setTimeout(() => {
      const input = this.shadowRoot?.querySelector<HTMLInputElement>("[data-command-input]");
      input?.focus();
      input?.select();
    }, 0);
  }

  private closeCommandPalette(): void {
    this.commandPaletteOpen = false;
  }

  private async executeCommand(commandId: string): Promise<void> {
    this.closeCommandPalette();
    switch (commandId) {
      case "agent-start":
        await this.handleStart();
        break;
      case "agent-toggle-pause":
        await this.handlePauseResume();
        break;
      case "agent-stop":
        await this.handleStop();
        break;
      case "agent-restart":
        await this.handleRestart();
        break;
      case "open-chat":
        this.setTab("chat");
        break;
      case "open-workbench":
        this.setTab("chat");
        await this.loadWorkbench();
        break;
      case "open-inventory":
        this.setTab("inventory");
        await this.loadInventory();
        break;
      case "open-marketplace":
        this.setTab("apps");
        break;
      case "open-plugins":
        this.setTab("plugins");
        await this.loadPlugins();
        break;
      case "open-skills":
        this.setTab("skills");
        await this.loadSkills();
        break;
      case "open-config":
        this.setTab("config");
        await this.loadWalletConfig();
        await this.loadCharacter();
        break;
      case "open-logs":
        this.setTab("logs");
        await this.loadLogs();
        break;
      case "refresh-marketplace":
        this.setTab("apps");
        break;
      case "refresh-workbench":
        await this.loadWorkbench();
        break;
      case "refresh-plugins":
        await this.loadPlugins();
        break;
      case "refresh-skills":
        await this.refreshSkills();
        break;
      case "refresh-logs":
        await this.loadLogs();
        break;
      case "chat-clear":
        this.handleChatClear();
        break;
      case "native-notify":
        await this.sendNativeNotification();
        break;
      case "native-tray":
        await this.configureNativeTrayMenu();
        break;
      default:
        break;
    }
  }

  private commandItems(): Array<{ id: string; label: string; hint: string }> {
    const state = this.agentStatus?.state ?? "not_started";
    return [
      { id: "agent-start", label: "Start Agent", hint: "Lifecycle" },
      { id: "agent-toggle-pause", label: state === "running" ? "Pause Agent" : "Resume Agent", hint: "Lifecycle" },
      { id: "agent-stop", label: "Stop Agent", hint: "Lifecycle" },
      { id: "agent-restart", label: "Restart Agent", hint: "Lifecycle" },
      { id: "open-chat", label: "Open Chat", hint: "Navigation" },
      { id: "open-workbench", label: "Open Goals & Tasks", hint: "Navigation" },
      { id: "open-inventory", label: "Open Inventory", hint: "Navigation" },
      { id: "open-marketplace", label: "Open Apps & Plugins", hint: "Navigation" },
      { id: "open-plugins", label: "Open Plugins", hint: "Navigation" },
      { id: "open-skills", label: "Open Skills", hint: "Navigation" },
      { id: "open-config", label: "Open Config", hint: "Navigation" },
      { id: "open-logs", label: "Open Logs", hint: "Navigation" },
      { id: "refresh-workbench", label: "Refresh Workbench", hint: "Data" },
      { id: "refresh-marketplace", label: "Refresh Apps & Plugins", hint: "Data" },
      { id: "refresh-plugins", label: "Refresh Plugins", hint: "Data" },
      { id: "refresh-skills", label: "Refresh Skills", hint: "Data" },
      { id: "refresh-logs", label: "Refresh Logs", hint: "Data" },
      { id: "chat-clear", label: "Clear Chat Transcript", hint: "Chat" },
      { id: "native-tray", label: "Configure Tray Menu", hint: "Native" },
      { id: "native-notify", label: "Send Native Notification", hint: "Native" },
    ];
  }

  private filteredCommandItems(): Array<{ id: string; label: string; hint: string }> {
    const q = this.commandQuery.trim().toLowerCase();
    const items = !q
      ? this.commandItems()
      : this.commandItems().filter((item) => (
        item.label.toLowerCase().includes(q) || item.hint.toLowerCase().includes(q) || item.id.includes(q)
      ));
    if (items.length === 0) {
      this.commandActiveIndex = 0;
    } else if (this.commandActiveIndex >= items.length) {
      this.commandActiveIndex = items.length - 1;
    } else if (this.commandActiveIndex < 0) {
      this.commandActiveIndex = 0;
    }
    return items;
  }

  private async loadWorkbench(): Promise<void> {
    this.workbenchLoading = true;
    try {
      const result = await client.getWorkbenchOverview();
      this.workbench = result;
      this.workbenchGoalsAvailable = result.goalsAvailable ?? false;
      this.workbenchTodosAvailable = result.todosAvailable ?? false;
    } catch {
      this.workbench = null;
      this.workbenchGoalsAvailable = false;
      this.workbenchTodosAvailable = false;
    } finally {
      this.workbenchLoading = false;
    }
  }

  private goalPriority(goal: WorkbenchGoal): number | null {
    const raw = goal.metadata?.priority;
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    return null;
  }

  private workbenchGoalSorted(goals: WorkbenchGoal[]): WorkbenchGoal[] {
    return [...goals].sort((a, b) => {
      const aPriority = this.goalPriority(a) ?? 3;
      const bPriority = this.goalPriority(b) ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      return a.name.localeCompare(b.name);
    });
  }

  private workbenchTodoSorted(todos: WorkbenchTodo[]): WorkbenchTodo[] {
    return [...todos].sort((a, b) => {
      const aPriority = a.priority ?? 3;
      const bPriority = b.priority ?? 3;
      if (aPriority !== bPriority) return aPriority - bPriority;
      if (a.isUrgent !== b.isUrgent) return a.isUrgent ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }

  private resetWorkbenchGoalForm(): void {
    this.workbenchEditingGoalId = null;
    this.workbenchGoalName = "";
    this.workbenchGoalDescription = "";
    this.workbenchGoalTags = "";
    this.workbenchGoalPriority = "3";
  }

  private startWorkbenchGoalEdit(goal: WorkbenchGoal): void {
    this.workbenchEditingGoalId = goal.id;
    this.workbenchGoalName = goal.name;
    this.workbenchGoalDescription = goal.description ?? "";
    this.workbenchGoalTags = goal.tags.join(", ");
    this.workbenchGoalPriority = String(this.goalPriority(goal) ?? 3);
  }

  private async submitWorkbenchGoalForm(): Promise<void> {
    const name = this.workbenchGoalName.trim();
    if (!name) return;
    const description = this.workbenchGoalDescription.trim();
    const tags = this.workbenchGoalTags
      .split(",")
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => tag.length > 0);
    const priority = Number.parseInt(this.workbenchGoalPriority, 10);
    const normalizedPriority = Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3;

    try {
      if (this.workbenchEditingGoalId) {
        await client.updateWorkbenchGoal(this.workbenchEditingGoalId, {
          name,
          description,
          tags,
          priority: normalizedPriority,
        });
      } else {
        await client.createWorkbenchGoal({
          name,
          description,
          tags,
          priority: normalizedPriority,
        });
      }
      this.resetWorkbenchGoalForm();
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async reprioritizeGoal(goalId: string, nextPriority: number): Promise<void> {
    try {
      await client.updateWorkbenchGoal(goalId, { priority: nextPriority });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleWorkbenchGoal(goalId: string, isCompleted: boolean): Promise<void> {
    try {
      await client.setWorkbenchGoalCompleted(goalId, isCompleted);
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleWorkbenchTodo(todoId: string, isCompleted: boolean): Promise<void> {
    try {
      await client.setWorkbenchTodoCompleted(todoId, isCompleted);
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async reprioritizeTodo(todoId: string, nextPriority: number): Promise<void> {
    try {
      await client.updateWorkbenchTodo(todoId, { priority: nextPriority });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async toggleTodoUrgent(todoId: string, isUrgent: boolean): Promise<void> {
    try {
      await client.updateWorkbenchTodo(todoId, { isUrgent });
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async createWorkbenchTodoQuick(): Promise<void> {
    const name = this.workbenchTodoName.trim();
    if (!name) return;
    const description = this.workbenchTodoDescription.trim();
    const priority = Number.parseInt(this.workbenchTodoPriority, 10);
    const normalizedPriority = Number.isFinite(priority) ? Math.max(1, Math.min(5, priority)) : 3;

    try {
      await client.createWorkbenchTodo({
        name,
        description,
        priority: normalizedPriority,
        isUrgent: this.workbenchTodoUrgent,
        type: "one-off",
      });
      this.workbenchTodoName = "";
      this.workbenchTodoDescription = "";
      this.workbenchTodoPriority = "3";
      this.workbenchTodoUrgent = false;
      await this.loadWorkbench();
    } catch {
      // ignore
    }
  }

  private async loadInstalledMarketplaceSkills(): Promise<void> {
    try {
      const { skills } = await client.getSkills();
      this.skills = skills;
    } catch {
      // ignore
    }
  }


  // --- MCP Marketplace ---

  private async loadMcpConfig(): Promise<void> {
    this.mcpConfigLoading = true;
    try {
      const { servers } = await client.getMcpConfig();
      this.mcpConfiguredServers = servers || {};
    } catch {
      this.mcpConfiguredServers = {};
    } finally {
      this.mcpConfigLoading = false;
    }
    void this.loadMcpStatus();
  }

  private async loadMcpStatus(): Promise<void> {
    try {
      const { servers } = await client.getMcpStatus();
      this.mcpServerStatuses = servers || [];
    } catch {
      this.mcpServerStatuses = [];
    }
  }

  private async searchMcpMarketplace(): Promise<void> {
    const query = this.mcpMarketplaceQuery.trim();
    if (!query) {
      this.mcpMarketplaceResults = [];
      return;
    }
    this.mcpMarketplaceLoading = true;
    this.mcpAction = "";
    try {
      const { results } = await client.searchMcpMarketplace(query, 30);
      this.mcpMarketplaceResults = results;
    } catch (err) {
      this.mcpMarketplaceResults = [];
      this.setActionNotice(`MCP search failed: ${err instanceof Error ? err.message : "network error"}`, "error", 3800);
    } finally {
      this.mcpMarketplaceLoading = false;
    }
  }

  private async addMcpFromMarketplace(result: McpMarketplaceResult): Promise<void> {
    this.mcpAction = `add:${result.name}`;
    try {
      // Fetch full details to check for env vars / headers
      const { server } = await client.getMcpServerDetails(result.name);

      // Check if server requires configuration
      const envVars = server.packages?.[0]?.environmentVariables || [];
      const headers = server.remotes?.[0]?.headers || [];
      const hasRequiredConfig = envVars.length > 0 || headers.length > 0;

      if (hasRequiredConfig) {
        // Show configuration form — pre-fill defaults
        const envDefaults: Record<string, string> = {};
        for (const v of envVars) {
          envDefaults[v.name] = v.default || "";
        }
        const headerDefaults: Record<string, string> = {};
        for (const h of headers) {
          headerDefaults[h.name] = "";
        }
        this.mcpAddingServer = server;
        this.mcpAddingResult = result;
        this.mcpEnvInputs = envDefaults;
        this.mcpHeaderInputs = headerDefaults;
        this.mcpAction = "";
        return;
      }

      // No config needed — add directly
      await this.addMcpServerDirect(result, server);
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      if (!this.mcpAddingServer) {
        this.mcpAction = "";
      }
    }
  }

  private async addMcpServerDirect(
    result: McpMarketplaceResult,
    server: McpRegistryServerDetail,
    envValues?: Record<string, string>,
    headerValues?: Record<string, string>,
  ): Promise<void> {
    let config: McpServerConfig;

    // Build config from full server details
    if (server.remotes && server.remotes.length > 0) {
      const remote = server.remotes[0];
      config = {
        type: (remote.type as McpServerConfig["type"]) || "streamable-http",
        url: remote.url,
      };
      if (headerValues && Object.keys(headerValues).length > 0) {
        config.headers = { ...headerValues };
      }
    } else if (result.connectionType === "stdio" && result.npmPackage) {
      config = { type: "stdio", command: "npx", args: ["-y", result.npmPackage] };
      // Append packageArguments defaults
      const pkgArgs = server.packages?.[0]?.packageArguments;
      if (pkgArgs) {
        for (const arg of pkgArgs) {
          if (arg.default) config.args!.push(arg.default);
        }
      }
      if (envValues && Object.keys(envValues).length > 0) {
        config.env = { ...envValues };
      }
    } else if (result.connectionType === "stdio" && result.dockerImage) {
      config = { type: "stdio", command: "docker", args: ["run", "-i", "--rm", result.dockerImage] };
      if (envValues && Object.keys(envValues).length > 0) {
        config.env = { ...envValues };
      }
    } else {
      this.setActionNotice("Cannot auto-configure this server. Use manual config.", "error", 4000);
      return;
    }

    const configName = result.name.includes("/") ? result.name.split("/").pop()! : result.name;
    await client.addMcpServer(configName, config);
    this.setActionNotice(`Added MCP server: ${configName}. Restarting...`, "info");
    await this.loadMcpConfig();

    // Restart agent to pick up new MCP server
    try {
      await client.restartAgent();
      this.setActionNotice(`Added MCP server: ${configName}`, "success");
      // Poll status after restart settles
      this.mcpStatusTimers.push(window.setTimeout(() => { void this.loadMcpStatus(); }, 3000));
    } catch {
      this.setActionNotice(`Added ${configName} — restart agent to activate`, "info", 5000);
    }
  }

  private async confirmMcpAdd(): Promise<void> {
    if (!this.mcpAddingServer || !this.mcpAddingResult) return;

    // Validate required env vars
    const envVars = this.mcpAddingServer.packages?.[0]?.environmentVariables || [];
    for (const v of envVars) {
      if (v.isRequired && !this.mcpEnvInputs[v.name]?.trim()) {
        this.setActionNotice(`${v.name} is required`, "error", 3000);
        return;
      }
    }

    // Validate required headers
    const headers = this.mcpAddingServer.remotes?.[0]?.headers || [];
    for (const h of headers) {
      if (h.isRequired && !this.mcpHeaderInputs[h.name]?.trim()) {
        this.setActionNotice(`${h.name} header is required`, "error", 3000);
        return;
      }
    }

    // Filter out empty values
    const envValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.mcpEnvInputs)) {
      if (v.trim()) envValues[k] = v.trim();
    }
    const headerValues: Record<string, string> = {};
    for (const [k, v] of Object.entries(this.mcpHeaderInputs)) {
      if (v.trim()) headerValues[k] = v.trim();
    }

    this.mcpAction = `add:${this.mcpAddingResult.name}`;
    try {
      await this.addMcpServerDirect(this.mcpAddingResult, this.mcpAddingServer, envValues, headerValues);
      this.cancelMcpAdd();
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  private cancelMcpAdd(): void {
    this.mcpAddingServer = null;
    this.mcpAddingResult = null;
    this.mcpEnvInputs = {};
    this.mcpHeaderInputs = {};
  }

  private async addMcpManual(): Promise<void> {
    const name = this.mcpManualName.trim();
    if (!name) {
      this.setActionNotice("Server name is required.", "error", 3000);
      return;
    }

    const config: McpServerConfig = { type: this.mcpManualType };

    if (this.mcpManualType === "stdio") {
      const cmd = this.mcpManualCommand.trim();
      if (!cmd) {
        this.setActionNotice("Command is required for stdio servers.", "error", 3000);
        return;
      }
      config.command = cmd;
      const argsStr = this.mcpManualArgs.trim();
      if (argsStr) {
        config.args = argsStr.includes("\n")
          ? argsStr.split(/\r?\n/).map((a) => a.trim()).filter(Boolean)
          : argsStr.split(/\s+/);
      }
    } else {
      const url = this.mcpManualUrl.trim();
      if (!url) {
        this.setActionNotice("URL is required for remote servers.", "error", 3000);
        return;
      }
      config.url = url;
    }

    const envPairs = this.mcpManualEnvPairs.filter((p) => p.key.trim());
    if (envPairs.length > 0) {
      config.env = {};
      for (const pair of envPairs) {
        config.env[pair.key.trim()] = pair.value;
      }
    }

    this.mcpAction = `add-manual:${name}`;
    try {
      await client.addMcpServer(name, config);
      this.setActionNotice(`Added MCP server: ${name}. Restarting...`, "info");
      await this.loadMcpConfig();
      this.mcpManualName = "";
      this.mcpManualCommand = "";
      this.mcpManualArgs = "";
      this.mcpManualUrl = "";
      this.mcpManualEnvPairs = [];
      try {
        await client.restartAgent();
        this.setActionNotice(`Added MCP server: ${name}`, "success");
        this.mcpStatusTimers.push(window.setTimeout(() => { void this.loadMcpStatus(); }, 3000));
      } catch {
        this.setActionNotice(`Added ${name} — restart agent to activate`, "info", 5000);
      }
    } catch (err) {
      this.setActionNotice(`Failed to add server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  private async removeMcpServer(name: string): Promise<void> {
    this.mcpAction = `remove:${name}`;
    try {
      await client.removeMcpServer(name);
      this.setActionNotice(`Removed MCP server: ${name}. Restarting...`, "info");
      await this.loadMcpConfig();
      try {
        await client.restartAgent();
        this.setActionNotice(`Removed MCP server: ${name}`, "success");
        this.mcpStatusTimers.push(window.setTimeout(() => { void this.loadMcpStatus(); }, 3000));
      } catch {
        this.setActionNotice(`Removed ${name} — restart agent to activate`, "info", 5000);
      }
    } catch (err) {
      this.setActionNotice(`Failed to remove server: ${err instanceof Error ? err.message : "unknown error"}`, "error", 3800);
    } finally {
      this.mcpAction = "";
    }
  }

  // --- Agent lifecycle ---

  private async handleStart(): Promise<void> {
    try {
      this.agentStatus = await client.startAgent();
    } catch { /* ignore */ }
  }

  private async handleStop(): Promise<void> {
    try {
      this.agentStatus = await client.stopAgent();
    } catch { /* ignore */ }
  }

  private async handlePauseResume(): Promise<void> {
    if (!this.agentStatus) return;
    try {
      if (this.agentStatus.state === "running") {
        this.agentStatus = await client.pauseAgent();
      } else if (this.agentStatus.state === "paused") {
        this.agentStatus = await client.resumeAgent();
      }
    } catch { /* ignore */ }
  }

  private async handleRestart(): Promise<void> {
    try {
      this.agentStatus = { ...(this.agentStatus ?? { agentName: "Milaidy", model: undefined, uptime: undefined, startedAt: undefined }), state: "restarting" };
      this.agentStatus = await client.restartAgent();
    } catch {
      // Fall back to polling status after a delay (restart may have killed the connection)
      setTimeout(async () => {
        try {
          this.agentStatus = await client.getStatus();
        } catch { /* ignore */ }
      }, 3000);
    }
  }

  private async handleExportKeys(): Promise<void> {
    if (this.walletExportVisible) {
      this.walletExportVisible = false;
      this.walletExportData = null;
      return;
    }
    const confirmed = window.confirm(
      "This will reveal your private keys.\n\n" +
      "NEVER share your private keys with anyone.\n" +
      "Anyone with your private keys can steal all funds in your wallets.\n\n" +
      "Continue?",
    );
    if (!confirmed) return;

    try {
      this.walletExportData = await client.exportWalletKeys();
      this.walletExportVisible = true;
      // Auto-hide after 60 seconds for security
      setTimeout(() => {
        this.walletExportVisible = false;
        this.walletExportData = null;
      }, 60_000);
    } catch (err) {
      this.walletError = `Failed to export keys: ${err instanceof Error ? err.message : "network error"}`;
    }
  }

  private async handleReset(): Promise<void> {
    // Double-confirm: this is destructive
    const confirmed = window.confirm(
      "This will completely reset the agent — wiping all config, memory, and data.\n\n" +
      "You will be taken back to the onboarding wizard.\n\n" +
      "Are you sure?",
    );
    if (!confirmed) return;

    try {
      await client.resetAgent();

      // Reset local UI state and show onboarding
      this.agentStatus = null;
      this.onboardingComplete = false;
      this.onboardingStep = "welcome";
      this.onboardingName = "";
      this.onboardingStyle = "";
      this.onboardingTheme = this.currentTheme;
      this.onboardingRunMode = "";
      this.onboardingCloudProvider = "";
      this.onboardingSmallModel = "claude-haiku";
      this.onboardingLargeModel = "claude-sonnet-4-5";
      this.onboardingProvider = "";
      this.onboardingApiKey = "";
      this.onboardingSelectedChains = new Set(["evm", "solana"]);
      this.onboardingRpcSelections = {};
      this.onboardingRpcKeys = {};
      this.chatMessages = [];
      this.conversationMessages = [];
      this.activeConversationId = null;
      this.conversations = [];
      this.configRaw = {};
      this.configText = "";
      this.plugins = [];
      this.skills = [];
      this.logs = [];

      // Re-fetch onboarding options for the wizard
      try {
        const options = await client.getOnboardingOptions();
        this.onboardingOptions = options;
      } catch { /* ignore */ }
    } catch {
      window.alert("Reset failed. Check the console for details.");
    }
  }

  // --- Agent Export / Import ---

  private async handleAgentExport(): Promise<void> {
    if (this.exportBusy || this.exportPassword.length < 4) return;

    this.exportBusy = true;
    this.exportError = null;
    this.exportSuccess = null;

    try {
      const resp = await client.exportAgent(this.exportPassword, this.exportIncludeLogs);

      const blob = await resp.blob();
      const disposition = resp.headers.get("Content-Disposition") ?? "";
      const filenameMatch = /filename="?([^"]+)"?/.exec(disposition);
      const filename = filenameMatch?.[1] ?? "agent-export.eliza-agent";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.exportSuccess = `Exported successfully (${(blob.size / 1024).toFixed(0)} KB)`;
      this.exportPassword = "";
    } catch (err) {
      this.exportError = err instanceof Error ? err.message : "Export failed";
    } finally {
      this.exportBusy = false;
    }
  }

  private async handleAgentImport(): Promise<void> {
    if (this.importBusy || !this.importFile || this.importPassword.length < 4) return;

    this.importBusy = true;
    this.importError = null;
    this.importSuccess = null;

    try {
      const fileBuffer = await this.importFile.arrayBuffer();
      const result = await client.importAgent(this.importPassword, fileBuffer);

      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
        counts.relationships ? `${counts.relationships} relationships` : null,
        counts.worlds ? `${counts.worlds} worlds` : null,
        counts.tasks ? `${counts.tasks} tasks` : null,
        counts.logs ? `${counts.logs} logs` : null,
      ].filter(Boolean).join(", ");

      this.importSuccess = `Imported "${result.agentName}" successfully: ${summary || "no data"}. Restart the agent to activate.`;
      this.importPassword = "";
      this.importFile = null;
    } catch (err) {
      this.importError = err instanceof Error ? err.message : "Import failed";
    } finally {
      this.importBusy = false;
    }
  }

  // --- Chat ---

  private scrollChatToBottom(): void {
    requestAnimationFrame(() => {
      const el = this.shadowRoot?.querySelector(".chat-messages");
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  private async handleChatSend(): Promise<void> {
    const text = this.chatInput.trim();
    if (!text || this.chatSending) return;

    // Ensure we have an active conversation
    if (!this.activeConversationId) {
      await this.handleNewConversation();
    }
    const convId = this.activeConversationId;
    if (!convId) return;

    // Optimistically add the user message
    this.conversationMessages = [
      ...this.conversationMessages,
      { id: `temp-${Date.now()}`, role: "user", text, timestamp: Date.now() },
    ];
    this.chatInput = "";
    this.chatSending = true;
    this.scrollChatToBottom();

    try {
      const data = await client.sendConversationMessage(convId, text);
      this.conversationMessages = [
        ...this.conversationMessages,
        { id: `temp-resp-${Date.now()}`, role: "assistant", text: data.text, timestamp: Date.now() },
      ];
      this.scrollChatToBottom();

      // Auto-title: if this is the first exchange, rename from the agent's response
      const conv = this.conversations.find((c) => c.id === convId);
      if (conv && conv.title === "New Chat" && data.text.length > 0) {
        const title = data.text.length > 50 ? `${data.text.slice(0, 50)}...` : data.text;
        await client.renameConversation(convId, title);
        await this.loadConversations();
      }
    } catch (err) {
      console.error("[milaidy] Failed to send message:", err);
      // Fallback: reload messages from the server so any response that was
      // saved to memory (but whose HTTP reply failed) still appears.
      await this.loadConversationMessages(convId);
      this.scrollChatToBottom();
    } finally {
      this.chatSending = false;
    }

    // Reset textarea height after clearing
    const textarea = this.shadowRoot?.querySelector<HTMLTextAreaElement>(".chat-input");
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.overflowY = "hidden";
    }
  }

  private handleChatInput(e: Event): void {
    const textarea = e.target as HTMLTextAreaElement;
    this.chatInput = textarea.value;

    // Auto-resize: reset to single row then expand to content
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    textarea.style.overflowY = textarea.scrollHeight > 200 ? "auto" : "hidden";
  }

  private handleChatKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void this.handleChatSend();
    }
  }

  private async handleChatClear(): Promise<void> {
    if (this.activeConversationId) {
      await client.deleteConversation(this.activeConversationId);
      this.activeConversationId = null;
      this.conversationMessages = [];
      await this.loadConversations();
    }
  }

  // --- Conversations ---

  private async loadConversations(): Promise<void> {
    try {
      const { conversations } = await client.listConversations();
      this.conversations = conversations;
    } catch {
      this.conversations = [];
    }
  }

  private async loadConversationMessages(convId: string): Promise<void> {
    try {
      const { messages } = await client.getConversationMessages(convId);
      this.conversationMessages = messages;
    } catch {
      this.conversationMessages = [];
    }
  }

  private async handleNewConversation(): Promise<void> {
    try {
      const { conversation } = await client.createConversation();
      this.conversations = [conversation, ...this.conversations];
      this.activeConversationId = conversation.id;
      this.conversationMessages = [];
    } catch {
      // ignore
    }
  }

  private async handleSelectConversation(e: CustomEvent<{ id: string }>): Promise<void> {
    const { id } = e.detail;
    if (id === this.activeConversationId) return;
    this.activeConversationId = id;
    await this.loadConversationMessages(id);
  }

  private async handleDeleteConversation(e: CustomEvent<{ id: string }>): Promise<void> {
    const { id } = e.detail;
    await client.deleteConversation(id);
    if (this.activeConversationId === id) {
      this.activeConversationId = null;
      this.conversationMessages = [];
    }
    await this.loadConversations();
  }

  private async handleRenameConversation(e: CustomEvent<{ id: string; title: string }>): Promise<void> {
    const { id, title } = e.detail;
    await client.renameConversation(id, title);
    await this.loadConversations();
  }


  // --- Onboarding ---

  /** Detect if running on a mobile device (Capacitor native or small screen). */
  private detectMobile(): boolean {
    const cap = (window as unknown as Record<string, unknown>).Capacitor as Record<string, unknown> | undefined;
    if (cap && typeof cap.getPlatform === "function") {
      const platform = (cap.getPlatform as () => string)();
      if (platform === "ios" || platform === "android") return true;
    }
    return window.matchMedia("(max-width: 768px)").matches;
  }

  private async handleOnboardingNext(): Promise<void> {
    const opts = this.onboardingOptions;
    switch (this.onboardingStep) {
      case "welcome":
        this.onboardingStep = "name";
        break;
      case "name":
        this.onboardingStep = "style";
        break;
      case "style":
        this.onboardingStep = "theme";
        break;
      case "theme": {
        this.setTheme(this.onboardingTheme);
        if (this.isMobileDevice) {
          this.onboardingRunMode = "cloud";
          if (opts && opts.cloudProviders.length === 1) {
            this.onboardingCloudProvider = opts.cloudProviders[0].id;
            this.onboardingStep = "modelSelection";
          } else {
            this.onboardingStep = "cloudProvider";
          }
        } else {
          this.onboardingStep = "runMode";
        }
        break;
      }
      case "runMode":
        if (this.onboardingRunMode === "cloud") {
          if (opts && opts.cloudProviders.length === 1) {
            this.onboardingCloudProvider = opts.cloudProviders[0].id;
            this.onboardingStep = "modelSelection";
          } else {
            this.onboardingStep = "cloudProvider";
          }
        } else {
          this.onboardingStep = "llmProvider";
        }
        break;
      case "cloudProvider":
        this.onboardingStep = "modelSelection";
        break;
      case "modelSelection":
        await this.handleOnboardingFinish();
        break;
      case "llmProvider":
        this.onboardingStep = "inventorySetup";
        break;
      case "inventorySetup":
        await this.handleOnboardingFinish();
        break;
    }
  }

  private handleOnboardingBack(): void {
    switch (this.onboardingStep) {
      case "name":
        this.onboardingStep = "welcome";
        break;
      case "style":
        this.onboardingStep = "name";
        break;
      case "theme":
        this.onboardingStep = "style";
        break;
      case "runMode":
        this.onboardingStep = "theme";
        break;
      case "cloudProvider":
        this.onboardingStep = this.isMobileDevice ? "theme" : "runMode";
        break;
      case "modelSelection":
        if (this.onboardingOptions && this.onboardingOptions.cloudProviders.length > 1) {
          this.onboardingStep = "cloudProvider";
        } else {
          this.onboardingStep = this.isMobileDevice ? "theme" : "runMode";
        }
        break;
      case "llmProvider":
        this.onboardingStep = "runMode";
        break;
      case "inventorySetup":
        this.onboardingStep = "llmProvider";
        break;
    }
  }

  private async handleOnboardingFinish(): Promise<void> {
    if (!this.onboardingOptions) return;

    // Find the style the user selected during onboarding
    const style = this.onboardingOptions.styles.find(
      (s) => s.catchphrase === this.onboardingStyle,
    );

    const systemPrompt = style?.system
      ? style.system.replace(/\{\{name\}\}/g, this.onboardingName)
      : `You are ${this.onboardingName}, an autonomous AI agent powered by ElizaOS. ${this.onboardingOptions.sharedStyleRules}`;

    // Build inventory providers array
    const inventoryProviders: Array<{ chain: string; rpcProvider: string; rpcApiKey?: string }> = [];
    if (this.onboardingRunMode === "local") {
      for (const chain of this.onboardingSelectedChains) {
        const rpcProvider = this.onboardingRpcSelections[chain] || "elizacloud";
        const rpcApiKey = this.onboardingRpcKeys[`${chain}:${rpcProvider}`] || undefined;
        inventoryProviders.push({ chain, rpcProvider, rpcApiKey });
      }
    }

    try {
      await client.submitOnboarding({
        name: this.onboardingName,
        theme: this.onboardingTheme,
        runMode: (this.onboardingRunMode || "local") as "local" | "cloud",
        bio: style?.bio ?? ["An autonomous AI agent."],
        systemPrompt,
        style: style?.style,
        adjectives: style?.adjectives,
        topics: style?.topics,
        messageExamples: style?.messageExamples,
        cloudProvider: this.onboardingRunMode === "cloud" ? this.onboardingCloudProvider : undefined,
        smallModel: this.onboardingRunMode === "cloud" ? this.onboardingSmallModel : undefined,
        largeModel: this.onboardingRunMode === "cloud" ? this.onboardingLargeModel : undefined,
        provider: this.onboardingRunMode === "local" ? this.onboardingProvider || undefined : undefined,
        providerApiKey: this.onboardingRunMode === "local" ? this.onboardingApiKey || undefined : undefined,
        inventoryProviders: inventoryProviders.length > 0 ? inventoryProviders : undefined,
      });
    } catch (err) {
      console.error("[milaidy] Onboarding submission failed:", err);
      window.alert(`Setup failed: ${err instanceof Error ? err.message : "network error"}. Please try again.`);
      return;
    }

    this.onboardingComplete = true;

    try {
      this.agentStatus = await client.restartAgent();
    } catch {
      // Agent restart may fail if not yet running — non-fatal
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

    const isChat = this.tab === "chat";

    if (isChat) {
      return html`
        <div class="app-shell chat-layout">
          ${this.renderHeader()}
          ${this.renderNav()}
          <div class="content-row">
            <conversations-sidebar
              .conversations=${this.conversations}
              .activeId=${this.activeConversationId}
              @new-conversation=${this.handleNewConversation}
              @select-conversation=${this.handleSelectConversation}
              @delete-conversation=${this.handleDeleteConversation}
              @rename-conversation=${this.handleRenameConversation}
            ></conversations-sidebar>
            <main class="chat-active">${this.renderChat()}</main>
            <widget-sidebar
              .goals=${this.workbench?.goals ?? []}
              .todos=${this.workbench?.todos ?? []}
              .loading=${this.workbenchLoading}
              .agentRunning=${(this.agentStatus?.state ?? "not_started") === "running"}
              .goalsAvailable=${this.workbenchGoalsAvailable}
              .todosAvailable=${this.workbenchTodosAvailable}
              @refresh-sidebar=${() => this.loadWorkbench()}
            ></widget-sidebar>
          </div>
        </div>
        ${this.renderCommandPalette()}
      `;
    }

    return html`
      <div class="app-shell">
        ${this.renderHeader()}
        ${this.renderNav()}
        <main>${this.renderView()}</main>
      </div>
      ${this.renderCommandPalette()}
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

  private async pollCloudCredits(): Promise<void> {
    const cloudStatus = await client.getCloudStatus().catch(() => null);
    if (!cloudStatus) return;
    this.cloudConnected = cloudStatus.connected;
    if (cloudStatus.topUpUrl) this.cloudTopUpUrl = cloudStatus.topUpUrl;
    if (cloudStatus.connected) {
      const credits = await client.getCloudCredits().catch(() => null);
      if (credits) {
        this.cloudCredits = credits.balance;
        this.cloudCreditsLow = credits.low ?? false;
        this.cloudCreditsCritical = credits.critical ?? false;
        if (credits.topUpUrl) this.cloudTopUpUrl = credits.topUpUrl;
      }
    }
  }

  private renderCloudCreditBadge() {
    if (!this.cloudConnected || this.cloudCredits === null) return html``;
    const formatted = "$" + this.cloudCredits.toFixed(2);
    const colorClass = this.cloudCreditsCritical
      ? "credit-critical"
      : this.cloudCreditsLow
        ? "credit-low"
        : "credit-ok";
    return html`
      <div class="credit-badge-wrapper">
        <a
          class="credit-badge ${colorClass}"
          href=${this.cloudTopUpUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="ElizaCloud credits"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/>
            <path d="M12 18V6"/>
          </svg>
          <span>${formatted}</span>
        </a>
      </div>
    `;
  }

  private renderCommandPalette() {
    if (!this.commandPaletteOpen) return html``;
    const items = this.filteredCommandItems();
    return html`
      <div class="command-overlay" @click=${() => this.closeCommandPalette()}>
        <div class="command-palette" @click=${(e: Event) => e.stopPropagation()}>
          <input
            data-command-input
            class="command-input"
            placeholder="Type a command..."
            .value=${this.commandQuery}
            @input=${(e: Event) => {
              this.commandQuery = (e.target as HTMLInputElement).value;
              this.commandActiveIndex = 0;
            }}
          />
          <div class="command-list">
            ${items.map(
              (item, i) => html`
                <div
                  class="command-item ${i === this.commandActiveIndex ? "active" : ""}"
                  @click=${() => void this.executeCommand(item.id)}
                  @mouseenter=${() => { this.commandActiveIndex = i; }}
                >
                  <span class="command-label">${item.label}</span>
                  <span class="command-hint">${item.hint}</span>
                </div>
              `,
            )}
            ${items.length === 0 ? html`<div class="command-empty">No matching commands</div>` : null}
          </div>
        </div>
      </div>
    `;
  }

  private renderHeader() {
    const status = this.agentStatus;
    const state = status?.state ?? "not_started";
    const name = status?.agentName ?? "Milaidy";

    return html`
      <header>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="logo">${name}</span>
          ${this.renderCloudCreditBadge()}
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="status-bar">
          <span class="status-pill ${state}">${state}</span>
          ${state === "not_started" || state === "stopped"
            ? html`<button class="lifecycle-btn" @click=${this.handleStart}>Start</button>`
            : state === "restarting"
              ? html`<span class="lifecycle-btn" style="opacity:0.6;cursor:default;">Restarting…</span>`
              : html`
                <button class="lifecycle-btn" @click=${this.handlePauseResume}>
                  ${state === "running" ? "Pause" : "Resume"}
                </button>
                <button class="lifecycle-btn" @click=${this.handleStop}>Stop</button>
              `}
          <button class="lifecycle-btn" @click=${this.handleRestart} ?disabled=${state === "restarting" || state === "not_started"} title="Restart the agent (reload code, config, plugins)">Restart</button>
          </div>
          ${this.renderWalletIcon()}
        </div>
      </header>
    `;
  }

  private renderWalletIcon() {
    const w = this.walletAddresses;
    if (!w || (!w.evmAddress && !w.solanaAddress)) return html``;

    const evmShort = w.evmAddress
      ? `${w.evmAddress.slice(0, 6)}...${w.evmAddress.slice(-4)}`
      : null;
    const solShort = w.solanaAddress
      ? `${w.solanaAddress.slice(0, 4)}...${w.solanaAddress.slice(-4)}`
      : null;

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
        <div class="wallet-tooltip">
          ${evmShort ? html`
            <div class="wallet-addr-row">
              <span class="chain-label">EVM</span>
              <code>${evmShort}</code>
              <button class="copy-btn" @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(w.evmAddress!); }}>copy</button>
            </div>
          ` : ""}
          ${solShort ? html`
            <div class="wallet-addr-row">
              <span class="chain-label">SOL</span>
              <code>${solShort}</code>
              <button class="copy-btn" @click=${(e: Event) => { e.stopPropagation(); this.copyToClipboard(w.solanaAddress!); }}>copy</button>
            </div>
          ` : ""}
        </div>
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
    return html`
      <nav>
        ${TAB_GROUPS.map(
          (group) => html`
            ${group.tabs.map(
              (t) => html`
                <a
                  href=${pathForTab(t)}
                  class=${this.tab === t ? "active" : ""}
                  @click=${(e: Event) => {
                    e.preventDefault();
                    this.setTab(t);
                  }}
                >${titleForTab(t)}</a>
              `,
            )}
          `,
        )}
      </nav>
    `;
  }

  // ── App game launching ──────────────────────────────────────────────

  private handleAppLaunched = (e: CustomEvent<{ name: string; displayName: string; needsRestart: boolean; viewer: { url: string; embedParams?: Record<string, string>; postMessageAuth?: boolean; sandbox?: string } | null }>) => {
    const { name, displayName, viewer } = e.detail;
    this.activeGameApp = name;
    this.activeGameDisplayName = displayName;

    if (viewer) {
      // Build the viewer URL with embed params
      const viewerUrl = new URL(viewer.url);
      if (viewer.embedParams) {
        for (const [k, v] of Object.entries(viewer.embedParams)) {
          viewerUrl.searchParams.set(k, v);
        }
      }
      this.activeGameViewerUrl = viewerUrl.toString();
      this.activeGameSandbox = viewer.sandbox ?? "allow-scripts allow-same-origin allow-popups";
      this.activeGamePostMessageAuth = viewer.postMessageAuth ?? false;
    }

    // Switch to game tab immediately — the game client (iframe) loads independently
    // of whether the agent plugin is still restarting.
    this.tab = "game" as Tab;
    const base = (this as unknown as { _basePath?: string })._basePath ?? "";
    history.pushState(null, "", pathForTab("game" as Tab, base));
  };

  private handleAppStopped = () => {
    this.activeGameApp = "";
    this.activeGameDisplayName = "";
    this.activeGameViewerUrl = "";
    this.tab = "apps" as Tab;
    const base = (this as unknown as { _basePath?: string })._basePath ?? "";
    history.pushState(null, "", pathForTab("apps" as Tab, base));
  };

  private renderGameView() {
    if (!this.activeGameViewerUrl) {
      return html`<div style="padding: 48px; text-align: center; color: var(--text-muted)">No game is running. Go to Apps to launch one.</div>`;
    }
    return html`
      <game-view
        .appName=${this.activeGameApp}
        .displayName=${this.activeGameDisplayName}
        .viewerUrl=${this.activeGameViewerUrl}
        .sandbox=${this.activeGameSandbox}
        .postMessageAuth=${this.activeGamePostMessageAuth}
        @app-stopped=${this.handleAppStopped}
      ></game-view>
    `;
  }

  private renderView() {
    switch (this.tab) {
      case "chat": return this.renderChat();
      case "apps": return html`<apps-view @app-launched=${this.handleAppLaunched}></apps-view>`;
      case "game": return this.renderGameView();
      case "inventory": return this.renderInventory();
      case "plugins": return this.renderPlugins();
      case "skills": return this.renderSkills();
      case "database": return this.renderDatabase();
      case "config": return this.renderConfig();
      case "logs": return this.renderLogs();
      default: return this.renderChat();
    }
  }

  private renderChat() {
    const agentState = this.agentStatus?.state ?? "not_started";

    if (agentState === "not_started" || agentState === "stopped") {
      return html`
        <div class="chat-container" style="padding:0 20px;">
          <div class="chat-header-row">
            <h2 style="margin:0;">Chat</h2>
          </div>
          <div class="start-agent-box">
            <p>Agent is not running. Start it to begin chatting.</p>
            <button class="btn" @click=${this.handleStart}>Start Agent</button>
          </div>
        </div>
      `;
    }

    const msgs = this.conversationMessages;
    const convTitle = this.conversations.find(
      (c) => c.id === this.activeConversationId,
    )?.title ?? "Chat";

    return html`
      <div class="chat-container" style="padding:0 20px;">
        <div class="chat-header-row">
          <h2 style="margin:0;">${convTitle}</h2>
          ${msgs.length > 0
            ? html`<button class="clear-btn" @click=${this.handleChatClear}>Clear</button>`
            : ""}
        </div>
        <div class="chat-messages">
          ${msgs.length === 0
            ? html`<div class="empty-state">Send a message to start chatting.</div>`
            : msgs.map(
                (msg) => html`
                  <div class="chat-msg ${msg.role}">
                    <div class="role">${msg.role === "user" ? "You" : this.agentStatus?.agentName ?? "Agent"}</div>
                    <div>${msg.text}</div>
                  </div>
                `,
              )}
          ${this.chatSending
            ? html`<div class="chat-msg assistant">
                <div class="role">${this.agentStatus?.agentName ?? "Agent"}</div>
                <div class="typing-indicator"><span></span><span></span><span></span></div>
              </div>`
            : ""}
        </div>
        <div class="chat-input-row">
          <textarea
            class="chat-input"
            rows="1"
            placeholder="Type a message..."
            .value=${this.chatInput}
            @input=${this.handleChatInput}
            @keydown=${this.handleChatKeydown}
            ?disabled=${this.chatSending}
          ></textarea>
          <button class="chat-send-btn btn" @click=${this.handleChatSend} ?disabled=${this.chatSending}>
            ${this.chatSending ? "..." : "Send"}
          </button>
        </div>
      </div>
    `;
  }


  private renderPlugins() {
    const categories = ["all", "ai-provider", "connector", "feature"] as const;
    const categoryLabels: Record<string, string> = {
      "all": "All",
      "ai-provider": "AI Provider",
      "connector": "Connector",
      "feature": "Feature",
    };

    const searchLower = this.pluginSearch.toLowerCase();
    const nonDbPlugins = this.plugins.filter(p => p.category !== "database");
    const filtered = nonDbPlugins.filter((p) => {
      const matchesCategory = this.pluginFilter === "all" || p.category === this.pluginFilter;
      const matchesStatus = this.pluginStatusFilter === "all"
        || (this.pluginStatusFilter === "enabled" && p.enabled)
        || (this.pluginStatusFilter === "disabled" && !p.enabled);
      const matchesSearch = !searchLower
        || p.name.toLowerCase().includes(searchLower)
        || (p.description ?? "").toLowerCase().includes(searchLower)
        || p.id.toLowerCase().includes(searchLower);
      return matchesCategory && matchesStatus && matchesSearch;
    });

    // Sort: enabled-needs-config first, then enabled-configured, then disabled
    const sorted = [...filtered].sort((a, b) => {
      if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
      if (a.enabled && b.enabled) {
        const aNeedsConfig = a.parameters?.some(p => p.required && !p.isSet) ?? false;
        const bNeedsConfig = b.parameters?.some(p => p.required && !p.isSet) ?? false;
        if (aNeedsConfig !== bNeedsConfig) return aNeedsConfig ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    const enabledCount = nonDbPlugins.filter(p => p.enabled).length;
    const needConfigCount = nonDbPlugins.filter(p => {
      const hasParams = p.parameters && p.parameters.length > 0;
      return hasParams && p.parameters.some(param => param.required && !param.isSet);
    }).length;

    return html`
      <h2>Plugins</h2>
      <div class="pc-summary">
        <span><strong>${nonDbPlugins.length}</strong> discovered</span>
        <span class="pc-summary-sep">&middot;</span>
        <span><strong>${enabledCount}</strong> enabled</span>
        ${needConfigCount > 0 ? html`
          <span class="pc-summary-sep">&middot;</span>
          <span style="color:var(--warn)"><strong>${needConfigCount}</strong> need configuration</span>
        ` : ""}
      </div>

      <div class="pc-search-wrap">
        <input
          class="plugin-search"
          type="text"
          placeholder="Search plugins by name, description, or ID..."
          .value=${this.pluginSearch}
          @input=${(e: Event) => { this.pluginSearch = (e.target as HTMLInputElement).value; }}
        />
        ${this.pluginSearch ? html`
          <button class="pc-search-clear" @click=${() => { this.pluginSearch = ""; }}
            title="Clear search">&times;</button>
        ` : ""}
      </div>

      <div class="pc-toolbar">
        <div class="pc-filters">
          ${categories.map(cat => html`
            <button
              class="pc-filter-btn ${this.pluginFilter === cat ? "active" : ""}"
              @click=${() => { this.pluginFilter = cat; }}
            >${categoryLabels[cat]} (${cat === "all" ? nonDbPlugins.length : nonDbPlugins.filter(p => p.category === cat).length})</button>
          `)}
        </div>
        <div class="pc-toolbar-actions">
          <button class="pc-toolbar-btn" @click=${() => this.exportPluginConfig()}
            title="Export all plugin configurations as JSON">Export</button>
          <button class="pc-toolbar-btn" @click=${() => {
            const input = this.shadowRoot?.querySelector(".pc-file-input") as HTMLInputElement;
            input?.click();
          }} title="Import plugin configurations from JSON">Import</button>
          <input class="pc-file-input" type="file" accept=".json"
            @change=${(e: Event) => this.importPluginConfig(e)} />
        </div>
      </div>

      <div class="pc-filter-row">
        <span class="pc-filter-label">Status:</span>
        ${(["all", "enabled", "disabled"] as const).map(s => html`
          <button
            class="pc-filter-btn ${this.pluginStatusFilter === s ? "active" : ""}"
            @click=${() => { this.pluginStatusFilter = s; }}
          >${s === "all" ? "All" : s === "enabled" ? `Enabled (${enabledCount})` : `Disabled (${nonDbPlugins.length - enabledCount})`}</button>
        `)}
      </div>

      <div class="plugins-scroll-container">
        ${sorted.length === 0
          ? html`<div class="pc-empty">${this.pluginSearch ? "No plugins match your search." : "No plugins in this category."}</div>`
          : html`<div class="pc-list">${sorted.map(p => this.renderPluginCard(p))}</div>`
        }
      </div>
    `;
  }

  private renderPluginCard(p: PluginInfo) {
    const hasParams = p.parameters && p.parameters.length > 0;
    const settingsOpen = this.pluginSettingsOpen.has(p.id);
    const setCount = hasParams ? p.parameters.filter(param => param.isSet).length : 0;
    const totalCount = hasParams ? p.parameters.length : 0;
    const allParamsSet = !hasParams || setCount === totalCount;
    const progress = totalCount > 0 ? (setCount / totalCount) * 100 : 100;
    const categoryLabel = p.category === "ai-provider" ? "ai provider" : p.category;

    // Split into general and advanced params
    const generalParams = hasParams ? p.parameters.filter(param => !this.isAdvancedParam(param)) : [];
    const advancedParams = hasParams ? p.parameters.filter(param => this.isAdvancedParam(param)) : [];
    const advancedOpen = this.pluginAdvancedOpen.has(p.id);

    const toggleSettings = () => {
      const next = new Set(this.pluginSettingsOpen);
      if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
      this.pluginSettingsOpen = next;
    };

    const isSaving = this.pluginSaving.has(p.id);
    const saveSuccess = this.pluginSaveSuccess.has(p.id);

    return html`
      <div class="pc-card ${p.enabled ? "pc-enabled" : ""} ${p.enabled && !allParamsSet && hasParams ? "pc-needs-config" : ""}" data-plugin-id=${p.id}>
        <div class="pc-header" @click=${hasParams ? toggleSettings : undefined}>
          <div class="pc-info">
            <div class="pc-title-row">
              <span class="pc-name">${p.name}</span>
              <span class="pc-badge">${categoryLabel}</span>
              ${!allParamsSet && hasParams ? html`<span class="pc-badge pc-badge-warn">${setCount}/${totalCount}</span>` : ""}
            </div>
            <div class="pc-desc">${p.description || "No description available"}</div>
            ${p.version || p.npmName ? html`
              <div class="pc-meta">
                ${p.version ? html`<span class="pc-version">v${p.version}</span>` : ""}
                ${p.npmName ? html`<span class="pc-npm">${p.npmName}</span>` : ""}
              </div>
            ` : ""}
            ${p.pluginDeps && p.pluginDeps.length > 0 ? html`
              <div class="pc-deps">
                <span class="pc-dep-label">depends on:</span>
                ${p.pluginDeps.map(dep => html`<span class="pc-dep-tag">${dep}</span>`)}
              </div>
            ` : ""}
          </div>
          <div class="pc-controls" @click=${(e: Event) => e.stopPropagation()}>
            ${hasParams ? html`
              <div class="pc-progress" title="${setCount}/${totalCount} configured">
                <div class="pc-progress-fill" style="width:${progress}%"></div>
              </div>
            ` : ""}
            <label class="pc-toggle">
              <input type="checkbox" .checked=${p.enabled}
                @change=${(e: Event) => this.handlePluginToggle(p.id, (e.target as HTMLInputElement).checked)} />
              <div class="pc-toggle-track ${p.enabled ? "on" : ""}"><div class="pc-toggle-thumb"></div></div>
            </label>
          </div>
        </div>

        ${hasParams ? html`
          <div class="pc-settings-bar" tabindex="0" role="button"
            @click=${toggleSettings}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleSettings(); } }}>
            <span class="settings-chevron ${settingsOpen ? "open" : ""}">&#9654;</span>
            <span class="pc-dot ${allParamsSet ? "set" : "missing"}"></span>
            <span>Settings</span>
            <span style="font-weight:400;color:var(--muted)">(${setCount}/${totalCount} configured)</span>
          </div>
        ` : ""}

        ${settingsOpen && hasParams ? html`
          <div class="pc-settings">
            ${generalParams.map(param => this.renderPluginField(p, param))}

            ${advancedParams.length > 0 ? html`
              <div class="pc-advanced-toggle" tabindex="0" role="button"
                @click=${() => {
                  const next = new Set(this.pluginAdvancedOpen);
                  if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                  this.pluginAdvancedOpen = next;
                }}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    const next = new Set(this.pluginAdvancedOpen);
                    if (next.has(p.id)) next.delete(p.id); else next.add(p.id);
                    this.pluginAdvancedOpen = next;
                  }
                }}>
                <span class="settings-chevron ${advancedOpen ? "open" : ""}">&#9654;</span>
                Advanced (${advancedParams.length})
              </div>
              ${advancedOpen ? advancedParams.map(param => this.renderPluginField(p, param)) : ""}
            ` : ""}

            <div class="pc-actions">
              <button class="pc-btn-secondary" @click=${() => this.handlePluginConfigReset(p.id)}>Reset</button>
              <button class="btn ${saveSuccess ? "pc-btn-success" : ""}"
                style="font-size:12px;padding:5px 16px;"
                @click=${() => this.handlePluginConfigSave(p.id)}
                ?disabled=${isSaving}
              >${isSaving ? "Saving..." : saveSuccess ? "Saved" : "Save Settings"}</button>
            </div>
          </div>
        ` : ""}

        ${p.enabled && p.validationErrors && p.validationErrors.length > 0 ? html`
          <div class="pc-validation">
            ${p.validationErrors.map(err => html`<div class="pc-validation-item">${err.field}: ${err.message}</div>`)}
          </div>
        ` : ""}
        ${p.enabled && p.validationWarnings && p.validationWarnings.length > 0 ? html`
          <div style="padding:4px 18px 8px">
            ${p.validationWarnings.map(w => html`<div class="pc-warning">${w.message}</div>`)}
          </div>
        ` : ""}
      </div>
    `;
  }

  // ── Plugin field renderers ──────────────────────────────────────────

  private renderPluginField(plugin: PluginInfo, param: PluginParamDef) {
    const fieldType = this.autoFieldType(param);
    const label = this.autoLabel(param.key, plugin.id);

    return html`
      <div class="pc-field">
        <div class="pc-field-label">
          <span class="pc-dot ${param.isSet ? "set" : param.required ? "req-missing" : "opt-missing"}"></span>
          <span>${label}</span>
          ${param.required ? html`<span class="pc-field-req">required</span>` : ""}
          ${param.isSet ? html`<span class="pc-field-set">configured</span>` : ""}
        </div>
        <div class="pc-field-env"><code>${param.key}</code></div>

        ${fieldType === "boolean"
          ? this.renderBooleanField(plugin, param)
          : fieldType === "password"
            ? this.renderPasswordField(plugin, param)
            : param.options?.length
              ? this.renderSelectField(plugin, param)
              : this.renderTextField(plugin, param, fieldType)}

        ${param.description ? html`
          <div class="pc-field-help">
            ${param.description}${param.default != null ? html` <span style="opacity:0.7">(default: ${param.default})</span>` : ""}
          </div>
        ` : ""}
      </div>
    `;
  }

  private renderBooleanField(plugin: PluginInfo, param: PluginParamDef) {
    const currentVal = param.currentValue === "true" || param.currentValue === "1";
    const defaultVal = String(param.default) === "true" || String(param.default) === "1";
    const effectiveVal = param.isSet ? currentVal : defaultVal;

    return html`
      <label class="pc-bool-toggle">
        <input type="checkbox" .checked=${effectiveVal}
          data-plugin-param="${plugin.id}:${param.key}" data-field-type="boolean" />
        <div class="pc-toggle-track ${effectiveVal ? "on" : ""}"><div class="pc-toggle-thumb"></div></div>
        <span class="pc-bool-label">${effectiveVal ? "Enabled" : "Disabled"}</span>
      </label>
    `;
  }

  private renderPasswordField(plugin: PluginInfo, param: PluginParamDef) {
    return html`
      <div class="pc-password-wrap">
        <input
          class="pc-input"
          type="password"
          .value=${""}
          placeholder="${param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}"
          data-plugin-param="${plugin.id}:${param.key}"
          data-field-type="password"
        />
        <button class="pc-password-btn" @click=${(e: Event) => {
          const btn = e.currentTarget as HTMLButtonElement;
          const input = btn.previousElementSibling as HTMLInputElement;
          if (input) {
            if (input.type === "password") { input.type = "text"; btn.textContent = "Hide"; }
            else { input.type = "password"; btn.textContent = "Show"; }
          }
        }}>Show</button>
      </div>
    `;
  }

  private renderSelectField(plugin: PluginInfo, param: PluginParamDef) {
    const currentValue = param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
    const effectiveValue = currentValue || (param.default ?? "");

    return html`
      <select
        class="pc-input"
        data-plugin-param="${plugin.id}:${param.key}"
        data-field-type="select"
      >
        ${!param.required ? html`<option value="">— none —</option>` : ""}
        ${(param.options ?? []).map(
          (opt) => html`<option value="${opt}" ?selected=${opt === effectiveValue}>${opt}</option>`,
        )}
      </select>
    `;
  }

  private renderTextField(plugin: PluginInfo, param: PluginParamDef, fieldType: string) {
    const inputType = fieldType === "number" ? "number" : fieldType === "url" ? "url" : "text";
    const currentValue = param.isSet && !param.sensitive ? (param.currentValue ?? "") : "";
    const placeholder = param.default ? `Default: ${param.default}` : "Enter value...";

    return html`
      <input
        class="pc-input"
        type="${inputType}"
        .value=${currentValue}
        placeholder="${placeholder}"
        data-plugin-param="${plugin.id}:${param.key}"
        data-field-type="${fieldType}"
      />
    `;
  }

  // ── Auto-detection helpers ──────────────────────────────────────────

  private autoLabel(key: string, pluginId: string): string {
    const prefixes = [
      pluginId.toUpperCase().replace(/-/g, "_") + "_",
      pluginId.toUpperCase().replace(/-/g, "") + "_",
    ];
    let remainder = key;
    for (const prefix of prefixes) {
      if (key.startsWith(prefix) && key.length > prefix.length) {
        remainder = key.slice(prefix.length);
        break;
      }
    }
    const acronyms = new Set([
      "API", "URL", "ID", "SSH", "SSL", "HTTP", "HTTPS", "RPC",
      "NFT", "EVM", "TLS", "DNS", "IP", "JWT", "SDK", "LLM",
    ]);
    return remainder
      .split("_")
      .map(w => acronyms.has(w) ? w : w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ");
  }

  private autoFieldType(param: PluginParamDef): "text" | "password" | "boolean" | "number" | "url" {
    if (param.type === "boolean") return "boolean";
    if (param.sensitive) return "password";
    const k = param.key.toUpperCase();
    if (k.includes("URL") || k.includes("ENDPOINT")) return "url";
    if (param.type === "number" || k.includes("PORT") || k.includes("TIMEOUT") || k.includes("DELAY")) return "number";
    return "text";
  }

  private isAdvancedParam(param: PluginParamDef): boolean {
    const k = param.key.toUpperCase();
    const d = (param.description ?? "").toLowerCase();
    return k.includes("EXPERIMENTAL") || k.includes("DEBUG") || k.includes("VERBOSE")
      || k.includes("TELEMETRY") || k.includes("BROWSER_BASE")
      || d.includes("experimental") || d.includes("advanced") || d.includes("debug");
  }

  // ── Plugin config actions ───────────────────────────────────────────

  private handlePluginConfigReset(pluginId: string): void {
    const inputs = this.shadowRoot?.querySelectorAll(`[data-plugin-param^="${pluginId}:"]`);
    if (!inputs) return;
    for (const input of inputs) {
      const el = input as HTMLInputElement;
      if (el.type === "checkbox") el.checked = false;
      else el.value = "";
    }
  }

  private exportPluginConfig(): void {
    const exportData = {
      exportedAt: new Date().toISOString(),
      plugins: this.plugins
        .filter(p => p.category !== "database")
        .map(p => ({
          id: p.id,
          enabled: p.enabled,
          config: Object.fromEntries(
            p.parameters
              .filter(param => param.isSet && !param.sensitive)
              .map(param => [param.key, param.currentValue]),
          ),
        }))
        .filter(p => p.enabled || Object.keys(p.config).length > 0),
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `milaidy-plugins-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    this.setActionNotice("Plugin configuration exported.", "success");
  }

  private async importPluginConfig(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text) as {
        plugins?: Array<{
          id: string;
          enabled?: boolean;
          config?: Record<string, string | null>;
        }>;
      };
      if (!data.plugins || !Array.isArray(data.plugins)) {
        throw new Error("Invalid format: expected { plugins: [...] }");
      }

      let applied = 0;
      for (const entry of data.plugins) {
        if (!entry.id) continue;
        const updates: Record<string, unknown> = {};
        if (entry.enabled !== undefined) updates.enabled = entry.enabled;
        if (entry.config && Object.keys(entry.config).length > 0) {
          updates.config = entry.config;
        }
        if (Object.keys(updates).length > 0) {
          await client.updatePlugin(entry.id, updates);
          applied++;
        }
      }

      await this.loadPlugins();
      this.setActionNotice(`Imported configuration for ${applied} plugin${applied !== 1 ? "s" : ""}.`, "success");
    } catch (err) {
      this.setActionNotice(
        `Import failed: ${err instanceof Error ? err.message : "invalid file"}`,
        "error",
        4000,
      );
    } finally {
      input.value = "";
    }
  }

  // --- Plugin Store ---

  async loadStore(): Promise<void> {
    this.storeLoading = true;
    this.storeError = null;
    try {
      const { plugins } = await client.getRegistryPlugins();
      this.storePlugins = plugins;
    } catch (err) {
      this.storeError = `Failed to load plugin registry: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.storeLoading = false;

    // Also load skill catalog if not already loaded
    if (this.catalogSkills.length === 0 && !this.catalogLoading) {
      this.loadCatalog();
    }
  }

  async handleStoreInstall(pluginName: string): Promise<void> {
    const next = new Set(this.storeInstalling);
    next.add(pluginName);
    this.storeInstalling = next;
    this.storeError = null;

    try {
      const result = await client.installRegistryPlugin(pluginName);
      if (!result.ok) {
        this.storeError = result.error ?? `Failed to install ${pluginName}`;
      } else {
        await this.loadStore();
        this.loadPlugins();
      }
    } catch (err) {
      this.storeError = `Install failed: ${err instanceof Error ? err.message : "network error"}`;
    }

    const done = new Set(this.storeInstalling);
    done.delete(pluginName);
    this.storeInstalling = done;
  }

  async handleStoreUninstall(pluginName: string): Promise<void> {
    const confirmed = window.confirm(
      `Uninstall ${pluginName}?\n\nThis will remove the plugin and restart the agent.`,
    );
    if (!confirmed) return;

    const next = new Set(this.storeUninstalling);
    next.add(pluginName);
    this.storeUninstalling = next;
    this.storeError = null;

    try {
      const result = await client.uninstallRegistryPlugin(pluginName);
      if (!result.ok) {
        this.storeError = result.error ?? `Failed to uninstall ${pluginName}`;
      } else {
        await this.loadStore();
        this.loadPlugins();
      }
    } catch (err) {
      this.storeError = `Uninstall failed: ${err instanceof Error ? err.message : "network error"}`;
    }

    const done = new Set(this.storeUninstalling);
    done.delete(pluginName);
    this.storeUninstalling = done;
  }

  async handleStoreRefresh(): Promise<void> {
    this.storeLoading = true;
    this.storeError = null;
    try {
      await client.refreshRegistry();
      await this.loadStore();
    } catch (err) {
      this.storeError = `Refresh failed: ${err instanceof Error ? err.message : "network error"}`;
      this.storeLoading = false;
    }
  }

  // --- Skill Catalog ---

  async loadCatalog(): Promise<void> {
    this.catalogLoading = true;
    this.catalogError = null;
    try {
      if (this.catalogSearch) {
        const { results } = await client.searchSkillCatalog(this.catalogSearch, 50);
        this.catalogSkills = results.map((r) => ({
          slug: r.slug,
          displayName: r.displayName,
          summary: r.summary,
          tags: (r.latestVersion ? { latest: r.latestVersion } : {}) as Record<string, string>,
          stats: {
            comments: 0,
            downloads: r.downloads,
            installsAllTime: r.installs,
            installsCurrent: 0,
            stars: r.stars,
            versions: 0,
          },
          createdAt: 0,
          updatedAt: 0,
          latestVersion: r.latestVersion
            ? { version: r.latestVersion, createdAt: 0, changelog: "" }
            : null,
        }));
        this.catalogTotal = results.length;
        this.catalogTotalPages = 1;
        this.catalogPage = 1;
      } else {
        const data = await client.getSkillCatalog({
          page: this.catalogPage,
          perPage: 50,
          sort: this.catalogSort,
        });
        this.catalogSkills = data.skills;
        this.catalogTotal = data.total;
        this.catalogPage = data.page;
        this.catalogTotalPages = data.totalPages;
      }
    } catch (err) {
      this.catalogError = `Failed to load skill catalog: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.catalogLoading = false;
  }

  async handleCatalogRefresh(): Promise<void> {
    this.catalogLoading = true;
    this.catalogError = null;
    try {
      await client.refreshSkillCatalog();
      await this.loadCatalog();
    } catch (err) {
      this.catalogError = `Refresh failed: ${err instanceof Error ? err.message : "network error"}`;
      this.catalogLoading = false;
    }
  }

  handleCatalogSearch(): void {
    this.catalogPage = 1;
    this.loadCatalog();
  }

  handleCatalogPageChange(page: number): void {
    this.catalogPage = page;
    this.loadCatalog();
  }

  handleCatalogSortChange(sort: "downloads" | "stars" | "updated" | "name"): void {
    this.catalogSort = sort;
    this.catalogPage = 1;
    this.loadCatalog();
  }

  async handleCatalogInstall(slug: string): Promise<void> {
    const next = new Set(this.catalogInstalling);
    next.add(slug);
    this.catalogInstalling = next;
    this.catalogError = null;

    try {
      const result = await client.installCatalogSkill(slug);
      if (!result.ok) {
        this.catalogError = result.message ?? `Failed to install ${slug}`;
      } else {
        this.catalogSkills = this.catalogSkills.map((s) =>
          s.slug === slug ? { ...s, installed: true } : s,
        );
        if (this.catalogDetailSkill?.slug === slug) {
          this.catalogDetailSkill = { ...this.catalogDetailSkill, installed: true };
        }
        this.loadSkills();
      }
    } catch (err) {
      this.catalogError = `Install failed: ${err instanceof Error ? err.message : "network error"}`;
    }

    const done = new Set(this.catalogInstalling);
    done.delete(slug);
    this.catalogInstalling = done;
  }

  async handleCatalogUninstall(slug: string): Promise<void> {
    const confirmed = window.confirm(
      `Uninstall skill "${slug}"?\n\nThis will remove the skill from the agent.`,
    );
    if (!confirmed) return;

    const next = new Set(this.catalogUninstalling);
    next.add(slug);
    this.catalogUninstalling = next;
    this.catalogError = null;

    try {
      const result = await client.uninstallCatalogSkill(slug);
      if (!result.ok) {
        this.catalogError = result.message ?? `Failed to uninstall ${slug}`;
      } else {
        this.catalogSkills = this.catalogSkills.map((s) =>
          s.slug === slug ? { ...s, installed: false } : s,
        );
        if (this.catalogDetailSkill?.slug === slug) {
          this.catalogDetailSkill = { ...this.catalogDetailSkill, installed: false };
        }
        this.loadSkills();
      }
    } catch (err) {
      this.catalogError = `Uninstall failed: ${err instanceof Error ? err.message : "network error"}`;
    }

    const done = new Set(this.catalogUninstalling);
    done.delete(slug);
    this.catalogUninstalling = done;
  }

  categorizeStorePlugin(name: string): string {
    const aiProviders = ["openai", "anthropic", "groq", "xai", "ollama", "openrouter", "google", "deepseek", "mistral", "together", "cohere", "perplexity", "qwen", "minimax"];
    const connectors = ["discord", "telegram", "slack", "whatsapp", "signal", "imessage", "bluebubbles", "msteams", "mattermost", "google-chat", "farcaster", "lens", "twitter", "nostr", "matrix", "feishu"];
    const lower = name.toLowerCase();
    if (aiProviders.some(p => lower.includes(p))) return "ai-provider";
    if (connectors.some(c => lower.includes(c))) return "connector";
    return "feature";
  }

  private async handlePluginConfigSave(pluginId: string): Promise<void> {
    // Collect values BEFORE state changes to avoid re-render resetting inputs
    const inputs = this.shadowRoot?.querySelectorAll(`[data-plugin-param^="${pluginId}:"]`);
    if (!inputs) return;

    const config: Record<string, string> = {};
    for (const input of inputs) {
      const attr = input.getAttribute("data-plugin-param") ?? "";
      const key = attr.split(":").slice(1).join(":");
      const fieldType = input.getAttribute("data-field-type") ?? "text";
      const el = input as HTMLInputElement;

      if (fieldType === "boolean") {
        config[key] = el.checked ? "true" : "false";
      } else {
        const value = el.value.trim();
        if (value) {
          config[key] = value;
        }
      }
    }

    if (Object.keys(config).length === 0) return;

    const saving = new Set(this.pluginSaving);
    saving.add(pluginId);
    this.pluginSaving = saving;

    try {
      await client.updatePlugin(pluginId, { config });
      await this.loadPlugins();
      this.setActionNotice("Plugin settings saved.", "success");

      const success = new Set(this.pluginSaveSuccess);
      success.add(pluginId);
      this.pluginSaveSuccess = success;

      setTimeout(() => {
        const next = new Set(this.pluginSaveSuccess);
        next.delete(pluginId);
        this.pluginSaveSuccess = next;
      }, 2000);
    } catch (err) {
      console.error("Failed to save plugin config:", err);
      this.setActionNotice(
        `Save failed: ${err instanceof Error ? err.message : "unknown error"}`,
        "error",
        3800,
      );
    } finally {
      const done = new Set(this.pluginSaving);
      done.delete(pluginId);
      this.pluginSaving = done;
    }
  }

  private async handlePluginToggle(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);

    // Block enabling if there are validation errors (missing required params)
    if (enabled && plugin?.validationErrors && plugin.validationErrors.length > 0) {
      // Revert the checkbox and open settings so user can configure
      this.requestUpdate();
      const next = new Set(this.pluginSettingsOpen);
      next.add(pluginId);
      this.pluginSettingsOpen = next;
      this.setActionNotice("Configure required settings before enabling.", "error", 3000);
      return;
    }

    try {
      await client.updatePlugin(pluginId, { enabled });
      if (plugin) {
        plugin.enabled = enabled;
        this.requestUpdate();
      }
    } catch (err) {
      console.error("Failed to toggle plugin:", err);
    }
  }

  private async handleCreateSkill(): Promise<void> {
    const name = this.skillCreateName.trim();
    if (!name) return;
    this.skillCreating = true;
    try {
      const result = await client.createSkill(name, this.skillCreateDescription.trim() || "");
      this.skillCreateName = "";
      this.skillCreateDescription = "";
      this.skillCreateFormOpen = false;
      this.setActionNotice(`Skill "${name}" created.`, "success");
      await this.refreshSkills();
      if (result.path) await client.openSkill(result.skill?.id ?? name).catch(() => undefined);
    } catch (err) {
      this.setActionNotice(`Failed to create skill: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
    } finally {
      this.skillCreating = false;
    }
  }

  private async handleOpenSkill(skillId: string): Promise<void> {
    try {
      await client.openSkill(skillId);
      this.setActionNotice("Opening skill folder...", "success", 2000);
    } catch (err) {
      this.setActionNotice(`Failed to open: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
    }
  }

  private async handleDeleteSkill(skillId: string, skillName: string): Promise<void> {
    if (!confirm(`Delete skill "${skillName}"? This cannot be undone.`)) return;
    try {
      await client.deleteSkill(skillId);
      this.setActionNotice(`Skill "${skillName}" deleted.`, "success");
      await this.refreshSkills();
    } catch (err) {
      this.setActionNotice(`Failed to delete: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
    }
  }

  private async handleReviewSkill(skillId: string): Promise<void> {
    this.skillReviewId = skillId;
    this.skillReviewLoading = true;
    this.skillReviewReport = null;
    try {
      const { report } = await client.getSkillScanReport(skillId);
      this.skillReviewReport = report;
    } catch {
      this.skillReviewReport = null;
    } finally {
      this.skillReviewLoading = false;
    }
  }

  private async handleAcknowledgeSkill(skillId: string): Promise<void> {
    try {
      await client.acknowledgeSkill(skillId, true);
      this.setActionNotice(`Skill "${skillId}" acknowledged and enabled.`, "success");
      this.skillReviewReport = null;
      this.skillReviewId = "";
      await this.refreshSkills();
    } catch (err) {
      this.setActionNotice(`Failed: ${err instanceof Error ? err.message : "error"}`, "error", 4200);
    }
  }

  private renderSkillCard(s: import("./api-client").SkillInfo) {
    const isQuarantined = s.scanStatus === "warning" || s.scanStatus === "critical";
    const isBlocked = s.scanStatus === "blocked";
    const isReviewing = this.skillReviewId === s.id;

    return html`
      <div class="plugin-item" style="flex-direction:column;align-items:stretch;" data-skill-id=${s.id}>
        <div style="display:flex;align-items:center;gap:6px;">
          <div style="flex:1;min-width:0;">
            <div class="plugin-name">${s.name}
              ${isQuarantined ? html`<span style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:${s.scanStatus === "critical" ? "var(--danger,#e74c3c)" : "var(--warning,#f39c12)"};color:#fff;">QUARANTINED</span>` : ""}
              ${isBlocked ? html`<span style="font-size:10px;padding:1px 6px;border-radius:3px;margin-left:6px;background:var(--danger,#e74c3c);color:#fff;">BLOCKED</span>` : ""}
            </div>
            <div class="plugin-desc">${s.description || "No description"}</div>
          </div>
          <button class="btn" style="font-size:11px;padding:2px 8px;" @click=${() => this.handleOpenSkill(s.id)}>Edit</button>
          <button class="btn" style="font-size:11px;padding:2px 8px;color:var(--danger,#e74c3c);" @click=${() => this.handleDeleteSkill(s.id, s.name)}>Del</button>
          ${isQuarantined && !isReviewing ? html`
            <button class="btn" style="font-size:11px;padding:2px 8px;color:var(--warning,#f39c12);" @click=${() => this.handleReviewSkill(s.id)}>Review Findings</button>
          ` : isBlocked ? html`
            <span class="plugin-status" style="color:var(--danger,#e74c3c);">blocked</span>
          ` : html`
            <span class="plugin-status ${s.enabled ? "enabled" : ""}">${s.enabled ? "active" : "inactive"}</span>
            <label class="switch"><input type="checkbox" .checked=${s.enabled} ?disabled=${this.skillToggleAction === s.id || isQuarantined}
              @change=${(e: Event) => this.handleSkillToggle(s.id, (e.target as HTMLInputElement).checked)} /><span class="slider"></span></label>
          `}
        </div>

        ${isReviewing && this.skillReviewReport ? html`
          <div style="margin-top:8px;padding:8px;border:1px solid var(--border);font-size:12px;">
            <div style="margin-bottom:6px;">
              <strong>${this.skillReviewReport.summary.critical}</strong> critical, <strong>${this.skillReviewReport.summary.warn}</strong> warnings
            </div>
            ${this.skillReviewReport.findings.length > 0 ? html`
              <div style="font-family:var(--mono);font-size:11px;max-height:160px;overflow-y:auto;margin-bottom:8px;">
                ${this.skillReviewReport.findings.map((f) => html`
                  <div style="margin-bottom:4px;">
                    <span style="color:${f.severity === "critical" ? "var(--danger,#e74c3c)" : "var(--warning,#f39c12)"};">[${f.severity.toUpperCase()}]</span>
                    ${f.message} <span style="color:var(--muted);">${f.file}:${f.line}</span>
                  </div>`)}
              </div>` : ""}
            <div style="display:flex;gap:6px;">
              <button class="btn" @click=${() => this.handleAcknowledgeSkill(s.id)}>Acknowledge & Enable</button>
              <button class="btn" @click=${() => { this.skillReviewId = ""; this.skillReviewReport = null; }}>Dismiss</button>
            </div>
          </div>
        ` : isReviewing && this.skillReviewLoading ? html`
          <div style="margin-top:8px;font-size:12px;color:var(--muted);">Loading scan report...</div>
        ` : ""}
      </div>`;
  }

  private renderSkills() {
    const quarantinedCount = this.skills.filter((s) => s.scanStatus === "warning" || s.scanStatus === "critical").length;

    return html`
      <h2>Skills</h2>
      <p class="subtitle">
        ${this.skills.length} skills loaded${quarantinedCount > 0 ? html` · <span style="color:var(--warning,#f39c12);font-weight:bold;">${quarantinedCount} quarantined</span>` : ""}.
      </p>

      <div style="display:flex;gap:4px;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:8px;">
        ${(["my", "browse"] as const).map((tab) => html`
          <button class="btn" style="font-size:12px;padding:4px 12px;${this.skillsSubTab === tab ? "font-weight:bold;border-bottom:2px solid var(--accent);" : ""}"
            @click=${() => { this.skillsSubTab = tab; }}
          >${tab === "my" ? "My Skills" : "Browse & Install"}</button>
        `)}
      </div>

      ${this.skillsSubTab === "my" ? html`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <button class="btn" style="font-size:12px;padding:6px 16px;font-weight:bold;" @click=${() => { this.skillCreateFormOpen = !this.skillCreateFormOpen; }}>
            ${this.skillCreateFormOpen ? "Cancel" : "+ New Skill"}
          </button>
          <button class="btn" @click=${this.refreshSkills} style="font-size:12px;padding:4px 12px;">Refresh</button>
        </div>

        ${this.skillCreateFormOpen ? html`
          <section style="border:1px solid var(--accent,#888);padding:16px;margin-bottom:14px;border-radius:4px;background:var(--bg-secondary,rgba(255,255,255,0.03));">
            <div style="font-weight:bold;font-size:14px;margin-bottom:12px;">Create New Skill</div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--muted);">Skill Name <span style="color:var(--danger,#e74c3c);">*</span></label>
                <input class="plugin-search" style="width:100%;box-sizing:border-box;" placeholder="e.g. my-awesome-skill"
                  .value=${this.skillCreateName}
                  @input=${(e: Event) => { this.skillCreateName = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" && this.skillCreateName.trim()) void this.handleCreateSkill(); }} />
              </div>
              <div>
                <label style="display:block;font-size:12px;margin-bottom:4px;color:var(--muted);">Description</label>
                <input class="plugin-search" style="width:100%;box-sizing:border-box;" placeholder="Brief description of what this skill does (optional)"
                  .value=${this.skillCreateDescription}
                  @input=${(e: Event) => { this.skillCreateDescription = (e.target as HTMLInputElement).value; }}
                  @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter" && this.skillCreateName.trim()) void this.handleCreateSkill(); }} />
              </div>
              <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:4px;">
                <button class="btn" style="font-size:12px;padding:5px 16px;" @click=${() => { this.skillCreateFormOpen = false; this.skillCreateName = ""; this.skillCreateDescription = ""; }}>Cancel</button>
                <button class="btn" style="font-size:12px;padding:5px 16px;font-weight:bold;" @click=${() => this.handleCreateSkill()}
                  ?disabled=${this.skillCreating || !this.skillCreateName.trim()}>${this.skillCreating ? "Creating..." : "Create Skill"}</button>
              </div>
            </div>
          </section>
        ` : ""}

        ${this.skills.length === 0
          ? html`<div class="empty-state">No skills loaded. Create one above or install from Browse tab.</div>`
          : html`<div class="plugin-list">
              ${this.skills.filter((s) => s.scanStatus === "warning" || s.scanStatus === "critical" || s.scanStatus === "blocked").map((s) => this.renderSkillCard(s))}
              ${this.skills.filter((s) => !s.scanStatus || s.scanStatus === "clean").map((s) => this.renderSkillCard(s))}
            </div>`}

      ` : html`
        <p class="subtitle">Search and install skills from the marketplace or GitHub.</p>
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap;">
          <input class="plugin-search" style="flex:1;min-width:220px;" placeholder="Search skills..." .value=${this.skillsMarketplaceQuery}
            @input=${(e: Event) => { this.skillsMarketplaceQuery = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") void this.searchSkillsMarketplace(); }} />
          <button class="btn" @click=${() => this.searchSkillsMarketplace()} ?disabled=${this.skillsMarketplaceLoading}>
            ${this.skillsMarketplaceLoading ? "Searching..." : "Search"}</button>
        </div>
        ${this.skillsMarketplaceError ? html`<div style="padding:8px;border:1px solid var(--danger,#e74c3c);font-size:12px;color:var(--danger,#e74c3c);margin-bottom:8px;">${this.skillsMarketplaceError}</div>` : ""}
        <div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap;">
          <input class="plugin-search" style="flex:1;min-width:220px;" placeholder="Install via GitHub URL" .value=${this.skillsMarketplaceManualGithubUrl}
            @input=${(e: Event) => { this.skillsMarketplaceManualGithubUrl = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => { if (e.key === "Enter") void this.installSkillFromGithubUrl(); }} />
          <button class="btn" @click=${() => this.installSkillFromGithubUrl()}
            ?disabled=${this.skillsMarketplaceAction === "install:manual" || !this.skillsMarketplaceManualGithubUrl.trim()}>
            ${this.skillsMarketplaceAction === "install:manual" ? "Installing..." : "Install URL"}</button>
        </div>
        ${this.skillsMarketplaceResults.length === 0
          ? html`<div style="font-size:12px;color:var(--muted);">No results yet. Search above or install via GitHub URL.</div>`
          : html`<div class="plugin-list">${this.skillsMarketplaceResults.map((item) => html`
              <div class="plugin-item" style="flex-direction:column;align-items:stretch;">
                <div style="display:flex;justify-content:space-between;gap:10px;">
                  <div style="min-width:0;flex:1;">
                    <div class="plugin-name">${item.name}</div>
                    <div class="plugin-desc">${item.description || "No description."}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:4px;">${item.repository}${item.score != null ? ` · score: ${item.score.toFixed(2)}` : ""}</div>
                  </div>
                  <button class="btn" style="align-self:center;" @click=${() => this.installSkillFromMarketplace(item)}
                    ?disabled=${this.skillsMarketplaceAction === `install:${item.id}`}>
                    ${this.skillsMarketplaceAction === `install:${item.id}` ? "Installing..." : "Install"}</button>
                </div>
              </div>`)}</div>`}
      `}
    `;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Character Settings
  // ═══════════════════════════════════════════════════════════════════════

  private async loadCharacter(): Promise<void> {
    this.characterLoading = true;
    this.characterSaveError = null;
    this.characterSaveSuccess = null;
    try {
      const { character } = await client.getCharacter();
      this.characterData = character;
      // Initialize draft from loaded data
      this.characterDraft = {
        name: character.name ?? "",
        username: character.username ?? "",
        bio: Array.isArray(character.bio) ? character.bio.join("\n") : (character.bio ?? ""),
        system: character.system ?? "",
        adjectives: character.adjectives ?? [],
        topics: character.topics ?? [],
        style: {
          all: character.style?.all ?? [],
          chat: character.style?.chat ?? [],
          post: character.style?.post ?? [],
        },
        postExamples: character.postExamples ?? [],
      };
    } catch {
      this.characterData = null;
      this.characterDraft = {};
    }
    this.characterLoading = false;
  }

  private async handleSaveCharacter(): Promise<void> {
    this.characterSaving = true;
    this.characterSaveError = null;
    this.characterSaveSuccess = null;
    try {
      // Convert bio from string back to array if needed
      const draft = { ...this.characterDraft };
      if (typeof draft.bio === "string") {
        const lines = draft.bio
          .split("\n")
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        draft.bio = lines.length > 0 ? lines : undefined;
      }
      // Strip empty arrays so the API doesn't choke on them
      if (Array.isArray(draft.adjectives) && draft.adjectives.length === 0) delete draft.adjectives;
      if (Array.isArray(draft.topics) && draft.topics.length === 0) delete draft.topics;
      if (Array.isArray(draft.postExamples) && draft.postExamples.length === 0) delete draft.postExamples;
      if (draft.style) {
        const s = draft.style;
        if (s.all && s.all.length === 0) delete s.all;
        if (s.chat && s.chat.length === 0) delete s.chat;
        if (s.post && s.post.length === 0) delete s.post;
        if (!s.all && !s.chat && !s.post) delete draft.style;
      }
      // Auto-set username to name
      if (draft.name) {
        draft.username = draft.name;
      }
      // Remove empty string values
      if (!draft.name) delete draft.name;
      if (!draft.username) delete draft.username;
      if (!draft.system) delete draft.system;

      const { agentName } = await client.updateCharacter(draft);
      this.characterSaveSuccess = "Character saved successfully.";
      // Update agent name in status if it changed
      if (agentName && this.agentStatus) {
        this.agentStatus = { ...this.agentStatus, agentName };
      }
      // Reload to pick up normalized data
      await this.loadCharacter();
    } catch (err) {
      this.characterSaveError = `Failed to save: ${err instanceof Error ? err.message : "unknown error"}`;
    }
    this.characterSaving = false;
  }

  private handleCharacterFieldInput(field: keyof CharacterData, value: string): void {
    this.characterDraft = { ...this.characterDraft, [field]: value };
  }

  private handleCharacterArrayInput(field: "adjectives" | "topics" | "postExamples", value: string): void {
    const items = value.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    this.characterDraft = { ...this.characterDraft, [field]: items };
  }

  private handleCharacterStyleInput(subfield: "all" | "chat" | "post", value: string): void {
    const items = value.split("\n").map((s: string) => s.trim()).filter((s: string) => s.length > 0);
    const style = { ...(this.characterDraft.style ?? {}), [subfield]: items };
    this.characterDraft = { ...this.characterDraft, style };
  }

  private async checkExtensionStatus(): Promise<void> {
    this.extensionChecking = true;
    try {
      this.extensionStatus = await client.getExtensionStatus();
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
    // Always load config first to know key status
    await this.loadWalletConfig();
    if (!this.walletConfig?.alchemyKeySet && !this.walletConfig?.heliusKeySet) return;
    await this.loadBalances();
  }

  private async loadWalletConfig(): Promise<void> {
    try {
      this.walletConfig = await client.getWalletConfig();
      this.walletError = null;
    } catch (err) {
      this.walletError = `Failed to load wallet config: ${err instanceof Error ? err.message : "network error"}`;
    }
  }

  private async loadBalances(): Promise<void> {
    this.walletLoading = true;
    this.walletError = null;
    try {
      this.walletBalances = await client.getWalletBalances();
    } catch (err) {
      this.walletError = `Failed to fetch balances: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletLoading = false;
  }

  private async loadNfts(): Promise<void> {
    this.walletNftsLoading = true;
    this.walletError = null;
    try {
      this.walletNfts = await client.getWalletNfts();
    } catch (err) {
      this.walletError = `Failed to fetch NFTs: ${err instanceof Error ? err.message : "network error"}`;
    }
    this.walletNftsLoading = false;
  }

  private async handleWalletApiKeySave(): Promise<void> {
    this.walletApiKeySaving = true;
    this.walletError = null;
    const inputs = this.shadowRoot?.querySelectorAll<HTMLInputElement>("[data-wallet-config]") ?? [];
    const config: Record<string, string> = {};
    for (const input of inputs) {
      const key = input.dataset.walletConfig;
      if (key && input.value.trim()) {
        config[key] = input.value.trim();
      }
    }
    if (Object.keys(config).length > 0) {
      try {
        await client.updateWalletConfig(config);
        await this.loadWalletConfig();
        // Clear inputs after save
        for (const input of inputs) input.value = "";
        // Reload balances now that keys are set
        await this.loadBalances();
      } catch (err) {
        this.walletError = `Failed to save API keys: ${err instanceof Error ? err.message : "network error"}`;
      }
    }
    this.walletApiKeySaving = false;
  }

  private renderInventory() {
    const cfg = this.walletConfig;
    const needsSetup = !cfg || (!cfg.alchemyKeySet && !cfg.heliusKeySet);

    return html`
      <h2>Inventory</h2>
      <p class="subtitle">Tokens and NFTs across all your wallets.</p>

      ${this.walletError ? html`
        <div style="margin-top:12px;padding:10px 14px;border:1px solid var(--danger, #e74c3c);background:rgba(231,76,60,0.06);font-size:12px;color:var(--danger, #e74c3c);">
          ${this.walletError}
        </div>
      ` : ""}

      ${needsSetup ? this.renderInventorySetup() : this.renderInventoryContent()}
    `;
  }

  private renderInventorySetup() {
    const cfg = this.walletConfig;
    return html`
      <div style="margin-top:16px;">
        <p style="font-size:13px;line-height:1.6;">
          To view your balances, you need API keys from blockchain data providers.
          These are free to create and take about a minute to set up.
        </p>

        <div class="provider-tiles">
          <div class="provider-tile" @click=${() => { this.providerModalOpen = "alchemy"; }}>
            ${cfg?.alchemyKeySet ? html`<span class="tile-tag configured">configured</span>` : ""}
            <span class="tile-icon">?</span>
            <span class="tile-label">Alchemy</span>
          </div>
          <div class="provider-tile" @click=${() => { this.providerModalOpen = "helius"; }}>
            ${cfg?.heliusKeySet ? html`<span class="tile-tag configured">configured</span>` : ""}
            <span class="tile-icon">?</span>
            <span class="tile-label">Helius</span>
          </div>
          <div class="provider-tile" @click=${() => { this.providerModalOpen = "birdeye"; }}>
            ${cfg?.birdeyeKeySet ? html`<span class="tile-tag configured">configured</span>` : html`<span class="tile-tag optional">optional</span>`}
            <span class="tile-icon">?</span>
            <span class="tile-label">Birdeye</span>
          </div>
        </div>

        <div style="margin-top:16px;">
          <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                  ?disabled=${this.walletApiKeySaving}
                  style="padding:8px 24px;">
            ${this.walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>

      ${this.renderProviderModal()}
    `;
  }

  private renderProviderModal() {
    if (!this.providerModalOpen) return html``;
    const cfg = this.walletConfig;
    const provider = this.providerModalOpen;

    const content = {
      alchemy: {
        title: "Alchemy",
        configured: cfg?.alchemyKeySet ?? false,
        description: "Alchemy provides EVM chain data (Ethereum, Base, Arbitrum, Optimism, Polygon).",
        configKey: "ALCHEMY_API_KEY",
        placeholder: cfg?.alchemyKeySet ? "Already set — leave blank to keep" : "Paste your Alchemy API key",
        steps: html`
          <ol>
            <li>Go to <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener">dashboard.alchemy.com</a> and create a free account</li>
            <li>Create an app, then go to its <strong>Networks</strong> tab and enable: Ethereum, Base, Arbitrum, Optimism, Polygon</li>
            <li>Copy the <strong>API Key</strong> from your app settings</li>
            <li>Paste it below</li>
          </ol>
        `,
      },
      helius: {
        title: "Helius",
        configured: cfg?.heliusKeySet ?? false,
        description: "Helius provides Solana chain data (tokens, NFTs, enhanced RPC).",
        configKey: "HELIUS_API_KEY",
        placeholder: cfg?.heliusKeySet ? "Already set — leave blank to keep" : "Paste your Helius API key",
        steps: html`
          <ol>
            <li>Go to <a href="https://dev.helius.xyz/dashboard/app" target="_blank" rel="noopener">dev.helius.xyz</a> and create a free account</li>
            <li>You'll get an API key on your dashboard immediately</li>
            <li>Copy the <strong>API Key</strong></li>
            <li>Paste it below</li>
          </ol>
        `,
      },
      birdeye: {
        title: "Birdeye",
        configured: cfg?.birdeyeKeySet ?? false,
        description: "Birdeye provides USD price data for Solana tokens. Optional but recommended.",
        configKey: "BIRDEYE_API_KEY",
        placeholder: cfg?.birdeyeKeySet ? "Already set — leave blank to keep" : "Paste your Birdeye API key (optional)",
        steps: html`
          <ol>
            <li>Go to <a href="https://birdeye.so/user/api-management" target="_blank" rel="noopener">birdeye.so</a> and create a free account</li>
            <li>Navigate to the <strong>API</strong> section in your profile</li>
            <li>Copy your API key</li>
          </ol>
        `,
      },
    }[provider];

    return html`
      <div class="provider-modal-overlay" @click=${() => { this.providerModalOpen = null; }}>
        <div class="provider-modal" @click=${(e: Event) => e.stopPropagation()}>
          <h3>
            ${content.title}
            ${content.configured ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;">configured</span>` : ""}
            <button class="modal-close" @click=${() => { this.providerModalOpen = null; }}>&times;</button>
          </h3>
          <p style="font-size:12px;color:var(--muted);line-height:1.5;margin:0 0 12px 0;">${content.description}</p>
          <div style="font-size:12px;color:var(--muted);line-height:1.7;">${content.steps}</div>
          <div class="setup-input-row" style="margin-top:4px;">
            <input type="password" data-wallet-config="${content.configKey}"
                   placeholder="${content.placeholder}" />
          </div>
          <div style="margin-top:16px;display:flex;gap:8px;">
            <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                    ?disabled=${this.walletApiKeySaving}
                    style="padding:6px 20px;font-size:12px;">
              ${this.walletApiKeySaving ? "Saving..." : "Save"}
            </button>
            <button class="btn" @click=${() => { this.providerModalOpen = null; }}
                    style="padding:6px 20px;font-size:12px;background:transparent;border:1px solid var(--border);color:var(--text);">
              Close
            </button>
          </div>
        </div>
      </div>
    `;
  }

  private renderInventoryContent() {
    return html`
      <div class="inv-toolbar">
        <button class="inventory-subtab ${this.inventoryView === "tokens" ? "active" : ""}"
                @click=${() => { this.inventoryView = "tokens"; if (!this.walletBalances) this.loadBalances(); }}>
          Tokens
        </button>
        <button class="inventory-subtab ${this.inventoryView === "nfts" ? "active" : ""}"
                @click=${() => { this.inventoryView = "nfts"; if (!this.walletNfts) this.loadNfts(); }}>
          NFTs
        </button>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
          ${this.inventoryView === "tokens" ? html`
            <span style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">Sort:</span>
            <button class="sort-btn ${this.inventorySort === "value" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "value"; }}>Value</button>
            <button class="sort-btn ${this.inventorySort === "chain" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "chain"; }}>Chain</button>
            <button class="sort-btn ${this.inventorySort === "symbol" ? "active" : ""}"
                    @click=${() => { this.inventorySort = "symbol"; }}>Name</button>
          ` : ""}
          <button class="btn" style="font-size:11px;padding:3px 10px;"
                  @click=${() => this.inventoryView === "tokens" ? this.loadBalances() : this.loadNfts()}>
            Refresh
          </button>
        </div>
      </div>

      ${this.inventoryView === "tokens" ? this.renderTokensView() : this.renderNftsView()}
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
  }> {
    const rows: Array<{
      chain: string;
      symbol: string;
      name: string;
      balance: string;
      valueUsd: number;
      balanceRaw: number;
    }> = [];

    const b = this.walletBalances;
    if (!b) return rows;

    if (b.evm) {
      for (const chain of b.evm.chains) {
        if (chain.error) continue; // Skip errored chains — shown separately
        rows.push({
          chain: chain.chain,
          symbol: chain.nativeSymbol,
          name: `${chain.chain} native`,
          balance: chain.nativeBalance,
          valueUsd: Number.parseFloat(chain.nativeValueUsd) || 0,
          balanceRaw: Number.parseFloat(chain.nativeBalance) || 0,
        });
        for (const t of chain.tokens) {
          rows.push({
            chain: chain.chain,
            symbol: t.symbol,
            name: t.name,
            balance: t.balance,
            valueUsd: Number.parseFloat(t.valueUsd) || 0,
            balanceRaw: Number.parseFloat(t.balance) || 0,
          });
        }
      }
    }

    if (b.solana) {
      rows.push({
        chain: "Solana",
        symbol: "SOL",
        name: "Solana native",
        balance: b.solana.solBalance,
        valueUsd: Number.parseFloat(b.solana.solValueUsd) || 0,
        balanceRaw: Number.parseFloat(b.solana.solBalance) || 0,
      });
      for (const t of b.solana.tokens) {
        rows.push({
          chain: "Solana",
          symbol: t.symbol,
          name: t.name,
          balance: t.balance,
          valueUsd: Number.parseFloat(t.valueUsd) || 0,
          balanceRaw: Number.parseFloat(t.balance) || 0,
        });
      }
    }

    return rows;
  }

  private sortedBalances() {
    const rows = this.flattenBalances();
    const s = this.inventorySort;
    if (s === "value") {
      rows.sort((a, b) => b.valueUsd - a.valueUsd || b.balanceRaw - a.balanceRaw);
    } else if (s === "chain") {
      rows.sort((a, b) => a.chain.localeCompare(b.chain) || a.symbol.localeCompare(b.symbol));
    } else if (s === "symbol") {
      rows.sort((a, b) => a.symbol.localeCompare(b.symbol) || a.chain.localeCompare(b.chain));
    }
    return rows;
  }

  private renderTokensView() {
    if (this.walletLoading) {
      return html`<div class="empty-state" style="margin-top:24px;">Loading balances...</div>`;
    }
    if (!this.walletBalances) {
      return html`<div class="empty-state" style="margin-top:24px;">No balance data yet. Click Refresh.</div>`;
    }

    const rows = this.sortedBalances();

    if (rows.length === 0) {
      return html`
        <div class="empty-state" style="margin-top:24px;">
          No wallet data available. Make sure API keys are configured in
          <a href="/config" @click=${(e: Event) => { e.preventDefault(); this.setTab("config"); }}>Config</a>.
        </div>
      `;
    }

    // Collect per-chain errors so the user knows why some chains are missing
    const chainErrors = (this.walletBalances?.evm?.chains ?? []).filter(c => c.error);

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
              return html`
                <tr>
                  <td><span class="chain-icon ${icon.cls}">${icon.code}</span></td>
                  <td>
                    <span class="td-symbol">${row.symbol}</span>
                    <span class="td-name" style="margin-left:8px;">${row.name}</span>
                  </td>
                  <td style="font-size:11px;color:var(--muted);">${row.chain}</td>
                  <td class="td-balance">${this.formatBalance(row.balance)}</td>
                  <td class="td-value">${row.valueUsd > 0 ? "$" + row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}</td>
                </tr>
              `;
            })}
          </tbody>
        </table>
      </div>
      ${chainErrors.length > 0 ? html`
        <div style="margin-top:8px;font-size:11px;color:var(--muted);">
          ${chainErrors.map(c => html`
            <div style="padding:2px 0;">
              <span class="chain-icon ${this.chainIcon(c.chain).cls}" style="width:12px;height:12px;line-height:12px;font-size:7px;vertical-align:middle;">${this.chainIcon(c.chain).code}</span>
              ${c.chain}: ${c.error?.includes("not enabled") ? html`Not enabled in Alchemy &mdash; <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" style="color:var(--accent);">enable it</a>` : c.error}
            </div>
          `)}
        </div>
      ` : ""}
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

    for (const chainData of n.evm) {
      for (const nft of chainData.nfts) {
        allNfts.push({ chain: chainData.chain, name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName || nft.tokenType });
      }
    }
    if (n.solana) {
      for (const nft of n.solana.nfts) {
        allNfts.push({ chain: "Solana", name: nft.name, imageUrl: nft.imageUrl, collectionName: nft.collectionName });
      }
    }

    if (allNfts.length === 0) {
      return html`<div class="empty-state" style="margin-top:24px;">No NFTs found across your wallets.</div>`;
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

  // ═══════════════════════════════════════════════════════════════════════
  // Config
  // ═══════════════════════════════════════════════════════════════════════

  private renderDatabase() {
    return html`<milaidy-database @request-restart=${() => this.handleRestart()}></milaidy-database>`;
  }

  private renderConfig() {
    const ext = this.extensionStatus;
    const relayOk = ext?.relayReachable === true;

    const d = this.characterDraft;
    const bioText = typeof d.bio === "string" ? d.bio : (Array.isArray(d.bio) ? d.bio.join("\n") : "");
    const adjectivesText = (d.adjectives ?? []).join("\n");
    const topicsText = (d.topics ?? []).join("\n");
    const styleAllText = (d.style?.all ?? []).join("\n");
    const styleChatText = (d.style?.chat ?? []).join("\n");
    const stylePostText = (d.style?.post ?? []).join("\n");
    const postExamplesText = (d.postExamples ?? []).join("\n");

    return html`
      <h2>Settings</h2>
      <p class="subtitle">Agent settings and configuration.</p>

      <!-- Character Settings Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Character</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Define your agent's name, personality, knowledge, and communication style.
            </div>
          </div>
          <button
            class="btn"
            style="white-space:nowrap;margin-top:0;font-size:12px;padding:6px 14px;"
            @click=${() => this.loadCharacter()}
            ?disabled=${this.characterLoading}
          >${this.characterLoading ? "Loading..." : "Reload"}</button>
        </div>

        ${this.characterLoading && !this.characterData
          ? html`<div style="text-align:center;padding:24px;color:var(--muted);font-size:13px;">Loading character data...</div>`
          : html`
            <div style="display:flex;flex-direction:column;gap:16px;">

              <!-- Name -->
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-weight:600;font-size:12px;">Name</label>
                <div style="font-size:11px;color:var(--muted);">Agent display name (max 100 characters)</div>
                <input
                  type="text"
                  .value=${d.name ?? ""}
                  maxlength="100"
                  placeholder="Agent name"
                  @input=${(e: Event) => this.handleCharacterFieldInput("name", (e.target as HTMLInputElement).value)}
                  style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:13px;"
                />
              </div>

              <!-- Username is hidden; auto-set to name on save -->

              <!-- Bio -->
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-weight:600;font-size:12px;">Bio</label>
                <div style="font-size:11px;color:var(--muted);">Biography — one paragraph per line</div>
                <textarea
                  .value=${bioText}
                  rows="4"
                  placeholder="Write your agent's bio here. One paragraph per line."
                  @input=${(e: Event) => this.handleCharacterFieldInput("bio", (e.target as HTMLTextAreaElement).value)}
                  style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                ></textarea>
              </div>

              <!-- System Prompt -->
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-weight:600;font-size:12px;">System Prompt</label>
                <div style="font-size:11px;color:var(--muted);">Core behavior instructions for the agent (max 10,000 characters)</div>
                <textarea
                  .value=${d.system ?? ""}
                  rows="6"
                  maxlength="10000"
                  placeholder="You are..."
                  @input=${(e: Event) => this.handleCharacterFieldInput("system", (e.target as HTMLTextAreaElement).value)}
                  style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);resize:vertical;line-height:1.5;"
                ></textarea>
              </div>

              <!-- Adjectives & Topics (side by side) -->
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <label style="font-weight:600;font-size:12px;">Adjectives</label>
                  <div style="font-size:11px;color:var(--muted);">Personality adjectives — one per line</div>
                  <textarea
                    .value=${adjectivesText}
                    rows="3"
                    placeholder="curious\nwitty\nfriendly"
                    @input=${(e: Event) => this.handleCharacterArrayInput("adjectives", (e.target as HTMLTextAreaElement).value)}
                    style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                  ></textarea>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                  <label style="font-weight:600;font-size:12px;">Topics</label>
                  <div style="font-size:11px;color:var(--muted);">Topics the agent knows — one per line</div>
                  <textarea
                    .value=${topicsText}
                    rows="3"
                    placeholder="artificial intelligence\nblockchain\ncreative writing"
                    @input=${(e: Event) => this.handleCharacterArrayInput("topics", (e.target as HTMLTextAreaElement).value)}
                    style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                  ></textarea>
                </div>
              </div>

              <!-- Style -->
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-weight:600;font-size:12px;">Style</label>
                <div style="font-size:11px;color:var(--muted);">Communication style guidelines — one rule per line</div>

                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:4px;padding:12px;border:1px solid var(--border);background:var(--bg-muted);">
                  <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-weight:600;font-size:11px;color:var(--muted);">All</label>
                    <textarea
                      .value=${styleAllText}
                      rows="3"
                      placeholder="Keep responses concise\nUse casual tone"
                      @input=${(e: Event) => this.handleCharacterStyleInput("all", (e.target as HTMLTextAreaElement).value)}
                      style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                    ></textarea>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-weight:600;font-size:11px;color:var(--muted);">Chat</label>
                    <textarea
                      .value=${styleChatText}
                      rows="3"
                      placeholder="Be conversational\nAsk follow-up questions"
                      @input=${(e: Event) => this.handleCharacterStyleInput("chat", (e.target as HTMLTextAreaElement).value)}
                      style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                    ></textarea>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:4px;">
                    <label style="font-weight:600;font-size:11px;color:var(--muted);">Post</label>
                    <textarea
                      .value=${stylePostText}
                      rows="3"
                      placeholder="Use hashtags sparingly\nKeep under 280 characters"
                      @input=${(e: Event) => this.handleCharacterStyleInput("post", (e.target as HTMLTextAreaElement).value)}
                      style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                    ></textarea>
                  </div>
                </div>
              </div>

              <!-- Post Examples -->
              <div style="display:flex;flex-direction:column;gap:4px;">
                <label style="font-weight:600;font-size:12px;">Post Examples</label>
                <div style="font-size:11px;color:var(--muted);">Example social media posts — one per line</div>
                <textarea
                  .value=${postExamplesText}
                  rows="3"
                  placeholder="Just shipped a new feature! Excited to see what you build with it."
                  @input=${(e: Event) => this.handleCharacterArrayInput("postExamples", (e.target as HTMLTextAreaElement).value)}
                  style="padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:inherit;resize:vertical;line-height:1.5;"
                ></textarea>
              </div>

              <!-- Save Button -->
              <div style="display:flex;align-items:center;gap:12px;margin-top:4px;">
                <button
                  class="btn"
                  style="font-size:13px;padding:8px 24px;"
                  ?disabled=${this.characterSaving}
                  @click=${() => this.handleSaveCharacter()}
                >
                  ${this.characterSaving ? "Saving..." : "Save Character"}
                </button>
                ${this.characterSaveSuccess ? html`<span style="font-size:12px;color:var(--ok, #16a34a);">${this.characterSaveSuccess}</span>` : ""}
                ${this.characterSaveError ? html`<span style="font-size:12px;color:var(--danger, #e74c3c);">${this.characterSaveError}</span>` : ""}
              </div>
            </div>
          `}
      </div>

      <!-- Theme -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="font-weight:bold;font-size:14px;margin-bottom:4px;">Theme</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:8px;">Choose your visual style.</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          ${THEMES.map(t => html`
            <button
              class="theme-btn ${this.currentTheme === t.id ? "active" : ""}"
              @click=${() => this.setTheme(t.id)}
              style="padding:6px 14px;"
            >
              <div style="font-size:12px;font-weight:bold;color:var(--text);white-space:nowrap;">${t.label}</div>
            </button>
          `)}
        </div>
      </div>

      <!-- Software Updates -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Software Updates</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              ${this.updateStatus
                ? html`Version ${this.updateStatus.currentVersion}`
                : html`Loading...`}
            </div>
          </div>
          <button
            class="btn"
            style="white-space:nowrap;margin-top:0;font-size:12px;padding:6px 14px;"
            ?disabled=${this.updateLoading}
            @click=${() => this.loadUpdateStatus(true)}
          >${this.updateLoading ? "Checking..." : "Check Now"}</button>
        </div>

        ${this.updateStatus ? html`
          <!-- Channel selector -->
          <div style="margin-bottom:16px;">
            <div style="font-weight:600;font-size:12px;margin-bottom:6px;">Release Channel</div>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
              ${(["stable", "beta", "nightly"] as const).map(ch => {
                const active = this.updateStatus!.channel === ch;
                const desc = ch === "stable" ? "Recommended" : ch === "beta" ? "Preview" : "Bleeding edge";
                return html`
                  <button
                    class="theme-btn ${active ? "active" : ""}"
                    style="text-align:left;padding:10px;"
                    ?disabled=${this.updateChannelSaving}
                    @click=${() => this.handleChannelChange(ch)}
                  >
                    <div style="font-size:13px;font-weight:bold;color:var(--text);">${ch}</div>
                    <div style="font-size:11px;color:var(--muted);margin-top:2px;">${desc}</div>
                  </button>
                `;
              })}
            </div>
          </div>

          <!-- Available versions -->
          <div style="font-weight:600;font-size:12px;margin-bottom:6px;">Available Versions</div>
          <div style="display:flex;flex-direction:column;gap:4px;font-size:12px;">
            ${(["stable", "beta", "nightly"] as const).map(ch => {
              const ver = this.updateStatus!.channels[ch];
              const isCurrent = ch === this.updateStatus!.channel;
              return html`
                <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${isCurrent ? "var(--bg-hover, rgba(255,255,255,0.05))" : "transparent"};border-radius:4px;">
                  <span>
                    <span style="font-weight:${isCurrent ? "bold" : "normal"};">${ch}</span>
                    ${isCurrent ? html`<span style="color:var(--accent);font-size:11px;margin-left:6px;">current</span>` : ""}
                  </span>
                  <span style="font-family:var(--mono, monospace);color:${ver ? "var(--text)" : "var(--muted)"};">
                    ${ver ?? "not published"}
                  </span>
                </div>
              `;
            })}
          </div>

          <!-- Update available banner -->
          ${this.updateStatus.updateAvailable && this.updateStatus.latestVersion ? html`
            <div style="margin-top:12px;padding:10px 12px;border:1px solid var(--accent);background:rgba(255,255,255,0.03);border-radius:4px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:13px;font-weight:bold;color:var(--accent);">Update available</div>
                <div style="font-size:12px;color:var(--muted);">
                  ${this.updateStatus.currentVersion} &rarr; ${this.updateStatus.latestVersion}
                </div>
              </div>
              <div style="font-size:11px;color:var(--muted);text-align:right;">
                Run <code style="background:var(--bg-hover, rgba(255,255,255,0.05));padding:2px 6px;border-radius:3px;">milaidy update</code>
              </div>
            </div>
          ` : ""}

          ${this.updateStatus.error ? html`
            <div style="margin-top:8px;font-size:11px;color:var(--danger, #e74c3c);">${this.updateStatus.error}</div>
          ` : ""}

          ${this.updateStatus.lastCheckAt ? html`
            <div style="margin-top:8px;font-size:11px;color:var(--muted);">
              Last checked: ${new Date(this.updateStatus.lastCheckAt).toLocaleString()}
            </div>
          ` : ""}
        ` : html`
          <div style="text-align:center;padding:12px;color:var(--muted);font-size:12px;">
            ${this.updateLoading ? "Checking for updates..." : "Unable to load update status."}
          </div>
        `}
      </div>

      <!-- Chrome Extension Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Chrome Extension</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Connect the Milaidy Browser Relay extension so the agent can automate Chrome tabs.
            </div>
          </div>
          <button
            class="btn"
            style="white-space:nowrap;margin-top:0;font-size:12px;padding:6px 14px;"
            @click=${this.checkExtensionStatus}
            ?disabled=${this.extensionChecking}
          >${this.extensionChecking ? "Checking..." : "Check Connection"}</button>
        </div>

        ${ext
          ? html`
              <div style="padding:12px;border:1px solid var(--border);background:var(--bg-muted);margin-bottom:12px;">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                  <span style="
                    display:inline-block;width:8px;height:8px;border-radius:50%;
                    background:${relayOk ? "var(--ok, #16a34a)" : "var(--danger, #e74c3c)"};
                  "></span>
                  <span style="font-size:13px;font-weight:bold;">
                    Relay Server: ${relayOk ? "Connected" : "Not Reachable"}
                  </span>
                </div>
                <div style="font-size:12px;color:var(--muted);font-family:var(--mono);">
                  ws://127.0.0.1:${ext.relayPort}/extension
                </div>
                ${!relayOk
                  ? html`<div style="font-size:12px;color:var(--danger, #e74c3c);margin-top:6px;">
                      The browser relay server is not running. Start the agent with browser control enabled,
                      then check again.
                    </div>`
                  : ""}
              </div>
            `
          : ""}

        <div style="margin-top:12px;">
          <div style="font-weight:bold;font-size:13px;margin-bottom:8px;">Install Chrome Extension</div>
          <div style="font-size:12px;color:var(--muted);line-height:1.6;">
            <ol style="margin:0;padding-left:20px;">
              <li style="margin-bottom:6px;">
                Open Chrome and navigate to
                <code style="font-size:11px;padding:1px 4px;border:1px solid var(--border);background:var(--bg-muted);">chrome://extensions</code>
              </li>
              <li style="margin-bottom:6px;">
                Enable <strong>Developer mode</strong> (toggle in the top-right corner)
              </li>
              <li style="margin-bottom:6px;">
                Click <strong>"Load unpacked"</strong> and select the extension folder:
                ${ext?.extensionPath
                  ? html`<br/><code style="font-size:11px;padding:2px 6px;border:1px solid var(--border);background:var(--bg-muted);display:inline-block;margin-top:4px;word-break:break-all;">${ext.extensionPath}</code>`
                  : html`<br/><code style="font-size:11px;padding:2px 6px;border:1px solid var(--border);background:var(--bg-muted);display:inline-block;margin-top:4px;">apps/chrome-extension/</code>
                    <span style="font-style:italic;"> (relative to milaidy package root)</span>`}
              </li>
              <li style="margin-bottom:6px;">
                Pin the extension icon in Chrome's toolbar
              </li>
              <li>
                Click the extension icon on any tab to attach/detach the Milaidy browser relay
              </li>
            </ol>
          </div>
        </div>

        ${ext?.extensionPath
          ? html`
              <div style="margin-top:12px;padding:8px 12px;border:1px solid var(--border);background:var(--bg-muted);font-family:var(--mono);font-size:11px;word-break:break-all;">
                Extension path: ${ext.extensionPath}
              </div>
            `
          : ""}
      </div>

      <!-- Wallet API Keys Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Wallet API Keys</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">
              Configure API keys for blockchain data providers (balance and NFT fetching).
            </div>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">ALCHEMY_API_KEY</code>
              ${this.walletConfig?.alchemyKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">EVM chain data — <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="ALCHEMY_API_KEY"
                   placeholder="${this.walletConfig?.alchemyKeySet ? "Already set — leave blank to keep" : "Enter Alchemy API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);width:100%;box-sizing:border-box;" />
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">HELIUS_API_KEY</code>
              ${this.walletConfig?.heliusKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">Solana chain data — <a href="https://dev.helius.xyz/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="HELIUS_API_KEY"
                   placeholder="${this.walletConfig?.heliusKeySet ? "Already set — leave blank to keep" : "Enter Helius API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);width:100%;box-sizing:border-box;" />
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">BIRDEYE_API_KEY</code>
              <span style="font-size:10px;color:var(--muted);">optional</span>
              ${this.walletConfig?.birdeyeKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : ""}
            </div>
            <div style="color:var(--muted);font-size:11px;">Solana price data — <a href="https://birdeye.so/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="BIRDEYE_API_KEY"
                   placeholder="${this.walletConfig?.birdeyeKeySet ? "Already set — leave blank to keep" : "Enter Birdeye API key (optional)"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);width:100%;box-sizing:border-box;" />
          </div>
        </div>
        <div style="display:flex;justify-content:flex-end;margin-top:12px;">
          <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                  ?disabled=${this.walletApiKeySaving}
                  style="font-size:11px;padding:4px 14px;margin-top:0;">
            ${this.walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
        </div>
      </div>

      <!-- Agent Export / Import Section -->
      <div style="margin-top:24px;padding:16px;border:1px solid var(--border);background:var(--card);">
        <div style="margin-bottom:16px;">
          <div style="font-weight:bold;font-size:14px;">Agent Export / Import</div>
          <div style="font-size:12px;color:var(--muted);margin-top:2px;">
            Migrate your entire agent (character, memories, chats, secrets, relationships) to another machine.
            The export is password-encrypted.
          </div>
        </div>

        <!-- Export -->
        <div style="padding:12px;border:1px solid var(--border);background:var(--bg-muted);margin-bottom:12px;">
          <div style="font-weight:bold;font-size:13px;margin-bottom:8px;">Export Agent</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <input
                type="password"
                placeholder="Encryption password (min 4 characters)"
                .value=${this.exportPassword}
                @input=${(e: Event) => { this.exportPassword = (e.target as HTMLInputElement).value; }}
                style="flex:1;padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);"
              />
              <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);white-space:nowrap;">
                <input
                  type="checkbox"
                  .checked=${this.exportIncludeLogs}
                  @change=${(e: Event) => { this.exportIncludeLogs = (e.target as HTMLInputElement).checked; }}
                />
                Include logs
              </label>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <button
                class="btn"
                style="font-size:12px;padding:6px 16px;"
                ?disabled=${this.exportBusy || this.exportPassword.length < 4}
                @click=${() => this.handleAgentExport()}
              >${this.exportBusy ? "Exporting..." : "Download Export"}</button>
              ${this.exportError ? html`<span style="font-size:11px;color:var(--danger, #e74c3c);">${this.exportError}</span>` : ""}
              ${this.exportSuccess ? html`<span style="font-size:11px;color:var(--ok, #16a34a);">${this.exportSuccess}</span>` : ""}
            </div>
          </div>
        </div>

        <!-- Import -->
        <div style="padding:12px;border:1px solid var(--border);background:var(--bg-muted);">
          <div style="font-weight:bold;font-size:13px;margin-bottom:8px;">Import Agent</div>
          <div style="display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;align-items:center;gap:8px;">
              <input
                type="file"
                accept=".eliza-agent"
                @change=${(e: Event) => {
                  const input = e.target as HTMLInputElement;
                  this.importFile = input.files?.[0] ?? null;
                  this.importError = null;
                  this.importSuccess = null;
                }}
                style="flex:1;font-size:12px;"
              />
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <input
                type="password"
                placeholder="Decryption password"
                .value=${this.importPassword}
                @input=${(e: Event) => { this.importPassword = (e.target as HTMLInputElement).value; }}
                style="flex:1;padding:6px 10px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);"
              />
              <button
                class="btn"
                style="font-size:12px;padding:6px 16px;"
                ?disabled=${this.importBusy || !this.importFile || this.importPassword.length < 4}
                @click=${() => this.handleAgentImport()}
              >${this.importBusy ? "Importing..." : "Import Agent"}</button>
            </div>
            ${this.importError ? html`<div style="font-size:11px;color:var(--danger, #e74c3c);margin-top:4px;">${this.importError}</div>` : ""}
            ${this.importSuccess ? html`<div style="font-size:11px;color:var(--ok, #16a34a);margin-top:4px;">${this.importSuccess}</div>` : ""}
          </div>
        </div>
      </div>

      <div style="margin-top:48px;padding-top:24px;border-top:1px solid var(--border);">
        <h2 style="color:var(--danger, #e74c3c);">Danger Zone</h2>
        <p class="subtitle">Irreversible actions. Proceed with caution.</p>

        <!-- Export Private Keys -->
        <div style="border:1px solid var(--danger, #e74c3c);padding:16px;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-weight:bold;font-size:14px;">Export Private Keys</div>
              <div style="font-size:12px;color:var(--muted);margin-top:2px;">Reveal your EVM and Solana private keys. Never share these with anyone.</div>
            </div>
            <button
              class="btn"
              style="background:var(--danger, #e74c3c);border-color:var(--danger, #e74c3c);white-space:nowrap;margin-top:0;"
              @click=${() => this.handleExportKeys()}
            >${this.walletExportVisible ? "Hide Keys" : "Export Keys"}</button>
          </div>
          ${this.walletExportVisible && this.walletExportData ? html`
            <div class="key-export-box">
              ${this.walletExportData.evm ? html`
                <div style="margin-bottom:8px;">
                  <strong>EVM Private Key</strong> <span style="color:var(--muted);">(${this.walletExportData.evm.address})</span><br/>
                  <span>${this.walletExportData.evm.privateKey}</span>
                  <button class="copy-btn" style="margin-left:8px;" @click=${() => this.copyToClipboard(this.walletExportData!.evm!.privateKey)}>copy</button>
                </div>
              ` : ""}
              ${this.walletExportData.solana ? html`
                <div>
                  <strong>Solana Private Key</strong> <span style="color:var(--muted);">(${this.walletExportData.solana.address})</span><br/>
                  <span>${this.walletExportData.solana.privateKey}</span>
                  <button class="copy-btn" style="margin-left:8px;" @click=${() => this.copyToClipboard(this.walletExportData!.solana!.privateKey)}>copy</button>
                </div>
              ` : ""}
              ${!this.walletExportData.evm && !this.walletExportData.solana ? html`
                <div style="color:var(--muted);">No wallet keys configured.</div>
              ` : ""}
            </div>
          ` : ""}
        </div>

        <!-- Reset Agent -->
        <div style="border:1px solid var(--danger, #e74c3c);padding:16px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-weight:bold;font-size:14px;">Reset Agent</div>
            <div style="font-size:12px;color:var(--muted);margin-top:2px;">Wipe all config, memory, and data. Returns to the onboarding wizard.</div>
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
      <h2>Logs</h2>
      <p class="subtitle">Agent log output. ${this.logs.length > 0 ? `${this.logs.length} entries.` : ""}</p>

      <!-- Filters row -->
      <div class="log-filters">
        <button class="btn" data-action="refresh-logs" @click=${this.loadLogs} style="font-size:12px;padding:4px 12px;">Refresh</button>

        <select .value=${this.logLevelFilter} @change=${(e: Event) => {
          this.logLevelFilter = (e.target as HTMLSelectElement).value;
          this.loadLogs();
        }}>
          <option value="">All levels</option>
          <option value="debug">Debug</option>
          <option value="info">Info</option>
          <option value="warn">Warn</option>
          <option value="error">Error</option>
        </select>

        <select .value=${this.logSourceFilter} @change=${(e: Event) => {
          this.logSourceFilter = (e.target as HTMLSelectElement).value;
          this.loadLogs();
        }}>
          <option value="">All sources</option>
          ${this.logSources.map((s) => html`<option value=${s}>${s}</option>`)}
        </select>

        ${(this.logTagFilter || this.logLevelFilter || this.logSourceFilter)
          ? html`<button class="btn" style="font-size:11px;padding:3px 10px;" @click=${() => {
              this.logTagFilter = "";
              this.logLevelFilter = "";
              this.logSourceFilter = "";
              this.loadLogs();
            }}>Clear filters</button>`
          : ""}
      </div>

      <!-- Tag pills -->
      ${this.logTags.length > 0
        ? html`
            <div class="log-tag-pills" style="margin-bottom:10px;">
              <span style="font-size:12px;color:var(--muted);margin-right:4px;">Tags:</span>
              <span
                class="log-tag-pill"
                ?data-active=${this.logTagFilter === ""}
                @click=${() => { this.logTagFilter = ""; this.loadLogs(); }}
              >all</span>
              ${this.logTags.map((tag) => html`
                <span
                  class="log-tag-pill"
                  ?data-active=${this.logTagFilter === tag}
                  @click=${() => { this.logTagFilter = tag; this.loadLogs(); }}
                >${tag}</span>
              `)}
            </div>
          `
        : ""}

      <!-- Log entries -->
      <div class="logs-container">
        ${this.logs.length === 0
          ? html`<div class="empty-state">No log entries${this.logTagFilter || this.logLevelFilter || this.logSourceFilter ? " matching filters" : " yet"}.</div>`
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
                    align-items: baseline;
                  ">
                    <span style="color:var(--muted);white-space:nowrap;">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                    <span style="
                      font-weight:600;
                      width:44px;
                      text-transform:uppercase;
                      font-size:11px;
                      color: ${entry.level === "error" ? "var(--danger)" : entry.level === "warn" ? "var(--warn)" : "var(--muted)"};
                    ">${entry.level}</span>
                    <span style="color:var(--muted);width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;">[${entry.source}]</span>
                    <span style="display:inline-flex;gap:2px;flex-shrink:0;">
                      ${(entry.tags ?? []).map((t) => html`<span class="log-tag-badge" data-tag=${t}>${t}</span>`)}
                    </span>
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
      const filter: Record<string, string> = {};
      if (this.logTagFilter) filter.tag = this.logTagFilter;
      if (this.logLevelFilter) filter.level = this.logLevelFilter;
      if (this.logSourceFilter) filter.source = this.logSourceFilter;
      const data = await client.getLogs(
        Object.keys(filter).length > 0 ? filter : undefined,
      );
      this.logs = data.entries;
      // Preserve full source/tag lists even when filtering
      if (data.sources?.length) this.logSources = data.sources;
      if (data.tags?.length) this.logTags = data.tags;
    } catch {
      // silent
    }
  }

  // --- Workbench (legacy full-page render, kept for reference) ---

  private _renderWorkbenchLegacy() {
    if (this.workbenchLoading && !this.workbench) {
      return html`<div class="empty-state">Loading workbench...</div>`;
    }

    const goals = this.workbench?.goals ?? [];
    const todos = this.workbench?.todos ?? [];
    const sortedGoals = this.workbenchGoalSorted(goals);
    const sortedTodos = this.workbenchTodoSorted(todos);
    const activeGoals = sortedGoals.filter((g) => !g.isCompleted);
    const completedGoals = sortedGoals.filter((g) => g.isCompleted);
    const activeTodos = sortedTodos.filter((t) => !t.isCompleted);
    const completedTodos = sortedTodos.filter((t) => t.isCompleted);

    return html`
      <h2>Workbench</h2>
      <p class="subtitle">Goals, tasks, and agent workbench.</p>
      <div style="margin-bottom:12px;">
        <button class="btn" @click=${() => this.loadWorkbench()} style="font-size:12px;padding:4px 12px;">Refresh</button>
      </div>

      <!-- Goal form -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;background:var(--card);">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px;">
          ${this.workbenchEditingGoalId ? "Edit Goal" : "New Goal"}
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input class="plugin-search" placeholder="Goal name" .value=${this.workbenchGoalName}
            @input=${(e: Event) => { this.workbenchGoalName = (e.target as HTMLInputElement).value; }} />
          <input class="plugin-search" placeholder="Description" .value=${this.workbenchGoalDescription}
            @input=${(e: Event) => { this.workbenchGoalDescription = (e.target as HTMLInputElement).value; }} />
          <div style="display:flex;gap:8px;align-items:center;">
            <input class="plugin-search" style="width:120px;" placeholder="Tags (comma)" .value=${this.workbenchGoalTags}
              @input=${(e: Event) => { this.workbenchGoalTags = (e.target as HTMLInputElement).value; }} />
            <label style="font-size:12px;color:var(--text-muted);">Priority</label>
            <select style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--text);font-size:13px;"
              .value=${this.workbenchGoalPriority}
              @change=${(e: Event) => { this.workbenchGoalPriority = (e.target as HTMLSelectElement).value; }}>
              <option value="1">1 (Highest)</option>
              <option value="2">2</option>
              <option value="3">3 (Normal)</option>
              <option value="4">4</option>
              <option value="5">5 (Lowest)</option>
            </select>
            <button class="btn" style="font-size:12px;padding:4px 12px;" @click=${() => this.submitWorkbenchGoalForm()}>
              ${this.workbenchEditingGoalId ? "Update" : "Add"} Goal
            </button>
            ${this.workbenchEditingGoalId
              ? html`<button class="btn" style="font-size:12px;padding:4px 12px;" @click=${() => this.resetWorkbenchGoalForm()}>Cancel</button>`
              : ""}
          </div>
        </div>
      </div>

      <!-- Active goals -->
      <div style="font-weight:600;font-size:14px;margin-bottom:8px;">Goals ${activeGoals.length > 0 ? `(${activeGoals.length})` : ""}</div>
      ${activeGoals.length === 0
        ? html`<div class="empty-state" style="padding:16px;">No active goals.</div>`
        : activeGoals.map(
            (goal) => html`
              <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--card);display:flex;align-items:center;gap:10px;">
                <input type="checkbox" .checked=${false} @change=${() => this.toggleWorkbenchGoal(goal.id, true)} />
                <div style="flex:1;">
                  <div style="font-weight:500;font-size:14px;">${goal.name}</div>
                  ${goal.description ? html`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${goal.description}</div>` : ""}
                  ${goal.tags.length > 0 ? html`<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap;">${goal.tags.map((t) => html`<span style="font-size:11px;padding:1px 6px;border-radius:4px;background:var(--badge-bg,#f1f5f9);color:var(--badge-text,#475569);">${t}</span>`)}</div>` : ""}
                </div>
                <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">P${this.goalPriority(goal) ?? 3}</span>
                <button class="btn" style="font-size:11px;padding:2px 8px;" @click=${() => this.startWorkbenchGoalEdit(goal)}>Edit</button>
              </div>
            `,
          )}

      ${completedGoals.length > 0
        ? html`
            <details style="margin-bottom:16px;">
              <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;margin-bottom:4px;">Completed goals (${completedGoals.length})</summary>
              ${completedGoals.map(
                (goal) => html`
                  <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:4px;background:var(--card);opacity:0.6;display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" .checked=${true} @change=${() => this.toggleWorkbenchGoal(goal.id, false)} />
                    <span style="text-decoration:line-through;font-size:13px;">${goal.name}</span>
                  </div>
                `,
              )}
            </details>
          `
        : ""}

      <!-- Todo form -->
      <div style="border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:16px;margin-top:24px;background:var(--card);">
        <div style="font-weight:600;font-size:14px;margin-bottom:8px;">New Task</div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <input class="plugin-search" placeholder="Task name" .value=${this.workbenchTodoName}
            @input=${(e: Event) => { this.workbenchTodoName = (e.target as HTMLInputElement).value; }} />
          <input class="plugin-search" placeholder="Description" .value=${this.workbenchTodoDescription}
            @input=${(e: Event) => { this.workbenchTodoDescription = (e.target as HTMLInputElement).value; }} />
          <div style="display:flex;gap:8px;align-items:center;">
            <label style="font-size:12px;color:var(--text-muted);">Priority</label>
            <select style="padding:4px 8px;border:1px solid var(--border);border-radius:4px;background:var(--card);color:var(--text);font-size:13px;"
              .value=${this.workbenchTodoPriority}
              @change=${(e: Event) => { this.workbenchTodoPriority = (e.target as HTMLSelectElement).value; }}>
              <option value="1">1 (Highest)</option>
              <option value="2">2</option>
              <option value="3">3 (Normal)</option>
              <option value="4">4</option>
              <option value="5">5 (Lowest)</option>
            </select>
            <label style="font-size:12px;display:flex;align-items:center;gap:4px;">
              <input type="checkbox" .checked=${this.workbenchTodoUrgent}
                @change=${(e: Event) => { this.workbenchTodoUrgent = (e.target as HTMLInputElement).checked; }} />
              Urgent
            </label>
            <button class="btn" style="font-size:12px;padding:4px 12px;" @click=${() => this.createWorkbenchTodoQuick()}>Add Task</button>
          </div>
        </div>
      </div>

      <!-- Active todos -->
      <div style="font-weight:600;font-size:14px;margin-bottom:8px;">Tasks ${activeTodos.length > 0 ? `(${activeTodos.length})` : ""}</div>
      ${activeTodos.length === 0
        ? html`<div class="empty-state" style="padding:16px;">No active tasks.</div>`
        : activeTodos.map(
            (todo) => html`
              <div style="border:1px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:8px;background:var(--card);display:flex;align-items:center;gap:10px;">
                <input type="checkbox" .checked=${false} @change=${() => this.toggleWorkbenchTodo(todo.id, true)} />
                <div style="flex:1;">
                  <div style="font-weight:500;font-size:14px;">
                    ${todo.isUrgent ? html`<span style="color:#dc2626;font-weight:700;margin-right:4px;">!</span>` : ""}
                    ${todo.name}
                  </div>
                  ${todo.description ? html`<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">${todo.description}</div>` : ""}
                </div>
                <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;">P${todo.priority ?? 3}</span>
              </div>
            `,
          )}

      ${completedTodos.length > 0
        ? html`
            <details>
              <summary style="font-size:12px;color:var(--text-muted);cursor:pointer;margin-bottom:4px;">Completed tasks (${completedTodos.length})</summary>
              ${completedTodos.map(
                (todo) => html`
                  <div style="border:1px solid var(--border);border-radius:8px;padding:8px 12px;margin-bottom:4px;background:var(--card);opacity:0.6;display:flex;align-items:center;gap:10px;">
                    <input type="checkbox" .checked=${true} @change=${() => this.toggleWorkbenchTodo(todo.id, false)} />
                    <span style="text-decoration:line-through;font-size:13px;">${todo.name}</span>
                  </div>
                `,
              )}
            </details>
          `
        : ""}
    `;
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
          ${this.onboardingStep === "welcome" ? this.renderOnboardingWelcome() : ""}
          ${this.onboardingStep === "name" ? this.renderOnboardingName(opts) : ""}
          ${this.onboardingStep === "style" ? this.renderOnboardingStyle(opts) : ""}
          ${this.onboardingStep === "theme" ? this.renderOnboardingTheme() : ""}
          ${this.onboardingStep === "runMode" ? this.renderOnboardingRunMode() : ""}
          ${this.onboardingStep === "cloudProvider" ? this.renderOnboardingCloudProvider(opts) : ""}
          ${this.onboardingStep === "modelSelection" ? this.renderOnboardingModelSelection(opts) : ""}
          ${this.onboardingStep === "llmProvider" ? this.renderOnboardingLlmProvider(opts) : ""}
          ${this.onboardingStep === "inventorySetup" ? this.renderOnboardingInventory(opts) : ""}
        </div>
      </div>
    `;
  }

  private renderOnboardingWelcome() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" />
      <h1 class="onboarding-welcome-title">Welcome to milAIdy!</h1>
      <p class="onboarding-welcome-sub">The agent of choice for network spiritualists</p>
      <button class="btn" @click=${this.handleOnboardingNext}>Continue</button>
    `;
  }

  private renderOnboardingName(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">errr, what was my name again...?</div>
      <div class="onboarding-options">
        ${opts.names.map(
          (name) => html`
            <div
              class="onboarding-option ${this.onboardingName === name ? "selected" : ""}"
              @click=${() => { this.onboardingName = name; }}
            >
              <div class="label">${name}</div>
            </div>
          `,
        )}
        <div
          class="onboarding-option ${this.onboardingName && !opts.names.includes(this.onboardingName) ? "selected" : ""}"
          @click=${(e: Event) => {
            const input = (e.currentTarget as HTMLElement).querySelector("input");
            if (input) input.focus();
          }}
        >
          <input
            type="text"
            placeholder="Or type a custom name..."
            .value=${opts.names.includes(this.onboardingName) ? "" : this.onboardingName}
            @input=${(e: Event) => { this.onboardingName = (e.target as HTMLInputElement).value; }}
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
      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingName.trim()}
        >Next</button>
      </div>
    `;
  }

  private renderOnboardingStyle(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">so what's the vibe here?</div>
      <div class="onboarding-options">
        ${opts.styles.map(
          (style) => html`
            <div
              class="onboarding-option ${this.onboardingStyle === style.catchphrase ? "selected" : ""}"
              @click=${() => { this.onboardingStyle = style.catchphrase; }}
            >
              <div class="label">${style.catchphrase}</div>
              <div class="hint">${style.hint}</div>
            </div>
          `,
        )}
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingStyle}
        >Next</button>
      </div>
    `;
  }

  private renderOnboardingTheme() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">pick a vibe</div>
      <div class="onboarding-options" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
        ${THEMES.map(t => html`
          <div
            class="onboarding-option ${this.onboardingTheme === t.id ? "selected" : ""}"
            @click=${() => { this.onboardingTheme = t.id; this.setTheme(t.id); }}
            style="text-align:center;padding:14px 8px;"
          >
            <div class="label">${t.label}</div>
          </div>
        `)}
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button class="btn" @click=${this.handleOnboardingNext}>Next</button>
      </div>
    `;
  }

  private renderOnboardingRunMode() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">where should I run?</div>
      <div class="onboarding-options">
        <div
          class="onboarding-option ${this.onboardingRunMode === "local" ? "selected" : ""}"
          @click=${() => { this.onboardingRunMode = "local"; }}
        >
          <div class="label">Local</div>
          <div class="hint">Run on this device. You configure your own LLM provider and wallets.</div>
        </div>
        <div
          class="onboarding-option ${this.onboardingRunMode === "cloud" ? "selected" : ""}"
          @click=${() => { this.onboardingRunMode = "cloud"; }}
        >
          <div class="label">Cloud</div>
          <div class="hint">Run in the cloud. Wallets, LLMs, and RPCs managed for you.</div>
        </div>
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingRunMode}
        >Next</button>
      </div>
    `;
  }

  private renderOnboardingCloudProvider(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">which cloud provider?</div>
      <div class="onboarding-options">
        ${opts.cloudProviders.map(
          (cp) => html`
            <div
              class="onboarding-option ${this.onboardingCloudProvider === cp.id ? "selected" : ""}"
              @click=${() => { this.onboardingCloudProvider = cp.id; }}
            >
              <div class="label">${cp.name}</div>
              <div class="hint">${cp.description}</div>
            </div>
          `,
        )}
      </div>
      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingCloudProvider}
        >Next</button>
      </div>
    `;
  }

  private renderOnboardingModelSelection(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">pick your models</div>

      <div style="text-align:left;margin-bottom:16px;">
        <label style="font-size:13px;font-weight:bold;color:var(--text-strong);display:block;margin-bottom:8px;">Small Model <span style="font-weight:normal;color:var(--muted);">(fast tasks)</span></label>
        <div class="onboarding-options">
          ${opts.models.small.map(
            (m) => html`
              <div
                class="onboarding-option ${this.onboardingSmallModel === m.id ? "selected" : ""}"
                @click=${() => { this.onboardingSmallModel = m.id; }}
              >
                <div class="label">${m.name}</div>
                <div class="hint">${m.description}</div>
              </div>
            `,
          )}
        </div>
      </div>

      <div style="text-align:left;margin-bottom:8px;">
        <label style="font-size:13px;font-weight:bold;color:var(--text-strong);display:block;margin-bottom:8px;">Large Model <span style="font-weight:normal;color:var(--muted);">(complex reasoning)</span></label>
        <div class="onboarding-options">
          ${opts.models.large.map(
            (m) => html`
              <div
                class="onboarding-option ${this.onboardingLargeModel === m.id ? "selected" : ""}"
                @click=${() => { this.onboardingLargeModel = m.id; }}
              >
                <div class="label">${m.name}</div>
                <div class="hint">${m.description}</div>
              </div>
            `,
          )}
        </div>
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button class="btn" @click=${this.handleOnboardingNext}>Finish</button>
      </div>
    `;
  }

  private renderOnboardingLlmProvider(opts: OnboardingOptions) {
    const selected = opts.providers.find((p) => p.id === this.onboardingProvider);
    const needsKey = selected && selected.envKey && selected.id !== "elizacloud" && selected.id !== "ollama";
    const freeProvider = opts.providers.find((p) => p.id === "elizacloud");
    const paidProviders = opts.providers.filter((p) => p.id !== "elizacloud");

    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">which AI provider do you want to use?</div>

      <div class="onboarding-options onboarding-options-scroll">
        ${freeProvider ? html`
          <div
            class="onboarding-option ${this.onboardingProvider === "elizacloud" ? "selected" : ""}"
            @click=${() => { this.onboardingProvider = "elizacloud"; this.onboardingApiKey = ""; }}
            style="position:relative;"
          >
            <div style="display:flex;align-items:center;justify-content:space-between;">
              <div class="label">${freeProvider.name}</div>
              <span style="font-size:10px;text-transform:uppercase;letter-spacing:0.06em;padding:2px 8px;background:var(--accent);color:var(--bg);font-weight:bold;">free</span>
            </div>
            <div class="hint">${freeProvider.description}</div>
          </div>
        ` : ""}

        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;">
          ${paidProviders.map(
            (provider) => html`
              <div
                class="onboarding-option ${this.onboardingProvider === provider.id ? "selected" : ""}"
                @click=${() => { this.onboardingProvider = provider.id; this.onboardingApiKey = ""; }}
              >
                <div class="label">${provider.name}</div>
                <div class="hint">${provider.description}</div>
              </div>
            `,
          )}
        </div>
      </div>

      ${needsKey && selected
        ? html`
            <div style="margin-top:12px;padding:12px 14px;border:1px solid var(--border);background:var(--card);">
              <label style="display:block;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;color:var(--muted);margin-bottom:6px;">${selected.name} API Key</label>
              <input
                class="onboarding-input"
                type="password"
                placeholder="${selected.keyPrefix ? `${selected.keyPrefix}...` : "Paste your API key"}"
                .value=${this.onboardingApiKey}
                @input=${(e: Event) => { this.onboardingApiKey = (e.target as HTMLInputElement).value; }}
                style="margin-top:0;"
              />
            </div>
          `
        : ""}

      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button
          class="btn"
          @click=${this.handleOnboardingNext}
          ?disabled=${!this.onboardingProvider || (needsKey && !this.onboardingApiKey.trim())}
        >Next</button>
      </div>
    `;
  }

  private renderOnboardingInventory(opts: OnboardingOptions) {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:100px;height:100px;" />
      <div class="onboarding-speech">want to set up wallets?</div>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px;">Select which chains to enable and pick an RPC provider for each. You can skip this and set it up later.</p>

      <div class="onboarding-options onboarding-options-scroll" style="text-align:left;">
        ${opts.inventoryProviders.map(
          (inv: InventoryProviderOption) => html`
            <div class="inventory-chain-block">
              <div
                class="onboarding-option ${this.onboardingSelectedChains.has(inv.id) ? "selected" : ""}"
                @click=${() => {
                  const next = new Set(this.onboardingSelectedChains);
                  if (next.has(inv.id)) { next.delete(inv.id); } else { next.add(inv.id); }
                  this.onboardingSelectedChains = next;
                }}
              >
                <div class="label">${inv.name}</div>
                <div class="hint">${inv.description}</div>
              </div>
              ${this.onboardingSelectedChains.has(inv.id) ? html`
                <div style="margin-top:8px;margin-left:16px;">
                  <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.05em;">RPC Provider</label>
                  <div class="onboarding-options" style="margin-top:4px;gap:4px;">
                    ${inv.rpcProviders.map(
                      (rpc) => html`
                        <div
                          class="onboarding-option ${(this.onboardingRpcSelections[inv.id] || "elizacloud") === rpc.id ? "selected" : ""}"
                          @click=${() => { this.onboardingRpcSelections = { ...this.onboardingRpcSelections, [inv.id]: rpc.id }; }}
                          style="padding:8px 12px;"
                        >
                          <div class="label" style="font-size:13px;">${rpc.name}</div>
                          <div class="hint">${rpc.description}</div>
                        </div>
                      `,
                    )}
                  </div>
                  ${(() => {
                    const selRpc = inv.rpcProviders.find((r) => r.id === (this.onboardingRpcSelections[inv.id] || "elizacloud"));
                    if (selRpc && selRpc.requiresKey) {
                      const keyId = `${inv.id}:${selRpc.id}`;
                      return html`
                        <input
                          class="onboarding-input"
                          type="password"
                          placeholder="${selRpc.name} API Key"
                          .value=${this.onboardingRpcKeys[keyId] || ""}
                          @input=${(e: Event) => { this.onboardingRpcKeys = { ...this.onboardingRpcKeys, [keyId]: (e.target as HTMLInputElement).value }; }}
                          style="margin-top:6px;"
                        />
                      `;
                    }
                    return "";
                  })()}
                </div>
              ` : ""}
            </div>
          `,
        )}
      </div>

      <div class="btn-row">
        <button class="btn btn-outline" @click=${() => this.handleOnboardingBack()}>Back</button>
        <button class="btn btn-outline" @click=${() => this.handleOnboardingFinish()}>Skip</button>
        <button class="btn" @click=${this.handleOnboardingNext}>Finish</button>
      </div>
    `;
  }

  // --- Theme Management ---

  private initializeTheme(): void {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    // Migrate legacy light/dark values
    if (saved === "light") {
      this.currentTheme = "milady";
    } else if (saved === "dark") {
      this.currentTheme = "web2000";
    } else if (saved && VALID_THEMES.has(saved)) {
      this.currentTheme = saved as ThemeName;
    } else {
      // Default: use milady for light preference, web2000 for dark
      this.currentTheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "web2000"
        : "milady";
    }
    this.onboardingTheme = this.currentTheme;
    this.applyTheme();
    // Detect mobile device for onboarding flow
    this.isMobileDevice = this.detectMobile();
  }

  private applyTheme(): void {
    document.documentElement.setAttribute("data-theme", this.currentTheme);
  }

  private setTheme(theme: ThemeName): void {
    this.currentTheme = theme;
    this.applyTheme();
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "milaidy-app": MilaidyApp;
  }
}
