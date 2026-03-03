import path from "node:path";
import type { AgentRuntime } from "@elizaos/core";
import {
  type Api,
  getModels,
  getProviders,
  type Model,
} from "@mariozechner/pi-ai";
import {
  type AutocompleteItem,
  CombinedAutocompleteProvider,
  type Component,
  Container,
  type OverlayHandle,
  ProcessTerminal,
  type SlashCommand,
  Spacer,
  Text,
  TUI,
} from "@mariozechner/pi-tui";
import {
  ChatEditor,
  EmbeddingsOverlayComponent,
  FooterComponent,
  ModelSelectorComponent,
  PinnedChatLayout,
  PluginsOverlayComponent,
  SettingsOverlayComponent,
  StatusBar,
} from "./components/index.js";
import { MODAL_PRESETS } from "./modal-presets.js";
import { tuiTheme } from "./theme.js";
import { TitlebarSpinner } from "./titlebar-spinner.js";

export type EmbeddingTier = "fallback" | "standard" | "performance";

export interface MiladyTUIOptions {
  runtime: AgentRuntime;
  modelRegistry?: unknown;
  apiBaseUrl?: string;
}

export class MiladyTUI {
  private terminal = new ProcessTerminal();
  private ui!: TUI;

  private chatContainer = new Container();
  private ephemeralStatusContainer = new Container();

  private statusBar = new StatusBar();
  private footer = new FooterComponent();

  private editor!: ChatEditor;

  private modelOverlay: OverlayHandle | null = null;
  private settingsOverlay: OverlayHandle | null = null;
  private embeddingsOverlay: OverlayHandle | null = null;
  private pluginsOverlay: OverlayHandle | null = null;
  private toolOutputExpanded = false;
  private showThinking = process.env.MILADY_TUI_SHOW_THINKING === "1";

  private titlebarSpinner = new TitlebarSpinner({
    setTitle: (title) => this.terminal.setTitle(title),
  });

  private onSubmit?: (text: string) => Promise<void>;
  private onCtrlC?: () => void;
  private onToggleToolExpand?: (expanded: boolean) => void;
  private onToggleThinking?: (enabled: boolean) => void;

  private modelSelectorHandlers:
    | {
        getCurrentModel: () => Model<Api>;
        onSelectModel: (model: Model<Api>) => void;
        hasCredentials?: (provider: string) => boolean;
      }
    | undefined;

  private embeddingHandlers:
    | {
        getOptions: () => Array<{
          tier: EmbeddingTier;
          label: string;
          dimensions: number;
          downloaded: boolean;
          active: boolean;
        }>;
        onSelectTier: (tier: EmbeddingTier) => Promise<void>;
      }
    | undefined;

  constructor(private options: MiladyTUIOptions) {}

  setOnSubmit(handler: (text: string) => Promise<void>): void {
    this.onSubmit = handler;
  }

  setOnCtrlC(handler: () => void): void {
    this.onCtrlC = handler;
  }

  setOnToggleToolExpand(handler: (expanded: boolean) => void): void {
    this.onToggleToolExpand = handler;
  }

  setOnToggleThinking(handler: (enabled: boolean) => void): void {
    this.onToggleThinking = handler;
  }

  getShowThinking(): boolean {
    return this.showThinking;
  }

  setModelSelectorHandlers(handlers: {
    getCurrentModel: () => Model<Api>;
    onSelectModel: (model: Model<Api>) => void;
    hasCredentials?: (provider: string) => boolean;
  }): void {
    this.modelSelectorHandlers = handlers;
  }

  setEmbeddingHandlers(handlers: {
    getOptions: () => Array<{
      tier: EmbeddingTier;
      label: string;
      dimensions: number;
      downloaded: boolean;
      active: boolean;
    }>;
    onSelectTier: (tier: EmbeddingTier) => Promise<void>;
  }): void {
    this.embeddingHandlers = handlers;
  }

  getToolOutputExpanded(): boolean {
    return this.toolOutputExpanded;
  }

