import crypto from "node:crypto";
import process from "node:process";
import {
  type ActionEventPayload,
  type AgentRuntime,
  ChannelType,
  type Content,
  createMessageMemory,
  EventType,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import { Loader, Spacer, Text } from "@elizaos/tui";
import type { StreamEvent } from "../runtime/pi-ai-model-handler.js";
import {
  AssistantMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "./components/index.js";
import { milaidyMarkdownTheme, tuiTheme } from "./theme.js";
import type { MilaidyTUI } from "./tui-app.js";

// NOTE: Room + world IDs are derived from the agentId so that switching
// characters (which changes agentId) does not reuse the same persisted
// conversation history / metadata.
const TUI_USER_ID = stringToUuid("milaidy-tui-user") as UUID;

export class ElizaTUIBridge {
  private isProcessing = false;

  private showThinking = process.env.MILAIDY_TUI_SHOW_THINKING === "1";
  private showStructuredResponse =
    process.env.MILAIDY_TUI_SHOW_STRUCTURED_RESPONSE === "1";

  private abortController: AbortController | null = null;

  private streamedText = "";
  private thinkingText = "";
  private structuredThoughtText = "";

  private currentAssistant: AssistantMessageComponent | null = null;
  private lastAssistantForTurn: AssistantMessageComponent | null = null;
  private assistantFinalizedForTurn = false;
  private spacerAddedForTurn = false;

  private pendingRender: NodeJS.Timeout | null = null;

  private pendingActions = new Map<string, ToolExecutionComponent>();
  private allToolComponents = new Set<ToolExecutionComponent>();

  private readonly worldId: UUID;
  private readonly roomId: UUID;
  private readonly channelId: string;

  constructor(
    private runtime: AgentRuntime,
    private tui: MilaidyTUI,
  ) {
    const agentScope = String(this.runtime.agentId);
    this.worldId = stringToUuid(`milaidy-tui-world:${agentScope}`) as UUID;
    this.roomId = stringToUuid(`milaidy-tui-room:${agentScope}`) as UUID;
    this.channelId = `milaidy-tui:${agentScope}`;
  }

  getAbortSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  async initialize(): Promise<void> {
    await this.runtime.ensureWorldExists({
      id: this.worldId,
      name: "Milaidy TUI",
      agentId: this.runtime.agentId,
    });

    await this.runtime.ensureRoomExists({
      id: this.roomId,
      name: "Milaidy TUI",
      type: ChannelType.DM,
      source: "milaidy-tui",
      worldId: this.worldId,
      channelId: this.channelId,
      metadata: { ownership: { ownerId: TUI_USER_ID } },
    });

    await this.runtime.ensureConnection({
      entityId: TUI_USER_ID,
      roomId: this.roomId,
      worldId: this.worldId,
      worldName: "Milaidy TUI",
      userName: "User",
      name: "User",
      source: "milaidy-tui",
      type: ChannelType.DM,
      channelId: this.channelId,
      metadata: { ownership: { ownerId: TUI_USER_ID } },
    });

    // Action/tool execution hooks.
    this.runtime.registerEvent(EventType.ACTION_STARTED, async (payload) => {
      const p = payload as ActionEventPayload;
      const actionName = p.content.actions?.[0] ?? "action";
      const actionId =
        ((p.content as Record<string, unknown>).actionId as
          | string
          | undefined) ??
        (p.messageId as string | undefined) ??
        `${actionName}-${Date.now()}`;

      const component = new ToolExecutionComponent(
        actionName,
        {},
        this.tui.getTUI(),
      );
      component.setExpanded(this.tui.getToolOutputExpanded());

      this.pendingActions.set(actionId, component);
      this.allToolComponents.add(component);

      this.tui.addToChatContainer(component);
      this.tui.addToChatContainer(new Spacer(1));
      this.tui.requestRender();
    });

    this.runtime.registerEvent(EventType.ACTION_COMPLETED, async (payload) => {
      const p = payload as ActionEventPayload;
      const actionName = p.content.actions?.[0] ?? "action";
      const actionId =
        ((p.content as Record<string, unknown>).actionId as
          | string
          | undefined) ?? (p.messageId as string | undefined);

      let resolvedKey = actionId;
      let component = resolvedKey
        ? this.pendingActions.get(resolvedKey)
        : undefined;

      if (!component) {
        // Best-effort: find the most recent pending component for this action name.
        const fallback = [...this.pendingActions.entries()]
          .reverse()
          .find(([, c]) => c.render(120)[0]?.includes(actionName));

        if (fallback) {
          resolvedKey = fallback[0];
          component = fallback[1];
        }
      }

      if (!component) return;

      const status = (p.content as Record<string, unknown>).actionStatus as
        | string
        | undefined;
      const isError = status === "failed";

      const actionResult = (p.content as Record<string, unknown>)
        .actionResult as Record<string, unknown> | undefined;

      const text =
        p.content.text ??
        (actionResult ? JSON.stringify(actionResult, null, 2) : "");

      component.updateResult({ text, isError });

      if (resolvedKey) {
        this.pendingActions.delete(resolvedKey);
      }

      this.tui.requestRender();
    });
  }

  abortInFlight(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  setToolOutputExpanded(expanded: boolean): void {
    for (const component of this.allToolComponents) {
      component.setExpanded(expanded);
    }
    this.tui.requestRender();
  }

  async handleUserInput(text: string): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    this.abortController = new AbortController();
    this.streamedText = "";
    this.thinkingText = "";
    this.structuredThoughtText = "";
    this.currentAssistant = null;
    this.lastAssistantForTurn = null;
    this.assistantFinalizedForTurn = false;
    this.spacerAddedForTurn = false;

    try {
      // Render the user message
      this.tui.addToChatContainer(new UserMessageComponent(text));
      this.tui.addToChatContainer(new Spacer(1));

      // Status spinner while waiting for the first token.
      const loader = new Loader(
        this.tui.getTUI(),
        (spinner) => tuiTheme.info(spinner),
        (msg) => tuiTheme.muted(msg),
        "Thinking...",
      );
      this.tui.setEphemeralStatus(loader);
      this.tui.getStatusBar().update({ isStreaming: true });

      const message = createMessageMemory({
        id: crypto.randomUUID() as UUID,
        entityId: TUI_USER_ID,
        agentId: this.runtime.agentId,
        roomId: this.roomId,
        content: {
          text,
          source: "milaidy-tui",
          channelType: ChannelType.DM,
        },
      });

      if (!this.runtime.messageService) {
        throw new Error("runtime.messageService is not available");
      }

      await this.runtime.messageService.handleMessage(
        this.runtime,
        message,
        async (response: Content) => {
          // Final response callback.
          // When streaming is enabled, this is typically the *parsed* final text.
          // We use it to replace any structured wrapper the model may have emitted
          // during streaming, and to avoid duplicating messages.
          if (response.text) {
            this.streamedText = response.text;

            const component =
              this.currentAssistant ?? this.lastAssistantForTurn ?? null;

            if (!component) {
              this.ensureAssistantComponent();
            }

            this.updateAssistantFromText();
            this.finalizeAssistantForTurn();
          }
          return [];
        },
        {
          abortSignal: this.abortController.signal,
        },
      );
    } catch (error) {
      // User-initiated cancellation should keep the partial response without
      // showing an error banner.
      if (this.abortController?.signal.aborted) {
        return;
      }

      const errText = error instanceof Error ? error.message : String(error);
      this.tui.addToChatContainer(
        new Text(tuiTheme.error(`Error: ${errText}`), 1, 0),
      );
      this.tui.addToChatContainer(new Spacer(1));
    } finally {
      this.tui.clearEphemeralStatus();
      this.tui.getStatusBar().update({ isStreaming: false });
      this.abortController = null;
      this.isProcessing = false;
    }
  }

  onStreamEvent(event: StreamEvent): void {
    switch (event.type) {
      case "token": {
        if (!event.text) return;
        this.tui.clearEphemeralStatus();
        this.tui.getStatusBar().update({ isStreaming: true });

        this.streamedText += event.text;
        this.ensureAssistantComponent();
        this.scheduleAssistantUpdate();
        break;
      }

      case "thinking": {
        if (!event.text) return;
        this.thinkingText += event.text;
        // Only re-render thinking if the component is configured to show it.
        this.currentAssistant?.updateThinking(this.getCombinedThinkingText());
        this.scheduleAssistantUpdate();
        break;
      }

      case "usage": {
        if (!event.usage) return;
        this.tui.getStatusBar().update({
          inputTokens: event.usage.inputTokens,
          outputTokens: event.usage.outputTokens,
          isStreaming: false,
        });
        this.tui.requestRender();
        break;
      }

      case "done": {
        this.tui.clearEphemeralStatus();
        this.tui.getStatusBar().update({ isStreaming: false });

        // Prefer the final text from the messageService callback (if present),
        // but if it doesn't arrive we finalize with whatever we streamed.
        this.updateAssistantFromText();
        this.finalizeAssistantForTurn();

        this.tui.requestRender();
        break;
      }

      case "error": {
        this.tui.clearEphemeralStatus();
        this.tui.getStatusBar().update({ isStreaming: false });

        const msg = event.error ?? "Model error";
        this.tui.addToChatContainer(
          new Text(tuiTheme.error(`Error: ${msg}`), 1, 0),
        );
        this.tui.addToChatContainer(new Spacer(1));
        this.tui.requestRender();
        break;
      }
    }
  }

  private ensureAssistantComponent(): void {
    if (this.currentAssistant) return;

    this.currentAssistant = new AssistantMessageComponent(
      this.showThinking,
      milaidyMarkdownTheme,
    );
    this.lastAssistantForTurn = this.currentAssistant;
    this.tui.addToChatContainer(this.currentAssistant);
    this.tui.requestRender();
  }

  private scheduleAssistantUpdate(): void {
    if (this.pendingRender) return;

    this.pendingRender = setTimeout(() => {
      this.pendingRender = null;
      this.updateAssistantFromText();
      this.tui.requestRender();
    }, 33);
  }

  private finalizeAssistantForTurn(): void {
    if (this.assistantFinalizedForTurn) return;

    const component = this.currentAssistant ?? this.lastAssistantForTurn;
    if (!component) return;

    component.finalize();
    this.currentAssistant = null;
    this.assistantFinalizedForTurn = true;

    if (!this.spacerAddedForTurn) {
      this.tui.addToChatContainer(new Spacer(1));
      this.spacerAddedForTurn = true;
    }
  }

  private updateAssistantFromText(): void {
    const component = this.currentAssistant ?? this.lastAssistantForTurn;
    if (!component) return;

    const normalized = this.normalizeAssistantText(this.streamedText);

    this.structuredThoughtText = normalized.thoughtText;
    component.updateThinking(this.getCombinedThinkingText());
    component.updateContent(normalized.text);
  }

  private getCombinedThinkingText(): string {
    const parts = [this.thinkingText, this.structuredThoughtText]
      .map((p) => p.trim())
      .filter((p) => p.length > 0);
    return parts.join("\n");
  }

  private normalizeAssistantText(raw: string): {
    text: string;
    thoughtText: string;
  } {
    if (this.showStructuredResponse) {
      return { text: raw, thoughtText: "" };
    }

    // Some Eliza prompts instruct models to emit an XML wrapper like:
    // <response><thought>...</thought><text>...</text></response>
    // We only want to render the user-facing <text> in the chat.
    const responseIdx = raw.indexOf("<response>");
    if (responseIdx < 0) {
      return { text: raw, thoughtText: "" };
    }

    const thought = this.extractXmlTag(raw, "thought") ?? "";

    // Prefer <text> if present (even partially, during streaming).
    const text = this.extractXmlTag(raw, "text", { allowPartial: true });
    if (text !== null) {
      return { text: text.trimStart(), thoughtText: thought.trim() };
    }

    // If it's structured but <text> hasn't appeared yet, avoid dumping the wrapper.
    return { text: "", thoughtText: thought.trim() };
  }

  private extractXmlTag(
    raw: string,
    tag: string,
    opts?: { allowPartial?: boolean },
  ): string | null {
    const open = `<${tag}>`;
    const close = `</${tag}>`;

    const start = raw.indexOf(open);
    if (start < 0) return null;

    const contentStart = start + open.length;
    const end = raw.indexOf(close, contentStart);

    if (end < 0) {
      if (opts?.allowPartial) {
        return raw.slice(contentStart);
      }
      return null;
    }

    return raw.slice(contentStart, end);
  }
}
