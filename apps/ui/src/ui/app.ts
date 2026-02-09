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
  type ChatMessage,
  type PluginInfo,
  type SkillInfo,
  type LogEntry,
  type OnboardingOptions,
  type ExtensionStatus,
  type WalletAddresses,
  type WalletBalancesResponse,
  type WalletNftsResponse,
  type WalletConfigStatus,
  type WalletExportResult,
} from "./api-client.js";
import { tabFromPath, pathForTab, type Tab, TAB_GROUPS, titleForTab } from "./navigation.js";
import { getProviderLogo } from "./provider-logos.js";

const CHAT_STORAGE_KEY = "milaidy:chatMessages";
const THEME_STORAGE_KEY = "milaidy:theme";

@customElement("milaidy-app")
export class MilaidyApp extends LitElement {
  // --- State ---
  @state() tab: Tab = "chat";
  @state() isDarkMode: boolean = true;
  @state() connected = false;
  @state() agentStatus: AgentStatus | null = null;
  @state() onboardingComplete = false;
  @state() onboardingLoading = true;
  @state() chatMessages: ChatMessage[] = [];
  @state() chatInput = "";
  @state() chatSending = false;
  @state() plugins: PluginInfo[] = [];
  @state() pluginViewMode: "active" | "core" | "all" = "active";
  @state() pluginFilter: "all" | "ai-provider" | "connector" | "database" | "feature" = "all";
  @state() pluginSearch = "";
  @state() pluginSettingsOpen: Set<string> = new Set();
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

  // Onboarding wizard state
  @state() onboardingStep = 0;
  @state() onboardingOptions: OnboardingOptions | null = null;
  @state() onboardingName = "";
  @state() onboardingStyle = "";
  @state() onboardingProvider = "";
  @state() onboardingApiKey = "";
  @state() onboardingTelegramToken = "";
  @state() onboardingDiscordToken = "";
  @state() onboardingAlchemyKey = "";
  @state() onboardingHeliusKey = "";
  @state() showApiKeyModal = false;
  @state() showProviderConfirmModal = false;