  async start(): Promise<void> {
    this.ui = new TUI(this.terminal);

    this.chatContainer = new Container();
    this.ephemeralStatusContainer = new Container();

    const agentName = this.options.runtime.character?.name ?? "milady";

    this.statusBar.update({ agentName });
    this.titlebarSpinner.setBaseTitle(this.getBaseTitle());

    // ── Header: compact branding (hints live in footer) ─────────────
    const logo =
      tuiTheme.bold(tuiTheme.accent("Milady")) +
      tuiTheme.dim(` — ${agentName}`);

    this.chatContainer.addChild(new Spacer(1));
    this.chatContainer.addChild(new Text(logo, 1, 0));
    this.chatContainer.addChild(new Spacer(1));

    this.editor = new ChatEditor(this.ui, tuiTheme.editor, {
      paddingX: 1,
    });

    this.editor.onSubmit = (text) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      this.editor.addToHistory(trimmed);
      this.editor.setText("");
      void this.onSubmit?.(trimmed);
    };

    this.editor.onCtrlC = () => {
      this.onCtrlC?.();
    };

    this.editor.onCtrlE = () => {
      this.toolOutputExpanded = !this.toolOutputExpanded;
      this.onToggleToolExpand?.(this.toolOutputExpanded);
      this.ui.requestRender();
    };

    this.editor.onCtrlP = () => {
      this.showModelSelector();
    };

    this.editor.onCtrlG = () => {
      this.showPlugins();
    };

    // ── Slash-command autocomplete ────────────────────────────────────
    const getModelCompletions = (
      argumentPrefix: string,
    ): AutocompleteItem[] => {
      const prefix = argumentPrefix.trim().toLowerCase();
      const items: AutocompleteItem[] = [];

      for (const provider of getProviders()) {
        for (const model of getModels(provider)) {
          const spec = `${model.provider}/${model.id}`;
          if (!prefix || spec.toLowerCase().startsWith(prefix)) {
            items.push({
              value: spec,
              label: spec,
              description: model.api,
            });
          }

          if (items.length >= 80) {
            return items;
          }
        }
      }

      return items;
    };

    const slashCommands: SlashCommand[] = [
      {
        name: "model",
        description: "Switch model (open selector or /model provider/id)",
        getArgumentCompletions: (argumentPrefix) =>
          getModelCompletions(argumentPrefix),
      },
      {
        name: "models",
        description: "Alias for /model",
        getArgumentCompletions: (argumentPrefix) =>
          getModelCompletions(argumentPrefix),
      },
      {
        name: "embeddings",
        description:
          "Open/switch embedding model (/embeddings [fallback|standard|performance])",
      },
      { name: "clear", description: "Clear chat" },
      { name: "settings", description: "Open settings panel" },
      { name: "plugins", description: "Open plugin manager" },
      { name: "help", description: "Show help" },
      { name: "exit", description: "Quit" },
      { name: "quit", description: "Alias for /exit" },
    ];

