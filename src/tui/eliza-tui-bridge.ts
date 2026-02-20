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
import {
  CancellableLoader,
  type TUI as PiTUI,
  Spacer,
  Text,
} from "@mariozechner/pi-tui";
import type { StreamEvent } from "../runtime/pi-ai-model-handler.js";
import {
  AssistantMessageComponent,
  ToolExecutionComponent,
  UserMessageComponent,
} from "./components/index.js";
import {
  drainSseEvents,
  extractSseDataPayloads,
  parseConversationStreamPayload,
} from "./sse-parser.js";
import { miladyMarkdownTheme, tuiTheme } from "./theme.js";
import type { MiladyTUI } from "./tui-app.js";
import { ApiModeWsClient } from "./ws-client.js";

// NOTE: Room + world IDs are derived from the agentId so that switching
// characters (which changes agentId) does not reuse the same persisted
// conversation history / metadata.
const TUI_USER_ID = stringToUuid("milady-tui-user") as UUID;

interface ElizaTUIBridgeOptions {
  /** API base URL (enables API transport mode for chat). */
  apiBaseUrl?: string;
  /** Title used when creating a new conversation for TUI. */
  conversationTitle?: string;
}

interface ConversationRecord {
  id: string;
  updatedAt: string;
  title?: string;
  roomId?: string;
}

interface ConversationListResponse {
  conversations: ConversationRecord[];
}

interface ConversationCreateResponse {
  conversation: {
    id: string;
    title?: string;
    roomId?: string;
  };
}

interface ActionRouteDecision {
  shouldHandle: boolean;
  reason: string;
  payloadRoomId: string;
  activeRoomId: string;
}

export class ElizaTUIBridge {
  private isProcessing = false;

  private showThinking = process.env.MILADY_TUI_SHOW_THINKING === "1";
  private showStructuredResponse =
    process.env.MILADY_TUI_SHOW_STRUCTURED_RESPONSE === "1";
  private debugActionRouting =
    process.env.MILADY_TUI_DEBUG_ACTION_ROUTING === "1";

  private abortController: AbortController | null = null;

  private streamedText = "";
  private thinkingText = "";
  private structuredThoughtText = "";

  private currentAssistant: AssistantMessageComponent | null = null;
  private lastAssistantForTurn: AssistantMessageComponent | null = null;
  private assistantFinalizedForTurn = false;

  private pendingRender: NodeJS.Timeout | null = null;

  private pendingActions = new Map<string, ToolExecutionComponent>();
  private allToolComponents = new Set<ToolExecutionComponent>();

  private readonly worldId: UUID;
  private readonly roomId: UUID;
  private readonly channelId: string;

  private readonly apiBaseUrl: string | null;
  private readonly conversationTitle: string;
  private conversationId: string | null = null;
  private conversationRoomId: string | null = null;
  private conversationInitPromise: Promise<string> | null = null;
  private apiWsClient: ApiModeWsClient | null = null;

  private pendingProactiveMessages: string[] = [];
  private lastCompletedAssistantText = "";
  private lastCompletedAssistantAt = 0;

  private seenProactiveMessageIds = new Set<string>();
  private seenProactiveMessageOrder: string[] = [];
  private readonly proactiveMessageIdLimit = 128;

  constructor(
    private runtime: AgentRuntime,
    private tui: MiladyTUI,
    opts: ElizaTUIBridgeOptions = {},
  ) {
    const agentScope = String(this.runtime.agentId);
    this.worldId = stringToUuid(`milady-tui-world:${agentScope}`) as UUID;
    this.roomId = stringToUuid(`milady-tui-room:${agentScope}`) as UUID;
    this.channelId = `milady-tui:${agentScope}`;

    this.apiBaseUrl = opts.apiBaseUrl?.trim().replace(/\/+$/, "") || null;
    this.conversationTitle = opts.conversationTitle?.trim() || "TUI Chat";
  }

  getAbortSignal(): AbortSignal | undefined {
    return this.abortController?.signal;
  }

  getIsProcessing(): boolean {
    return this.isProcessing;
  }

  private getPiTuiCompat(): PiTUI {
    return this.tui.getTUI() as unknown as PiTUI;
  }