  // Config state
  @state() configRaw: unknown = null;
  @state() configText = "";

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      font-family: var(--font-body);
      color: var(--text);
      background: var(--bg);
    }

    /* Layout */
    .app-shell {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      height: 100vh;
      max-width: 900px;
      margin: 0 auto;
      padding: 0 20px;
      width: 100%;
      box-sizing: border-box;
      overflow: hidden;
    }

    .app-shell.onboarding-active {
      overflow: visible;
      height: auto;
      min-height: 100vh;
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

    /* Theme toggle */
    .theme-toggle {
      padding: 8px;
      border: 1px solid var(--border);
      background: var(--bg);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: var(--radius-sm);
      transition: all var(--duration-fast) ease;
    }

    .theme-toggle:hover {
      border-color: var(--accent);
      color: var(--accent);
    }

    .theme-toggle:focus-visible {
      outline: 2px solid var(--accent);
      outline-offset: 1px;
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
      flex: 1 1 auto;
      min-height: 0;
      padding: 24px 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
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

    /* When config is active, prevent double scrollbar - only config-container scrolls */
    main.config-active {
      flex: 1 1 auto;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      padding: 0;
      min-height: 0;
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
      padding-bottom: 40px;
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
      box-sizing: border-box;
    }

    .onboarding-input:focus {
      border-color: var(--accent);
      outline: none;
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

    /* New onboarding styles - provider cards & wallet setup */
    .onboarding-provider-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 12px;
      margin-bottom: 24px;
      text-align: left;
    }

    @media (max-width: 640px) {
      .onboarding-provider-grid {
        grid-template-columns: 1fr;
      }
    }

    .provider-card {
      padding: 20px;
      border: 1.5px solid var(--border);
      border-radius: var(--radius-lg);
      background: var(--card);
      cursor: pointer;
      transition: all var(--duration-normal) var(--ease-out, ease-out);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .provider-card:hover {
      border-color: var(--border-hover);
      background: var(--bg-hover);
      box-shadow: var(--shadow-md);
      transform: translateY(-1px);
    }

    .provider-card.selected {
      border-color: var(--accent);
      background: var(--accent-subtle);
      box-shadow: 0 0 0 3px var(--accent-subtle), var(--shadow-md);
    }

    .provider-card-header {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .provider-logo {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      object-fit: contain;
      background: var(--bg-muted);
      padding: 6px;
      flex-shrink: 0;
    }

    .provider-name {
      font-size: 16px;
      font-weight: 600;
      color: var(--text-strong);
    }

    .provider-description {
      font-size: 13px;
      color: var(--muted-strong);
      line-height: 1.5;
    }

    /* Modal for API key input */
    .modal-backdrop {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }

    .modal-content {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 24px;
      max-width: 450px;
      width: 90%;
      box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.3), 0 8px 10px -6px rgb(0 0 0 / 0.3);
      animation: slideUp 0.2s ease-out;
    }

    @keyframes slideUp {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .modal-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .modal-header img {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-md);
      object-fit: contain;
      background: var(--bg-muted);
      padding: 6px;
    }

    .modal-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--text-strong);
    }

    .modal-description {
      font-size: 13px;
      color: var(--muted-strong);
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .modal-actions {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
      margin-top: 20px;
    }

    .btn-primary {
      padding: 10px 24px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 500;
      background: var(--accent);
      color: var(--accent-foreground);
      border: 1px solid var(--accent);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-out, ease-out);
    }

    .btn-primary:hover:not(:disabled) {
      background: var(--accent-hover);
      box-shadow: var(--shadow-md);
    }

    .btn-secondary {
      padding: 10px 24px;
      border-radius: var(--radius-md);
      font-size: 14px;
      font-weight: 500;
      background: transparent;
      color: var(--text);
      border: 1.5px solid var(--border-strong);
      cursor: pointer;
      transition: all var(--duration-fast) var(--ease-out, ease-out);
    }

    .btn-secondary:hover:not(:disabled) {
      background: var(--bg-hover);
      border-color: var(--border-hover);
    }

    .onboarding-actions {
      display: flex;
      justify-content: space-between;
      margin-top: 32px;
      gap: 12px;
    }

    @media (max-width: 640px) {
      .onboarding-actions {
        flex-direction: column;
      }
    }

    .wallet-info-card {
      padding: 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      margin-bottom: 20px;
      text-align: left;
    }

    .wallet-api-input-card {
      padding: 16px;
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      margin-bottom: 12px;
      text-align: left;
    }

    .wallet-api-input-card label {
      display: block;
      font-size: 14px;
      font-weight: 600;
      color: var(--text-strong);
      margin-bottom: 8px;
    }

    .wallet-api-input-card .description {
      font-size: 12px;
      color: var(--muted-strong);
      margin-bottom: 12px;
    }

    /* Config */
    .config-container {
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1 1 auto;
      min-height: 0;
      height: 100%;
      padding: 24px 0;
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

    .chat-input-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      border-top: 1px solid var(--border);
      padding-top: 12px;
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

    /* Collapsible settings */
    .plugin-settings-toggle {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid var(--border);
      cursor: pointer;
      font-size: 12px;
      font-weight: 600;
      user-select: none;
    }

    .plugin-settings-toggle:hover {
      opacity: 0.8;
    }

    .plugin-settings-toggle .settings-chevron {
      display: inline-block;
      transition: transform 0.15s ease;
      font-size: 10px;
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
      border: 1px solid var(--border);
    }

    .plugin-settings-body input {
      padding: 6px 10px;
      border: 1px solid var(--border);
      background: var(--card);
      font-size: 12px;
      font-family: var(--mono);
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
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.initializeTheme();
    this.initializeApp();
    window.addEventListener("popstate", this.handlePopState);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("popstate", this.handlePopState);
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

    // Restore persisted chat messages
    this.loadChatMessages();

    // Connect WebSocket for real-time status updates
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

    // Load tab from URL and trigger data loading for it
    const tab = tabFromPath(window.location.pathname);
    if (tab) {
      this.tab = tab;
      if (tab === "inventory") this.loadInventory();
      if (tab === "plugins") this.loadPlugins();
      if (tab === "skills") this.loadSkills();
      if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); }
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
    if (tab === "config") { this.checkExtensionStatus(); this.loadWalletConfig(); }
    if (tab === "logs") this.loadLogs();
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
      this.onboardingStep = 0;
      this.onboardingName = "";
      this.onboardingStyle = "";
      this.onboardingProvider = "";
      this.onboardingApiKey = "";
      this.onboardingTelegramToken = "";
      this.onboardingDiscordToken = "";
      this.chatMessages = [];
      localStorage.removeItem(CHAT_STORAGE_KEY);
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

  // --- Chat ---

  private handleChatSend(): void {
    const text = this.chatInput.trim();
    if (!text || this.chatSending) return;

    this.chatMessages = [
      ...this.chatMessages,
      { role: "user", text, timestamp: Date.now() },
    ];
    this.chatInput = "";
    this.chatSending = true;
    this.saveChatMessages();

    // Use REST endpoint — reliable and always reaches the server (WebSocket
    // chat silently drops messages when the connection is not established).
    client.sendChatRest(text).then(
      (data) => {
        this.chatMessages = [
          ...this.chatMessages,
          { role: "assistant", text: data.text, timestamp: Date.now() },
        ];
        this.chatSending = false;
        this.saveChatMessages();
      },
      () => {
        this.chatSending = false;
      },
    );

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
      this.handleChatSend();
    }
  }

  private saveChatMessages(): void {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(this.chatMessages));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  private loadChatMessages(): void {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed: ChatMessage[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this.chatMessages = parsed;
        }
      }
    } catch {
      // Corrupt data — start fresh
    }
  }

  private handleChatClear(): void {
    this.chatMessages = [];
    localStorage.removeItem(CHAT_STORAGE_KEY);
  }

  // --- Onboarding ---

  private async handleOnboardingNext(): Promise<void> {
    this.onboardingStep += 1;
  }

  private handleOnboardingSkip(step: number): void {
    if (step === 1) {
      // Skip name: use default
      this.onboardingName = "milAIdy";
      this.onboardingStep++;
    } else if (step === 2) {
      // Skip provider: default to elizacloud
      this.onboardingProvider = "elizacloud";
      this.onboardingApiKey = "";
      this.onboardingStep++;
    } else if (step === 3) {
      // Skip wallet: proceed to finish
      this.onboardingAlchemyKey = "";
      this.onboardingHeliusKey = "";
      this.handleOnboardingFinish();
    }
  }

  private async handleOnboardingFinish(): Promise<void> {
    if (!this.onboardingOptions) return;

    // Default to "Noted." style if none selected
    const style = this.onboardingOptions.styles.find(
      (s) => s.catchphrase === this.onboardingStyle,
    ) || this.onboardingOptions.styles.find((s) => s.catchphrase === "Noted.");

    const systemPrompt = style?.system
      ? style.system.replace(/\{name\}/g, this.onboardingName)
      : `You are ${this.onboardingName}, an autonomous AI agent powered by ElizaOS. ${this.onboardingOptions.sharedStyleRules}`;

    await client.submitOnboarding({
      name: this.onboardingName,
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
      walletApiKeys: {
        ALCHEMY_API_KEY: this.onboardingAlchemyKey || undefined,
        HELIUS_API_KEY: this.onboardingHeliusKey || undefined,
      },
    });

    this.onboardingComplete = true;

    // Restart the agent so the runtime picks up the new config
    // (name, provider keys, etc.) that was just saved by submitOnboarding.
    try {
      this.agentStatus = await client.restartAgent();
    } catch { /* ignore */ }
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
        ${this.renderHeader()}
        ${this.renderNav()}
        <main class=${this.tab === "chat" ? "chat-active" : this.tab === "config" ? "config-active" : ""}>${this.renderView()}</main>
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

  private renderHeader() {
    const status = this.agentStatus;
    const state = status?.state ?? "not_started";
    const name = status?.agentName ?? "Milaidy";

    return html`
      <header>
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="logo">${name}</span>
          ${this.renderWalletIcon()}
        </div>
        <div style="display:flex;align-items:center;gap:12px;">
          ${this.renderThemeToggle()}
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
        </div>
      </header>
    `;
  }

  private renderThemeToggle() {
    return html`
      <button
        class="theme-toggle"
        @click=${this.toggleTheme}
        title=${this.isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
        aria-label=${this.isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
      >
        ${this.isDarkMode 
          ? html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"/>
              <path d="m12 1 1.5 1.5M12 1l-1.5 1.5M21 12l-1.5 1.5M21 12l1.5 1.5M12 21l-1.5-1.5M12 21l1.5-1.5M3 12l1.5-1.5M3 12l-1.5-1.5"/>
            </svg>` 
          : html`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
            </svg>`
        }
      </button>
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

  private renderView() {
    switch (this.tab) {
      case "chat": return this.renderChat();
      case "inventory": return this.renderInventory();
      case "plugins": return this.renderPlugins();
      case "skills": return this.renderSkills();
      case "config": return this.renderConfig();
      case "logs": return this.renderLogs();
      default: return this.renderChat();
    }
  }

  private renderChat() {
    const state = this.agentStatus?.state ?? "not_started";

    if (state === "not_started" || state === "stopped") {
      return html`
        <h2>Chat</h2>
        <div class="start-agent-box">
          <p>Agent is not running. Start it to begin chatting.</p>
          <button class="btn" @click=${this.handleStart}>Start Agent</button>
        </div>
      `;
    }

    return html`
      <div class="chat-container">
        <div class="chat-header-row">
          <h2 style="margin:0;">Chat</h2>
          ${this.chatMessages.length > 0
            ? html`<button class="clear-btn" @click=${this.handleChatClear}>Clear</button>`
            : ""}
        </div>
        <div class="chat-messages">
          ${this.chatMessages.length === 0
            ? html`<div class="empty-state">Send a message to start chatting.</div>`
            : this.chatMessages.map(
                (msg) => html`
                  <div class="chat-msg ${msg.role}">
                    <div class="role">${msg.role === "user" ? "You" : this.agentStatus?.agentName ?? "Agent"}</div>
                    <div>${msg.text}</div>
                  </div>
                `,
              )}
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
    const categories = ["all", "ai-provider", "connector", "database", "feature"] as const;
    const categoryLabels: Record<string, string> = {
      "all": "All",
      "ai-provider": "AI Provider",
      "connector": "Connector",
      "database": "Database",
      "feature": "Feature",
    };

    // Filter by view mode first
    let pluginsByMode = this.plugins;
    if (this.pluginViewMode === "active") {
      pluginsByMode = this.plugins.filter((p) => p.isActive);
    } else if (this.pluginViewMode === "core") {
      pluginsByMode = this.plugins.filter((p) => p.isCore);
    }

    const searchLower = this.pluginSearch.toLowerCase();
    const filtered = pluginsByMode.filter((p) => {
      const matchesCategory = this.pluginFilter === "all" || p.category === this.pluginFilter;
      const matchesSearch = !searchLower
        || p.name.toLowerCase().includes(searchLower)
        || (p.description ?? "").toLowerCase().includes(searchLower)
        || p.id.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    });

    const toggleSettings = (pluginId: string) => {
      const next = new Set(this.pluginSettingsOpen);
      if (next.has(pluginId)) {
        next.delete(pluginId);
      } else {
        next.add(pluginId);
      }
      this.pluginSettingsOpen = next;
    };

    const activeCount = this.plugins.filter((p) => p.isActive).length;
    const coreCount = this.plugins.filter((p) => p.isCore).length;

    return html`
      <div style="flex-shrink: 0;">
        <h2>Plugins</h2>
        <p class="subtitle">Manage plugins and integrations. ${this.plugins.length} plugins discovered.</p>

        <!-- View Mode Tabs -->
        <div style="display:flex;gap:8px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:8px;">
          <button
            class="view-mode-tab ${this.pluginViewMode === "active" ? "active" : ""}"
            @click=${() => { this.pluginViewMode = "active"; }}
            style="
              padding: 8px 16px;
              border: none;
              background: ${this.pluginViewMode === "active" ? "var(--accent)" : "transparent"};
              color: ${this.pluginViewMode === "active" ? "#fff" : "var(--text)"};
              cursor: pointer;
              font-weight: ${this.pluginViewMode === "active" ? "600" : "400"};
              border-radius: 6px;
              transition: all 0.2s;
            "
          >
            Active (${activeCount})
          </button>
          <button
            class="view-mode-tab ${this.pluginViewMode === "core" ? "active" : ""}"
            @click=${() => { this.pluginViewMode = "core"; }}
            style="
              padding: 8px 16px;
              border: none;
              background: ${this.pluginViewMode === "core" ? "var(--accent)" : "transparent"};
              color: ${this.pluginViewMode === "core" ? "#fff" : "var(--text)"};
              cursor: pointer;
              font-weight: ${this.pluginViewMode === "core" ? "600" : "400"};
              border-radius: 6px;
              transition: all 0.2s;
            "
          >
            Core (${coreCount})
          </button>
          <button
            class="view-mode-tab ${this.pluginViewMode === "all" ? "active" : ""}"
            @click=${() => { this.pluginViewMode = "all"; }}
            style="
              padding: 8px 16px;
              border: none;
              background: ${this.pluginViewMode === "all" ? "var(--accent)" : "transparent"};
              color: ${this.pluginViewMode === "all" ? "#fff" : "var(--text)"};
              cursor: pointer;
              font-weight: ${this.pluginViewMode === "all" ? "600" : "400"};
              border-radius: 6px;
              transition: all 0.2s;
            "
          >
            All (${this.plugins.length})
          </button>
        </div>

        <input
          class="plugin-search"
          type="text"
          placeholder="Search plugins by name or description..."
          .value=${this.pluginSearch}
          @input=${(e: Event) => { this.pluginSearch = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div class="plugins-scroll-container">
        <div class="plugin-filters" style="display:flex;gap:6px;margin-bottom:14px;flex-wrap:wrap;">
          ${categories.map(
            (cat) => html`
              <button
                class="filter-btn ${this.pluginFilter === cat ? "active" : ""}"
                data-category=${cat}
                @click=${() => { this.pluginFilter = cat; }}
                style="
                  padding: 4px 12px;
                  border-radius: 12px;
                  border: 1px solid var(--border);
                  background: ${this.pluginFilter === cat ? "var(--accent)" : "var(--surface)"};
                  color: ${this.pluginFilter === cat ? "#fff" : "var(--text)"};
                  cursor: pointer;
                  font-size: 12px;
                "
              >${cat === "all" ? `All (${this.plugins.length})` : `${categoryLabels[cat]} (${this.plugins.filter((p) => p.category === cat).length})`}</button>
            `,
          )}
        </div>

        ${filtered.length === 0
          ? html`<div class="empty-state">${this.pluginSearch ? "No plugins match your search." : "No plugins in this category."}</div>`
          : html`
              <div class="plugin-list">
              ${filtered.map((p) => {
                const hasParams = p.parameters && p.parameters.length > 0;
                const allParamsSet = hasParams ? p.parameters.every((param) => param.isSet) : true;
                const settingsOpen = this.pluginSettingsOpen.has(p.id);
                const setCount = hasParams ? p.parameters.filter((param) => param.isSet).length : 0;
                const totalCount = hasParams ? p.parameters.length : 0;

                return html`
                  <div class="plugin-item" data-plugin-id=${p.id} style="flex-direction:column;align-items:stretch;">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                      <div style="flex:1;min-width:0;">
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                          <div class="plugin-name">${p.name}</div>
                          <span style="font-size:10px;padding:2px 6px;border-radius:8px;background:var(--surface);border:1px solid var(--border);color:var(--muted);">${
                            p.category === "ai-provider" ? "ai provider"
                            : p.category === "connector" ? "connector"
                            : p.category === "database" ? "database"
                            : "feature"
                          }</span>
                          ${p.isCore ? html`
                            <span style="font-size:9px;padding:2px 6px;border-radius:6px;background:#ff6b35;color:#fff;font-weight:600;letter-spacing:0.5px;">
                              CORE
                            </span>
                          ` : ""}
                          ${p.isActive ? html`
                            <span style="font-size:9px;padding:2px 6px;border-radius:6px;background:#4CAF50;color:#fff;font-weight:600;letter-spacing:0.5px;">
                              ACTIVE
                            </span>
                          ` : ""}
                        </div>
                        <div class="plugin-desc">${p.description || "No description"}</div>
                      </div>
                      <div style="display:flex;align-items:center;gap:8px;">
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
                      </div>
                    </div>

                    ${hasParams
                      ? html`
                          <div
                            class="plugin-settings-toggle"
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
                                        <input
                                          type="${param.sensitive ? "password" : "text"}"
                                          .value=${param.isSet && !param.sensitive ? (param.currentValue ?? "") : (param.isSet ? "" : (param.default ?? ""))}
                                          placeholder="${param.sensitive && param.isSet ? "********  (already set, leave blank to keep)" : "Enter value..."}"
                                          data-plugin-param="${p.id}:${param.key}"
                                        />
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

                    ${p.enabled && p.validationErrors && p.validationErrors.length > 0
                      ? html`
                          <div style="margin-top:8px;padding:8px 10px;border:1px solid #e74c3c;background:rgba(231,76,60,0.06);font-size:12px;">
                            ${p.validationErrors.map(
                              (err) => html`<div style="color:#e74c3c;">${err.field}: ${err.message}</div>`,
                            )}
                          </div>
                        `
                      : ""
                    }
                    ${p.enabled && p.validationWarnings && p.validationWarnings.length > 0
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

  private async handlePluginConfigSave(pluginId: string): Promise<void> {
    // Collect all input values for this plugin from the DOM
    const inputs = this.shadowRoot?.querySelectorAll(`input[data-plugin-param^="${pluginId}:"]`);
    if (!inputs) return;

    const config: Record<string, string> = {};
    for (const input of inputs) {
      const attr = input.getAttribute("data-plugin-param") ?? "";
      const key = attr.split(":").slice(1).join(":");
      const value = (input as HTMLInputElement).value.trim();
      if (value) {
        config[key] = value;
      }
    }

    if (Object.keys(config).length === 0) return;

    try {
      await client.updatePlugin(pluginId, { config });
      // Reload plugins to get updated validation and current values
      await this.loadPlugins();
    } catch (err) {
      console.error("Failed to save plugin config:", err);
    }
  }

  private async handlePluginToggle(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.find((p) => p.id === pluginId);

    // Block enabling if there are validation errors (missing required params)
    if (enabled && plugin?.validationErrors && plugin.validationErrors.length > 0) {
      // Revert the checkbox
      this.requestUpdate();
      return;
    }

    try {
      await client.updatePlugin(pluginId, { enabled });
      if (plugin) {
        plugin.enabled = enabled;
        this.requestUpdate();
      }

      // Refresh plugins after a delay to show updated runtime state
      // The runtime restarts in background, so we poll to catch when it's done
      const pollForRuntimeUpdate = async (attempts = 0) => {
        if (attempts >= 5) return; // Stop after 5 attempts (10 seconds total)

        await new Promise((resolve) => setTimeout(resolve, 2000)); // Wait 2s

        try {
          const { plugins } = await client.getPlugins();
          this.plugins = plugins;
          this.requestUpdate();

          // Check if the plugin's isActive state matches enabled state
          const updatedPlugin = plugins.find((p) => p.id === pluginId);
          if (updatedPlugin && updatedPlugin.isActive === enabled) {
            // Runtime has updated successfully - stop polling
            console.log(`Plugin ${pluginId} is now ${enabled ? 'active' : 'inactive'}`);
            return;
          }

          // Keep polling if state hasn't updated yet
          await pollForRuntimeUpdate(attempts + 1);
        } catch (err) {
          console.error("Failed to refresh plugins:", err);
        }
      };

      // Start polling in background
      pollForRuntimeUpdate();
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
    } catch {
      this.extensionStatus = { relayReachable: false, relayPort: 18792, extensionPath: null };
    }
    this.extensionChecking = false;
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

        <!-- Alchemy setup -->
        <div class="setup-card">
          <h3>Alchemy ${cfg?.alchemyKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}</h3>
          <p>Alchemy provides EVM chain data (Ethereum, Base, Arbitrum, Optimism, Polygon).</p>
          <ol>
            <li>Go to <a href="https://dashboard.alchemy.com/signup" target="_blank" rel="noopener">dashboard.alchemy.com</a> and create a free account</li>
            <li>Create an app, then go to its <strong>Networks</strong> tab and enable: Ethereum, Base, Arbitrum, Optimism, Polygon</li>
            <li>Copy the <strong>API Key</strong> from your app settings</li>
            <li>Paste it below</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="ALCHEMY_API_KEY"
                   placeholder="${cfg?.alchemyKeySet ? "Already set — leave blank to keep" : "Paste your Alchemy API key"}" />
          </div>
        </div>

        <!-- Helius setup -->
        <div class="setup-card">
          <h3>Helius ${cfg?.heliusKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}</h3>
          <p>Helius provides Solana chain data (tokens, NFTs, enhanced RPC).</p>
          <ol>
            <li>Go to <a href="https://dev.helius.xyz/dashboard/app" target="_blank" rel="noopener">dev.helius.xyz</a> and create a free account</li>
            <li>You'll get an API key on your dashboard immediately</li>
            <li>Copy the <strong>API Key</strong></li>
            <li>Paste it below</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="HELIUS_API_KEY"
                   placeholder="${cfg?.heliusKeySet ? "Already set — leave blank to keep" : "Paste your Helius API key"}" />
          </div>
        </div>

        <!-- Birdeye setup (optional) -->
        <div class="setup-card">
          <h3>Birdeye <span style="color:var(--muted);font-size:11px;font-weight:normal;margin-left:8px;">optional</span>
            ${cfg?.birdeyeKeySet ? html`<span style="color:var(--ok);font-size:12px;font-weight:normal;margin-left:8px;">configured</span>` : ""}
          </h3>
          <p>Birdeye provides USD price data for Solana tokens. Optional but recommended.</p>
          <ol>
            <li>Go to <a href="https://birdeye.so/user/api-management" target="_blank" rel="noopener">birdeye.so</a> and create a free account</li>
            <li>Navigate to the <strong>API</strong> section in your profile</li>
            <li>Copy your API key</li>
          </ol>
          <div class="setup-input-row">
            <input type="password" data-wallet-config="BIRDEYE_API_KEY"
                   placeholder="${cfg?.birdeyeKeySet ? "Already set — leave blank to keep" : "Paste your Birdeye API key (optional)"}" />
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
                  <td class="td-value">${row.valueUsd > 0 ? `$${row.valueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ""}</td>
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

  private renderConfig() {
    const ext = this.extensionStatus;
    const relayOk = ext?.relayReachable === true;

    return html`
      <div class="config-container">
        <h2>Settings</h2>
        <p class="subtitle">Agent settings and configuration.</p>

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
        <div style="display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">ALCHEMY_API_KEY</code>
              ${this.walletConfig?.alchemyKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">EVM chain data — <a href="https://dashboard.alchemy.com/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="ALCHEMY_API_KEY"
                   placeholder="${this.walletConfig?.alchemyKeySet ? "Already set — leave blank to keep" : "Enter Alchemy API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
          </div>
          <div style="display:flex;flex-direction:column;gap:2px;font-size:12px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <code style="font-size:11px;font-weight:600;">HELIUS_API_KEY</code>
              ${this.walletConfig?.heliusKeySet ? html`<span style="font-size:10px;color:var(--ok);">set</span>` : html`<span style="font-size:10px;color:var(--muted);">not set</span>`}
            </div>
            <div style="color:var(--muted);font-size:11px;">Solana chain data — <a href="https://dev.helius.xyz/" target="_blank" rel="noopener" style="color:var(--accent);">Get key</a></div>
            <input type="password" data-wallet-config="HELIUS_API_KEY"
                   placeholder="${this.walletConfig?.heliusKeySet ? "Already set — leave blank to keep" : "Enter Helius API key"}"
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
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
                   style="padding:4px 8px;border:1px solid var(--border);background:var(--card);font-size:12px;font-family:var(--mono);" />
          </div>
          <button class="btn" @click=${() => this.handleWalletApiKeySave()}
                  ?disabled=${this.walletApiKeySaving}
                  style="align-self:flex-end;font-size:11px;padding:4px 14px;margin-top:4px;">
            ${this.walletApiKeySaving ? "Saving..." : "Save API Keys"}
          </button>
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
      </div>
    `;
  }

  private renderLogs() {
    return html`
      <h2>Logs</h2>
      <p class="subtitle">Agent log output. ${this.logs.length > 0 ? `${this.logs.length} entries.` : ""}</p>
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
    } catch {
      // silent
    }
  }

  // --- Onboarding ---

  private renderOnboarding() {
    const opts = this.onboardingOptions;
    if (!opts) {
      return html`<div class="app-shell onboarding-active"><div class="empty-state">Loading onboarding...</div></div>`;
    }

    return html`
      <div class="app-shell onboarding-active">
        <div class="onboarding">
          ${this.onboardingStep === 0 ? this.renderOnboardingWelcome() : ""}
          ${this.onboardingStep === 1 ? this.renderOnboardingName(opts) : ""}
          ${this.onboardingStep === 2 ? this.renderOnboardingProvider(opts) : ""}
          ${this.onboardingStep === 3 ? this.renderOnboardingWallet() : ""}
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
      <div class="onboarding-actions">
        <button class="btn btn-secondary" @click=${() => this.handleOnboardingSkip(1)}>Skip</button>
        <button
          class="btn btn-primary"
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
      <button
        class="btn"
        @click=${this.handleOnboardingNext}
        ?disabled=${!this.onboardingStyle}
      >Next</button>
    `;
  }

  private renderOnboardingProvider(opts: OnboardingOptions) {
    const selected = opts.providers.find((p) => p.id === this.onboardingProvider);

    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:80px;height:80px;" />
      <div class="onboarding-speech">which AI provider should I use?</div>

      <div class="onboarding-provider-grid">
        ${opts.providers.map((provider) => html`
          <div
            class="provider-card ${this.onboardingProvider === provider.id ? 'selected' : ''}"
            @click=${() => this.handleProviderSelect(provider)}
          >
            <div class="provider-card-header">
              <img class="provider-logo" src="${getProviderLogo(provider.id, this.isDarkMode)}" alt="${provider.name}" />
              <div class="provider-name">${provider.name}</div>
            </div>
            ${provider.description ? html`<div class="provider-description">${provider.description}</div>` : ''}
          </div>
        `)}
      </div>

      ${this.showApiKeyModal && selected ? this.renderApiKeyModal(selected) : ''}
      ${this.showProviderConfirmModal && selected ? this.renderProviderConfirmModal(selected) : ''}
    `;
  }

  private handleProviderSelect(provider: any): void {
    this.onboardingProvider = provider.id;
    this.onboardingApiKey = "";

    // Check if provider needs API key
    const needsKey = provider.envKey && provider.id !== "elizacloud" && provider.id !== "ollama";
    if (needsKey) {
      this.showApiKeyModal = true;
    } else {
      // For providers without API keys (elizacloud, ollama), show confirmation modal
      this.showProviderConfirmModal = true;
    }
  }

  private renderApiKeyModal(provider: any) {
    return html`
      <div class="modal-backdrop" @click=${() => this.showApiKeyModal = false}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <img src="${getProviderLogo(provider.id, this.isDarkMode)}" alt="${provider.name}" />
            <div class="modal-title">${provider.name} API Key</div>
          </div>
          <div class="modal-description">
            Enter your API key for ${provider.name}. You can get one from their website.
          </div>
          <input
            class="onboarding-input"
            type="password"
            placeholder="Paste your API key here"
            .value=${this.onboardingApiKey}
            @input=${(e: Event) => { this.onboardingApiKey = (e.target as HTMLInputElement).value; }}
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter' && this.onboardingApiKey.trim()) {
                this.showApiKeyModal = false;
                this.handleOnboardingNext();
              }
            }}
          />
          <div class="modal-actions">
            <button class="btn btn-secondary" @click=${() => this.showApiKeyModal = false}>Cancel</button>
            <button
              class="btn btn-primary"
              @click=${() => {
                this.showApiKeyModal = false;
                this.handleOnboardingNext();
              }}
              ?disabled=${!this.onboardingApiKey.trim()}
            >Confirm</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderProviderConfirmModal(provider: any) {
    return html`
      <div class="modal-backdrop" @click=${() => this.showProviderConfirmModal = false}>
        <div class="modal-content" @click=${(e: Event) => e.stopPropagation()}>
          <div class="modal-header">
            <img src="${getProviderLogo(provider.id, this.isDarkMode)}" alt="${provider.name}" />
            <div class="modal-title">Use ${provider.name}?</div>
          </div>
          <div class="modal-description">
            ${provider.id === 'elizacloud'
              ? 'ElizaCloud provides managed AI inference. No API key required.'
              : provider.id === 'ollama'
              ? 'Ollama runs models locally on your machine. No API key required.'
              : `Would you like to use ${provider.name} as your AI provider?`
            }
          </div>
          <div class="modal-actions">
            <button class="btn btn-secondary" @click=${() => {
              this.showProviderConfirmModal = false;
              this.onboardingProvider = "";
            }}>Cancel</button>
            <button
              class="btn btn-primary"
              @click=${() => {
                this.showProviderConfirmModal = false;
                this.handleOnboardingNext();
              }}
            >Confirm</button>
          </div>
        </div>
      </div>
    `;
  }

  private renderOnboardingWallet() {
    return html`
      <img class="onboarding-avatar" src="/pfp.jpg" alt="milAIdy" style="width:80px;height:80px;" />
      <div class="onboarding-speech">let's set up your wallet for token tracking~</div>

      <div class="wallet-info-card">
        <p style="font-size: 14px; color: var(--text); margin: 0;">
          Your agent will auto-generate EVM and Solana wallets.
          To view balances and NFTs, add API keys below (optional):
        </p>
      </div>

      <div class="wallet-api-input-card">
        <label>Alchemy API Key</label>
        <div class="description">For EVM chains (Ethereum, Base, Arbitrum, etc.)</div>
        <input
          class="onboarding-input"
          type="password"
          placeholder="Paste Alchemy API key (optional)"
          .value=${this.onboardingAlchemyKey}
          @input=${(e: Event) => { this.onboardingAlchemyKey = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div class="wallet-api-input-card">
        <label>Helius API Key</label>
        <div class="description">For Solana (tokens and NFTs)</div>
        <input
          class="onboarding-input"
          type="password"
          placeholder="Paste Helius API key (optional)"
          .value=${this.onboardingHeliusKey}
          @input=${(e: Event) => { this.onboardingHeliusKey = (e.target as HTMLInputElement).value; }}
        />
      </div>

      <div class="onboarding-actions">
        <button class="btn btn-secondary" @click=${() => this.handleOnboardingSkip(3)}>Skip</button>
        <button class="btn btn-primary" @click=${this.handleOnboardingFinish}>Finish</button>
      </div>
    `;
  }

  // --- Theme Management ---

  private initializeTheme(): void {
    // Load theme preference from localStorage
    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    if (savedTheme === "dark" || savedTheme === "light") {
      this.isDarkMode = savedTheme === "dark";
    } else {
      // Default to dark mode
      this.isDarkMode = true;
    }
    this.updateThemeAttribute();
  }

  private updateThemeAttribute(): void {
    document.documentElement.setAttribute('data-theme', this.isDarkMode ? 'dark' : 'light');
  }

  private toggleTheme(): void {
    this.isDarkMode = !this.isDarkMode;
    this.updateThemeAttribute();
    localStorage.setItem(THEME_STORAGE_KEY, this.isDarkMode ? "dark" : "light");
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "milaidy-app": MilaidyApp;
  }
}