    this.editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(slashCommands),
    );

    // ── Root layout: single PinnedChatLayout child ─────────────────────
    this.ui.addChild(
      new PinnedChatLayout({
        chat: this.chatContainer,
        ephemeralStatus: this.ephemeralStatusContainer,
        statusBar: this.statusBar,
        editor: this.editor,
        footer: this.footer,
        getTerminalRows: () => this.terminal.rows,
        spacerLines: 1,
      }),
    );

    // ── Debug handler (Shift+Ctrl+D) ────────────────────────────────
    this.ui.onDebug = () => {
      const info = [
        `chat children: ${this.chatContainer.children.length}`,
        `overlays: model=${!!this.modelOverlay} embeddings=${!!this.embeddingsOverlay}`,
        `tool expand: ${this.toolOutputExpanded}`,
        `terminal: ${this.terminal.columns}×${this.terminal.rows}`,
      ].join(" | ");
      this.addToChatContainer(new Text(tuiTheme.dim(`[debug] ${info}`), 1, 0));
    };

    this.ui.setFocus(this.editor);
    this.ui.start();
  }

  async stop(): Promise<void> {
    this.titlebarSpinner.dispose();
    this.modelOverlay?.hide();
    this.modelOverlay = null;
    this.settingsOverlay?.hide();
    this.settingsOverlay = null;
    this.embeddingsOverlay?.hide();
    this.embeddingsOverlay = null;
    this.pluginsOverlay?.hide();
    this.pluginsOverlay = null;
    this.ui.stop();
  }

  addToChatContainer(component: Component): void {
    this.chatContainer.addChild(component);
    this.ui.requestRender();
  }

  setEphemeralStatus(component: Component): void {
    this.ephemeralStatusContainer.clear();
    this.ephemeralStatusContainer.addChild(component);
    this.ui.requestRender();
  }

  clearEphemeralStatus(): void {
    this.ephemeralStatusContainer.clear();
    this.ui.requestRender();
  }

  requestRender(): void {
    this.ui.requestRender();
  }

  getTUI(): TUI {
    return this.ui;
  }

  getStatusBar(): StatusBar {
    return this.statusBar;
  }

  openModelSelector(): void {
    this.showModelSelector();
  }

  openSettings(): void {
    this.showSettings();
  }

  openEmbeddings(): void {
    this.showEmbeddings();
  }

  openPlugins(): void {
    this.showPlugins();
  }

  setBusy(busy: boolean): void {
    if (busy) {
      this.titlebarSpinner.start();
    } else {
      this.titlebarSpinner.stop();
    }
  }

  clearChat(): void {
    this.chatContainer.clear();
    this.ui.requestRender();
  }

  private getBaseTitle(): string {
    const cwd = path.basename(process.cwd());
    const agentName = this.options.runtime.character?.name ?? "milady";
    return `${agentName} - ${cwd}`;
  }

  private showSettings(): void {
    if (this.settingsOverlay) return;

    const settings = new SettingsOverlayComponent({
      showThinking: this.showThinking,
      toolExpand: this.toolOutputExpanded,
      onToggleThinking: (enabled) => {
        this.showThinking = enabled;
        this.onToggleThinking?.(enabled);
      },
      onToggleToolExpand: (expanded) => {
        this.toolOutputExpanded = expanded;
        this.onToggleToolExpand?.(expanded);
      },
      onClose: () => {
        this.settingsOverlay?.hide();
        this.settingsOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
    });

    this.settingsOverlay = this.ui.showOverlay(settings, MODAL_PRESETS.compact);

    this.ui.requestRender();
  }

  private showEmbeddings(): void {
    if (!this.embeddingHandlers) return;
    if (this.embeddingsOverlay) return;

    const embeddings = new EmbeddingsOverlayComponent({
      options: this.embeddingHandlers.getOptions(),
      onSelectTier: (tier) => {
        this.embeddingsOverlay?.hide();
        this.embeddingsOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();

        void this.embeddingHandlers?.onSelectTier(tier);
      },
      onCancel: () => {
        this.embeddingsOverlay?.hide();
        this.embeddingsOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
    });

    this.embeddingsOverlay = this.ui.showOverlay(
      embeddings,
      MODAL_PRESETS.standard,
    );

    this.ui.requestRender();
  }

  private showPlugins(): void {
    if (this.pluginsOverlay) return;

    const plugins = new PluginsOverlayComponent({
      runtime: this.options.runtime,
      apiBaseUrl: this.options.apiBaseUrl,
      onClose: () => {
        this.pluginsOverlay?.hide();
        this.pluginsOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
      requestRender: () => this.ui.requestRender(),
    });

    this.pluginsOverlay = this.ui.showOverlay(plugins, MODAL_PRESETS.wide);

    this.ui.requestRender();
  }

  private showModelSelector(): void {
    if (!this.modelSelectorHandlers) return;
    if (this.modelOverlay) return;

    const currentModel = this.modelSelectorHandlers.getCurrentModel();

    const selector = new ModelSelectorComponent({
      currentModel,
      hasCredentials: this.modelSelectorHandlers.hasCredentials,
      onSelect: (model) => {
        this.modelSelectorHandlers?.onSelectModel(model);
        this.modelOverlay?.hide();
        this.modelOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
      onCancel: () => {
        this.modelOverlay?.hide();
        this.modelOverlay = null;
        this.ui.setFocus(this.editor);
        this.ui.requestRender();
      },
    });

    this.modelOverlay = this.ui.showOverlay(selector, MODAL_PRESETS.standard);

    this.ui.requestRender();
  }
}