  private getActionEventRouteDecision(
    payload: ActionEventPayload,
  ): ActionRouteDecision {
    const payloadRoomId = payload.roomId ? String(payload.roomId) : "";
    const activeRoomId = this.apiBaseUrl
      ? (this.conversationRoomId ?? "")
      : String(this.roomId);

    if (!payloadRoomId) {
      return {
        shouldHandle: false,
        reason: "missing_payload_room",
        payloadRoomId,
        activeRoomId,
      };
    }

    if (!this.apiBaseUrl) {
      const shouldHandle = payloadRoomId === activeRoomId;
      return {
        shouldHandle,
        reason: shouldHandle ? "runtime_room_match" : "runtime_room_mismatch",
        payloadRoomId,
        activeRoomId,
      };
    }

    if (!activeRoomId) {
      return {
        shouldHandle: false,
        reason: "conversation_room_unresolved",
        payloadRoomId,
        activeRoomId,
      };
    }

    const shouldHandle = payloadRoomId === activeRoomId;
    return {
      shouldHandle,
      reason: shouldHandle
        ? "conversation_room_match"
        : "conversation_room_mismatch",
      payloadRoomId,
      activeRoomId,
    };
  }

  private logActionRoute(
    eventType: "ACTION_STARTED" | "ACTION_COMPLETED",
    actionName: string,
    decision: ActionRouteDecision,
  ): void {
    if (!this.debugActionRouting) return;

    const mode = this.apiBaseUrl ? "api" : "runtime";
    const payloadRoom = decision.payloadRoomId || "(none)";
    const activeRoom = decision.activeRoomId || "(unset)";

    process.stderr.write(
      `[milady-tui] ${eventType} action=${actionName} mode=${mode} payloadRoom=${payloadRoom} activeRoom=${activeRoom} handled=${decision.shouldHandle} reason=${decision.reason}\n`,
    );
  }

