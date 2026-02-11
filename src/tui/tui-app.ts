import type { AgentRuntime } from "@elizaos/core";
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
} from "@elizaos/tui";
import {
  type Api,
  getModels,
  getProviders,
  type Model,
} from "@mariozechner/pi-ai";
import {
  ChatEditor,
  FooterComponent,
  ModelSelectorComponent,
  StatusBar,
} from "./components/index.js";
import { tuiTheme } from "./theme.js";

export interface MilaidyTUIOptions {
  runtime: AgentRuntime;
}

export class MilaidyTUI {
  private terminal = new ProcessTerminal();
  private ui!: TUI;

  private chatContainer = new Container();
  private ephemeralStatusContainer = new Container();

  private statusBar = new StatusBar();
  private footer = new FooterComponent();

  private editor!: ChatEditor;

  private modelOverlay: OverlayHandle | null = null;
  private toolOutputExpanded = false;

  private onSubmit?: (text: string) => Promise<void>;
  private onCtrlC?: () => void;
  private onToggleToolExpand?: (expanded: boolean) => void;

  private modelSelectorHandlers:
    | {
        getCurrentModel: () => Model<Api>;
        onSelectModel: (model: Model<Api>) => void;
        hasCredentials?: (provider: string) => boolean;
      }
    | undefined;

  constructor(private options: MilaidyTUIOptions) {}

  setOnSubmit(handler: (text: string) => Promise<void>): void {
    this.onSubmit = handler;
  }

  setOnCtrlC(handler: () => void): void {
    this.onCtrlC = handler;
  }

  setOnToggleToolExpand(handler: (expanded: boolean) => void): void {
    this.onToggleToolExpand = handler;
  }

  setModelSelectorHandlers(handlers: {
    getCurrentModel: () => Model<Api>;
    onSelectModel: (model: Model<Api>) => void;
    hasCredentials?: (provider: string) => boolean;
  }): void {
    this.modelSelectorHandlers = handlers;
  }

  getToolOutputExpanded(): boolean {
    return this.toolOutputExpanded;
  }

  async start(): Promise<void> {
    this.ui = new TUI(this.terminal);

    this.chatContainer = new Container();
    this.ephemeralStatusContainer = new Container();

    this.statusBar.update({
      agentName: this.options.runtime.character?.name ?? "milaidy",
    });

    // Welcome
    this.chatContainer.addChild(
      new Text(tuiTheme.accent("Welcome to Milaidy"), 1, 0),
    );
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

    // Slash command autocomplete (pi-style "/...").
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
        name: "clear",
        description: "Clear chat",
      },
      {
        name: "help",
        description: "Show help",
      },
      {
        name: "exit",
        description: "Quit",
      },
      {
        name: "quit",
        description: "Alias for /exit",
      },
    ];

    this.editor.setAutocompleteProvider(
      new CombinedAutocompleteProvider(slashCommands),
    );

    // Root layout: chat + ephemeral status + status bar + spacer + editor + footer
    this.ui.addChild(this.chatContainer);
    this.ui.addChild(this.ephemeralStatusContainer);
    this.ui.addChild(this.statusBar);
    this.ui.addChild(new Spacer(1));
    this.ui.addChild(this.editor);
    this.ui.addChild(this.footer);

    this.ui.setFocus(this.editor);
    this.ui.start();
  }

  async stop(): Promise<void> {
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

  clearChat(): void {
    this.chatContainer.clear();
    this.chatContainer.addChild(
      new Text(tuiTheme.accent("Welcome to Milaidy"), 1, 0),
    );
    this.chatContainer.addChild(new Spacer(1));
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

    this.modelOverlay = this.ui.showOverlay(selector, {
      anchor: "center",
      width: "60%",
      maxHeight: "70%",
    });

    // Focus is handled by showOverlay(), but ensure render.
    this.ui.requestRender();
  }
}