  async initialize(): Promise<void> {
    // Runtime-direct mode keeps a dedicated TUI room. In API mode chat
    // identity/rooms are managed by /api/conversations.
    if (!this.apiBaseUrl) {
      await this.runtime.ensureWorldExists({
        id: this.worldId,
        name: "Milady TUI",
        agentId: this.runtime.agentId,
      });

      await this.runtime.ensureRoomExists({
        id: this.roomId,
        name: "Milady TUI",
        type: ChannelType.DM,
        source: "milady-tui",
        worldId: this.worldId,
        channelId: this.channelId,
        metadata: { ownership: { ownerId: TUI_USER_ID } },
      });

      await this.runtime.ensureConnection({
        entityId: TUI_USER_ID,
        roomId: this.roomId,
        worldId: this.worldId,
        worldName: "Milady TUI",
        userName: "User",
        name: "User",
        source: "milady-tui",
        type: ChannelType.DM,
        channelId: this.channelId,
        metadata: { ownership: { ownerId: TUI_USER_ID } },
      });
    } else {
      this.apiWsClient = new ApiModeWsClient({
        apiBaseUrl: this.apiBaseUrl,
        getAuthToken: () => this.getApiToken(),
        onMessage: (data) => this.handleApiWsMessage(data),
        onError: (error) => {
          process.stderr.write(
            `[milady-tui] websocket error: ${error.message}\n`,
          );
        },
      });
      this.apiWsClient.connect();
    }

    // Action/tool execution hooks.
    // Skip internal response actions — only show real tool calls.
    const SKIP_ACTIONS = new Set([
      "reply",
      "respond",
      "continue",
      "ignore",
      "none",
      "wait",
      "action",
    ]);

    this.runtime.registerEvent(EventType.ACTION_STARTED, async (payload) => {
      const p = payload as ActionEventPayload;
      const actionName = p.content.actions?.[0] ?? "action";

      const route = this.getActionEventRouteDecision(p);
      if (!route.shouldHandle) {
        this.logActionRoute("ACTION_STARTED", actionName, route);
        return;
      }

      if (SKIP_ACTIONS.has(actionName.toLowerCase())) {
        this.logActionRoute("ACTION_STARTED", actionName, {
          ...route,
          shouldHandle: false,
          reason: "internal_action_skipped",
        });
        return;
      }

      this.logActionRoute("ACTION_STARTED", actionName, route);

      const actionId =
        ((p.content as Record<string, unknown>).actionId as
          | string
          | undefined) ??
        (p.messageId as string | undefined) ??
        `${actionName}-${Date.now()}`;

      const component = new ToolExecutionComponent(
        actionName,
        {},
        this.getPiTuiCompat(),
      );
      component.setExpanded(this.tui.getToolOutputExpanded());

      this.pendingActions.set(actionId, component);
      this.allToolComponents.add(component);

      this.tui.addToChatContainer(component);
      this.tui.requestRender();
    });

    this.runtime.registerEvent(EventType.ACTION_COMPLETED, async (payload) => {
      const p = payload as ActionEventPayload;
      const actionName = p.content.actions?.[0] ?? "action";

      const route = this.getActionEventRouteDecision(p);
      if (!route.shouldHandle) {
        this.logActionRoute("ACTION_COMPLETED", actionName, route);
        return;
      }

      if (SKIP_ACTIONS.has(actionName.toLowerCase())) {
        this.logActionRoute("ACTION_COMPLETED", actionName, {
          ...route,
          shouldHandle: false,
          reason: "internal_action_skipped",
        });
        return;
      }

      this.logActionRoute("ACTION_COMPLETED", actionName, route);

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

  setShowThinking(enabled: boolean): void {
    this.showThinking = enabled;
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
    this.tui.setBusy(true);

    this.abortController = new AbortController();
    this.streamedText = "";
    this.thinkingText = "";
    this.structuredThoughtText = "";
    this.currentAssistant = null;
    this.lastAssistantForTurn = null;
    this.assistantFinalizedForTurn = false;

    try {
      // Render the user message (component owns its own top spacing)
      this.tui.addToChatContainer(new UserMessageComponent(text));

      // Status spinner while waiting for the first token.
      // CancellableLoader provides an AbortSignal + Escape key handling.
      const loader = new CancellableLoader(
        this.getPiTuiCompat(),
        (spinner) => tuiTheme.info(spinner),
        (msg) => tuiTheme.muted(msg),
        "Thinking… (Esc to cancel)",
      );
      loader.onAbort = () => {
        this.abortInFlight();
      };
      this.tui.setEphemeralStatus(loader);
      this.tui.getStatusBar().update({ isStreaming: true });

      if (this.apiBaseUrl) {
        await this.handleUserInputViaApi(text);
      } else {
        await this.handleUserInputViaRuntime(text);
      }
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
      this.tui.setBusy(false);
      this.abortController = null;
      this.isProcessing = false;
      this.flushPendingProactiveMessages();
    }
  }

  onStreamEvent(event: StreamEvent): void {
    // In API transport mode, tokens come from the SSE endpoint and handling
    // these runtime-level callbacks would duplicate output.
    if (this.apiBaseUrl) {
      return;
    }

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

  private async handleUserInputViaRuntime(text: string): Promise<void> {
    const message = createMessageMemory({
      id: crypto.randomUUID() as UUID,
      entityId: TUI_USER_ID,
      agentId: this.runtime.agentId,
      roomId: this.roomId,
      content: {
        text,
        source: "milady-tui",
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
        abortSignal: this.abortController?.signal,
      },
    );
  }

  private async handleUserInputViaApi(text: string): Promise<void> {
    const conversationId = await this.ensureConversationId();
    await this.streamConversationMessage(
      conversationId,
      text,
      this.abortController?.signal,
    );

    if (
      !this.currentAssistant &&
      !this.lastAssistantForTurn &&
      this.streamedText.trim().length > 0
    ) {
      this.ensureAssistantComponent();
    }

    this.updateAssistantFromText();
    this.finalizeAssistantForTurn();
    this.tui.requestRender();
  }

  private async ensureConversationId(): Promise<string> {
    if (this.conversationId) {
      this.apiWsClient?.setActiveConversationId(this.conversationId);
      return this.conversationId;
    }

    if (!this.conversationInitPromise) {
      this.conversationInitPromise = this.resolveConversationId().finally(
        () => {
          this.conversationInitPromise = null;
        },
      );
    }

    const resolved = await this.conversationInitPromise;
    this.conversationId = resolved;
    this.apiWsClient?.setActiveConversationId(resolved);
    return resolved;
  }

  private async resolveConversationId(): Promise<string> {
    const list =
      await this.apiFetchJson<ConversationListResponse>("/api/conversations");

    const title = this.conversationTitle.trim().toLowerCase();
    const existing = [...(list.conversations ?? [])]
      .filter((c) => typeof c?.id === "string" && c.id.trim().length > 0)
      .filter(
        (c) =>
          c.title?.trim().toLowerCase() === title &&
          typeof c.roomId === "string" &&
          c.roomId.trim().length > 0,
      )
      .sort(
        (a, b) =>
          this.parseTimestamp(b.updatedAt) - this.parseTimestamp(a.updatedAt),
      )[0];

    if (existing?.id) {
      this.conversationRoomId = existing.roomId?.trim() || null;
      return existing.id;
    }

    const created = await this.apiFetchJson<ConversationCreateResponse>(
      "/api/conversations",
      {
        method: "POST",
        body: JSON.stringify({ title: this.conversationTitle }),
      },
    );

    const createdId = created.conversation?.id?.trim();
    if (!createdId) {
      throw new Error("Failed to create TUI conversation");
    }

    this.conversationRoomId = created.conversation?.roomId?.trim() || null;
    return createdId;
  }

  private parseTimestamp(value: string): number {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? ms : 0;
  }

  private async streamConversationMessage(
    conversationId: string,
    text: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await this.apiFetch(
      `/api/conversations/${encodeURIComponent(conversationId)}/messages/stream`,
      {
        method: "POST",
        headers: {
          Accept: "text/event-stream",
        },
        body: JSON.stringify({ text }),
        signal,
      },
    );

    if (!res.body) {
      throw new Error("Streaming not supported by this runtime");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    let buffer = "";
    let fullText = "";
    let doneText: string | null = null;

    const parsePayload = (payload: string): void => {
      const parsed = parseConversationStreamPayload(payload);
      if (!parsed) return;

      if (parsed.type === "token") {
        const chunk = parsed.text ?? "";
        if (!chunk) return;

        this.tui.clearEphemeralStatus();
        this.tui.getStatusBar().update({ isStreaming: true });

        fullText += chunk;
        this.streamedText += chunk;
        this.ensureAssistantComponent();
        this.scheduleAssistantUpdate();
        return;
      }

      if (parsed.type === "done") {
        if (typeof parsed.fullText === "string") {
          doneText = parsed.fullText;
        }
        return;
      }

      if (parsed.type === "error") {
        throw new Error(parsed.message ?? "generation failed");
      }

      // Backward compatibility with legacy stream payloads: { text: "..." }
      if (parsed.text) {
        this.tui.clearEphemeralStatus();
        this.tui.getStatusBar().update({ isStreaming: true });

        fullText += parsed.text;
        this.streamedText += parsed.text;
        this.ensureAssistantComponent();
        this.scheduleAssistantUpdate();
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const drained = drainSseEvents(buffer);
      buffer = drained.remaining;

      for (const rawEvent of drained.events) {
        for (const payload of extractSseDataPayloads(rawEvent)) {
          parsePayload(payload);
        }
      }
    }

    if (buffer.trim()) {
      for (const payload of extractSseDataPayloads(buffer)) {
        parsePayload(payload);
      }
    }

    if (typeof doneText === "string") {
      this.streamedText = doneText;
    } else if (!this.streamedText && fullText) {
      this.streamedText = fullText;
    }
  }

  private getApiToken(): string | null {
    const token = process.env.MILADY_API_TOKEN?.trim();
    return token || null;
  }

  private handleApiWsMessage(data: Record<string, unknown>): void {
    if (data.type !== "proactive-message") return;

    const conversationId =
      typeof data.conversationId === "string" ? data.conversationId.trim() : "";
    if (!conversationId || !this.conversationId) return;
    if (conversationId !== this.conversationId) return;

    const rawMessage = data.message;
    if (
      !rawMessage ||
      typeof rawMessage !== "object" ||
      Array.isArray(rawMessage)
    ) {
      return;
    }

    const message = rawMessage as Record<string, unknown>;
    const messageId = typeof message.id === "string" ? message.id.trim() : "";
    if (messageId) {
      if (this.seenProactiveMessageIds.has(messageId)) return;
      this.rememberProactiveMessageId(messageId);
    }

    const text = typeof message.text === "string" ? message.text.trim() : "";
    if (!text) return;

    if (this.isLikelyDuplicateAssistantText(text)) return;

    if (this.isProcessing) {
      this.queuePendingProactiveMessage(text);
      return;
    }

    this.renderProactiveAssistantMessage(text);
  }

  private rememberProactiveMessageId(id: string): void {
    this.seenProactiveMessageIds.add(id);
    this.seenProactiveMessageOrder.push(id);

    if (this.seenProactiveMessageOrder.length <= this.proactiveMessageIdLimit) {
      return;
    }

    const oldest = this.seenProactiveMessageOrder.shift();
    if (oldest) {
      this.seenProactiveMessageIds.delete(oldest);
    }
  }

  private queuePendingProactiveMessage(text: string): void {
    const lastQueued =
      this.pendingProactiveMessages[this.pendingProactiveMessages.length - 1];
    if (lastQueued === text) {
      return;
    }

    this.pendingProactiveMessages.push(text);
    if (this.pendingProactiveMessages.length > 32) {
      this.pendingProactiveMessages.shift();
    }
  }

  private flushPendingProactiveMessages(): void {
    if (this.pendingProactiveMessages.length < 1) return;

    const pending = this.pendingProactiveMessages;
    this.pendingProactiveMessages = [];

    for (const text of pending) {
      if (this.isLikelyDuplicateAssistantText(text)) continue;
      this.renderProactiveAssistantMessage(text);
    }
  }

  private isLikelyDuplicateAssistantText(text: string): boolean {
    const normalized = text.trim();
    if (!normalized) return true;

    if (this.streamedText.trim() === normalized) {
      return true;
    }

    if (
      this.lastCompletedAssistantText === normalized &&
      Date.now() - this.lastCompletedAssistantAt < 1_500
    ) {
      return true;
    }

    return false;
  }

  private renderProactiveAssistantMessage(text: string): void {
    const component = new AssistantMessageComponent(
      this.showThinking,
      miladyMarkdownTheme,
      this.runtime.character?.name ?? "milady",
    );
    component.updateContent(text);
    component.finalize();

    this.tui.addToChatContainer(component);
    this.tui.requestRender();

    this.lastCompletedAssistantText = text.trim();
    this.lastCompletedAssistantAt = Date.now();
  }

  private async apiFetch(path: string, init?: RequestInit): Promise<Response> {
    if (!this.apiBaseUrl) {
      throw new Error("API transport is not configured");
    }

    const headers = new Headers(init?.headers);
    if (init?.body != null && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const token = this.getApiToken();
    if (token && !headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await fetch(`${this.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      const message = await this.readApiError(res);
      throw new Error(message);
    }

    return res;
  }

  private async apiFetchJson<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await this.apiFetch(path, init);
    return res.json() as Promise<T>;
  }

  private async readApiError(res: Response): Promise<string> {
    try {
      const body = (await res.json()) as { error?: string };
      if (typeof body.error === "string" && body.error.trim()) {
        return body.error;
      }
    } catch {
      // ignore JSON parse failures
    }

    try {
      const text = await res.text();
      if (text.trim()) return text.trim();
    } catch {
      // ignore text parse failures
    }

    return `HTTP ${res.status}`;
  }

  private ensureAssistantComponent(): void {
    if (this.currentAssistant) return;

    this.currentAssistant = new AssistantMessageComponent(
      this.showThinking,
      miladyMarkdownTheme,
      this.runtime.character?.name ?? "milady",
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

    const completedText = this.normalizeAssistantText(
      this.streamedText,
    ).text.trim();
    if (completedText) {
      this.lastCompletedAssistantText = completedText;
      this.lastCompletedAssistantAt = Date.now();
    }

    this.currentAssistant = null;
    this.assistantFinalizedForTurn = true;
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
