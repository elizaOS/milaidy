/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  client,
  type HyperscapeAgentGoalResponse,
  type HyperscapeEmbeddedAgent,
  type HyperscapeEmbeddedAgentControlAction,
  type HyperscapeJsonValue,
  type HyperscapeQuickActionsResponse,
  type HyperscapeScriptedRole,
  type RegistryAppInfo,
} from "../api-client";
import { useApp } from "../AppContext";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";
const HYPERSCAPE_APP_NAME = "@elizaos/app-hyperscape";
const HYPERSCAPE_COMMAND_OPTIONS = [
  "chat",
  "move",
  "attack",
  "gather",
  "pickup",
  "drop",
  "equip",
  "use",
  "stop",
] as const;
const HYPERSCAPE_SCRIPTED_ROLE_OPTIONS: Array<{
  value: HyperscapeScriptedRole;
  label: string;
}> = [
  { value: "balanced", label: "Balanced" },
  { value: "combat", label: "Combat" },
  { value: "woodcutting", label: "Woodcutting" },
  { value: "fishing", label: "Fishing" },
  { value: "mining", label: "Mining" },
];

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
};

function formatHyperscapePosition(position: HyperscapeEmbeddedAgent["position"]): string {
  if (!position) return "n/a";
  if (Array.isArray(position)) {
    const [x, y, z] = position;
    return `${Math.round(x)}, ${Math.round(y)}, ${Math.round(z)}`;
  }
  return `${Math.round(position.x)}, ${Math.round(position.y)}, ${Math.round(position.z)}`;
}

function parseHyperscapeCommandData(
  raw: string,
): { [key: string]: HyperscapeJsonValue } | null {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    const parsed = JSON.parse(trimmed) as HyperscapeJsonValue;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed as { [key: string]: HyperscapeJsonValue };
  } catch {
    return null;
  }
}

export function AppsView() {
  const { setState, setActionNotice } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [hyperscapePanelOpen, setHyperscapePanelOpen] = useState(false);
  const [hyperscapeAgents, setHyperscapeAgents] = useState<HyperscapeEmbeddedAgent[]>([]);
  const [hyperscapeAgentsLoading, setHyperscapeAgentsLoading] = useState(false);
  const [hyperscapeTelemetryLoading, setHyperscapeTelemetryLoading] = useState(false);
  const [hyperscapeBusyAction, setHyperscapeBusyAction] = useState<string | null>(null);
  const [hyperscapeError, setHyperscapeError] = useState<string | null>(null);
  const [hyperscapeSelectedAgentId, setHyperscapeSelectedAgentId] = useState("");
  const [hyperscapeGoalResponse, setHyperscapeGoalResponse] =
    useState<HyperscapeAgentGoalResponse | null>(null);
  const [hyperscapeQuickActionsResponse, setHyperscapeQuickActionsResponse] =
    useState<HyperscapeQuickActionsResponse | null>(null);
  const [hyperscapeCharacterIdInput, setHyperscapeCharacterIdInput] = useState("");
  const [hyperscapeScriptedRole, setHyperscapeScriptedRole] = useState<
    "" | HyperscapeScriptedRole
  >("");
  const [hyperscapeAutoStart, setHyperscapeAutoStart] = useState(true);
  const [hyperscapeMessageInput, setHyperscapeMessageInput] = useState("");
  const [hyperscapeCommand, setHyperscapeCommand] = useState<
    (typeof HYPERSCAPE_COMMAND_OPTIONS)[number]
  >("chat");
  const [hyperscapeCommandDataInput, setHyperscapeCommandDataInput] =
    useState("{}");

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await client.listApps();
      setApps(list);
    } catch (err) {
      setError(`Failed to load apps: ${err instanceof Error ? err.message : "network error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleLaunch = async (app: RegistryAppInfo) => {
    setBusyApp(app.name);
    try {
      const result = await client.launchApp(app.name);
      if (result.viewer?.url) {
        setState("activeGameApp", app.name);
        setState("activeGameDisplayName", app.displayName ?? app.name);
        setState("activeGameViewerUrl", result.viewer.url);
        setState("activeGameSandbox", result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX);
        setState("activeGamePostMessageAuth", Boolean(result.viewer.postMessageAuth));
        setState("activeGamePostMessagePayload", result.viewer.authMessage ?? null);
        if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
          setActionNotice(
            `${app.displayName ?? app.name} requires iframe auth, but no auth payload is configured.`,
            "error",
            4800,
          );
        }
        setState("tab", "game");
        return;
      }
      clearActiveGameState();
      const targetUrl = result.launchUrl ?? app.launchUrl;
      if (targetUrl) {
        const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
        if (popup) {
          setActionNotice(
            `${app.displayName ?? app.name} opened in a new tab.`,
            "success",
            2600,
          );
        } else {
          setActionNotice(
            `Popup blocked while opening ${app.displayName ?? app.name}. Allow popups and try again.`,
            "error",
            4200,
          );
        }
        return;
      }
      setActionNotice(
        `${app.displayName ?? app.name} launched, but no viewer or URL is configured.`,
        "error",
        4000,
      );
    } catch (err) {
      setActionNotice(
        `Failed to launch ${app.displayName ?? app.name}: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4000,
      );
    } finally {
      setBusyApp(null);
    }
  };

  const hyperscapeAppAvailable = useMemo(
    () => apps.some((app) => app.name === HYPERSCAPE_APP_NAME),
    [apps],
  );

  const selectedHyperscapeAgent = useMemo(
    () =>
      hyperscapeAgents.find((agent) => agent.agentId === hyperscapeSelectedAgentId) ??
      null,
    [hyperscapeAgents, hyperscapeSelectedAgentId],
  );

  const loadHyperscapeAgents = useCallback(async () => {
    setHyperscapeAgentsLoading(true);
    setHyperscapeError(null);
    try {
      const response = await client.listHyperscapeEmbeddedAgents();
      setHyperscapeAgents(response.agents);
      setHyperscapeSelectedAgentId((current) => {
        if (current && response.agents.some((agent) => agent.agentId === current)) {
          return current;
        }
        return response.agents[0]?.agentId ?? "";
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load agents";
      setHyperscapeError(message);
      setActionNotice(`Hyperscape controls: ${message}`, "error", 4200);
    } finally {
      setHyperscapeAgentsLoading(false);
    }
  }, [setActionNotice]);

  const refreshHyperscapeTelemetry = useCallback(
    async (agentId: string) => {
      if (!agentId) return;
      setHyperscapeTelemetryLoading(true);
      try {
        const [goalResponse, quickActionsResponse] = await Promise.all([
          client.getHyperscapeAgentGoal(agentId),
          client.getHyperscapeAgentQuickActions(agentId),
        ]);
        setHyperscapeGoalResponse(goalResponse);
        setHyperscapeQuickActionsResponse(quickActionsResponse);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to load agent telemetry";
        setActionNotice(`Hyperscape telemetry: ${message}`, "error", 4200);
      } finally {
        setHyperscapeTelemetryLoading(false);
      }
    },
    [setActionNotice],
  );

  useEffect(() => {
    if (!hyperscapePanelOpen) return;
    void loadHyperscapeAgents();
  }, [hyperscapePanelOpen, loadHyperscapeAgents]);

  useEffect(() => {
    if (!hyperscapePanelOpen || !hyperscapeSelectedAgentId) return;
    void refreshHyperscapeTelemetry(hyperscapeSelectedAgentId);
  }, [
    hyperscapePanelOpen,
    hyperscapeSelectedAgentId,
    refreshHyperscapeTelemetry,
  ]);

  const handleToggleHyperscapePanel = useCallback(() => {
    setHyperscapePanelOpen((open) => !open);
  }, []);

  const handleCreateHyperscapeAgent = useCallback(async () => {
    const characterId = hyperscapeCharacterIdInput.trim();
    if (!characterId) {
      setActionNotice("Character ID is required to create an embedded agent.", "error", 3600);
      return;
    }
    setHyperscapeBusyAction("create");
    try {
      const response = await client.createHyperscapeEmbeddedAgent({
        characterId,
        autoStart: hyperscapeAutoStart,
        scriptedRole: hyperscapeScriptedRole || undefined,
      });
      setActionNotice(
        response.message ?? "Embedded agent created.",
        "success",
        3000,
      );
      setHyperscapeCharacterIdInput("");
      await loadHyperscapeAgents();
      if (response.agent?.agentId) {
        setHyperscapeSelectedAgentId(response.agent.agentId);
        await refreshHyperscapeTelemetry(response.agent.agentId);
      }
    } catch (err) {
      setActionNotice(
        `Failed to create embedded agent: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4200,
      );
    } finally {
      setHyperscapeBusyAction(null);
    }
  }, [
    hyperscapeAutoStart,
    hyperscapeCharacterIdInput,
    hyperscapeScriptedRole,
    loadHyperscapeAgents,
    refreshHyperscapeTelemetry,
    setActionNotice,
  ]);

  const handleControlHyperscapeAgent = useCallback(
    async (action: HyperscapeEmbeddedAgentControlAction) => {
      if (!selectedHyperscapeAgent) {
        setActionNotice("Select an embedded agent first.", "error", 3200);
        return;
      }
      setHyperscapeBusyAction(`control:${action}`);
      try {
        const response = await client.controlHyperscapeEmbeddedAgent(
          selectedHyperscapeAgent.characterId,
          action,
        );
        setActionNotice(
          response.message ?? `Agent ${action} request sent.`,
          "success",
          3000,
        );
        await loadHyperscapeAgents();
        await refreshHyperscapeTelemetry(selectedHyperscapeAgent.agentId);
      } catch (err) {
        setActionNotice(
          `Failed to ${action} agent: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      } finally {
        setHyperscapeBusyAction(null);
      }
    },
    [
      loadHyperscapeAgents,
      refreshHyperscapeTelemetry,
      selectedHyperscapeAgent,
      setActionNotice,
    ],
  );

  const handleSendHyperscapeMessage = useCallback(
    async (contentOverride?: string) => {
      if (!selectedHyperscapeAgent) {
        setActionNotice("Select an embedded agent first.", "error", 3200);
        return;
      }
      const content = (contentOverride ?? hyperscapeMessageInput).trim();
      if (!content) {
        setActionNotice("Message cannot be empty.", "error", 3000);
        return;
      }
      setHyperscapeBusyAction("message");
      try {
        const response = await client.sendHyperscapeAgentMessage(
          selectedHyperscapeAgent.agentId,
          content,
        );
        setActionNotice(response.message ?? "Message sent to agent.", "success", 3000);
        if (!contentOverride) {
          setHyperscapeMessageInput("");
        }
      } catch (err) {
        setActionNotice(
          `Failed to send message: ${err instanceof Error ? err.message : "error"}`,
          "error",
          4200,
        );
      } finally {
        setHyperscapeBusyAction(null);
      }
    },
    [hyperscapeMessageInput, selectedHyperscapeAgent, setActionNotice],
  );

  const handleSendHyperscapeCommand = useCallback(async () => {
    if (!selectedHyperscapeAgent) {
      setActionNotice("Select an embedded agent first.", "error", 3200);
      return;
    }
    const command = hyperscapeCommand.trim();
    if (!command) {
      setActionNotice("Command cannot be empty.", "error", 3200);
      return;
    }
    const parsedData = parseHyperscapeCommandData(hyperscapeCommandDataInput);
    if (parsedData === null) {
      setActionNotice("Command data must be valid JSON object.", "error", 3600);
      return;
    }
    setHyperscapeBusyAction("command");
    try {
      const response = await client.sendHyperscapeEmbeddedAgentCommand(
        selectedHyperscapeAgent.characterId,
        command,
        parsedData,
      );
      setActionNotice(
        response.message ?? `Command "${command}" sent.`,
        "success",
        3000,
      );
      await loadHyperscapeAgents();
      await refreshHyperscapeTelemetry(selectedHyperscapeAgent.agentId);
    } catch (err) {
      setActionNotice(
        `Failed to send command: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4200,
      );
    } finally {
      setHyperscapeBusyAction(null);
    }
  }, [
    hyperscapeCommand,
    hyperscapeCommandDataInput,
    loadHyperscapeAgents,
    refreshHyperscapeTelemetry,
    selectedHyperscapeAgent,
    setActionNotice,
  ]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filtered = apps.filter((app) => {
    if (!normalizedSearch) return true;
    return (
      app.name.toLowerCase().includes(normalizedSearch) ||
      (app.displayName ?? "").toLowerCase().includes(normalizedSearch) ||
      (app.description ?? "").toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-txt text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={loadApps}
          className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
        >
          Refresh
        </button>
      </div>

      {hyperscapeAppAvailable ? (
        <div className="mb-4 border border-border bg-card">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
            <div className="font-bold text-xs">Hyperscape Control Panel</div>
            <span className="text-[10px] text-muted">
              Embedded agents, commands, and telemetry
            </span>
            <span className="flex-1" />
            <button
              onClick={handleToggleHyperscapePanel}
              className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
            >
              {hyperscapePanelOpen
                ? "Hide Hyperscape Controls"
                : "Show Hyperscape Controls"}
            </button>
          </div>
          {hyperscapePanelOpen ? (
            <div className="p-3 flex flex-col gap-3">
              {hyperscapeError ? (
                <div className="p-2 border border-danger text-danger text-xs">
                  {hyperscapeError}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                <button
                  className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
                  disabled={hyperscapeAgentsLoading}
                  onClick={() => void loadHyperscapeAgents()}
                >
                  {hyperscapeAgentsLoading ? "Refreshing..." : "Refresh Agents"}
                </button>
                <button
                  className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
                  disabled={
                    hyperscapeTelemetryLoading || !hyperscapeSelectedAgentId
                  }
                  onClick={() =>
                    void refreshHyperscapeTelemetry(hyperscapeSelectedAgentId)
                  }
                >
                  {hyperscapeTelemetryLoading
                    ? "Loading telemetry..."
                    : "Refresh Goal + Quick Actions"}
                </button>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-muted">
                  Embedded agents ({hyperscapeAgents.length})
                </label>
                <select
                  value={hyperscapeSelectedAgentId}
                  onChange={(event) =>
                    setHyperscapeSelectedAgentId(event.target.value)
                  }
                  className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none"
                >
                  <option value="">Select embedded agent</option>
                  {hyperscapeAgents.map((agent) => (
                    <option key={agent.agentId} value={agent.agentId}>
                      {agent.name} ({agent.state}) [{agent.agentId}]
                    </option>
                  ))}
                </select>
                {selectedHyperscapeAgent ? (
                  <div className="text-[11px] text-muted">
                    Character: {selectedHyperscapeAgent.characterId} | Health:{" "}
                    {selectedHyperscapeAgent.health ?? "n/a"}
                    {" / "}
                    {selectedHyperscapeAgent.maxHealth ?? "n/a"} | Position:{" "}
                    {formatHyperscapePosition(selectedHyperscapeAgent.position)}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {(["start", "pause", "resume", "stop"] as const).map((action) => (
                  <button
                    key={action}
                    className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
                    disabled={
                      !selectedHyperscapeAgent ||
                      hyperscapeBusyAction === `control:${action}`
                    }
                    onClick={() => void handleControlHyperscapeAgent(action)}
                  >
                    {hyperscapeBusyAction === `control:${action}`
                      ? `${action}...`
                      : action.charAt(0).toUpperCase() + action.slice(1)}
                  </button>
                ))}
              </div>

              <div className="border border-border p-2 flex flex-col gap-2">
                <div className="font-bold text-xs">Create Embedded Agent</div>
                <input
                  type="text"
                  value={hyperscapeCharacterIdInput}
                  onChange={(event) =>
                    setHyperscapeCharacterIdInput(event.target.value)
                  }
                  placeholder="Character ID"
                  className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none"
                />
                <div className="flex flex-wrap gap-2 items-center">
                  <select
                    value={hyperscapeScriptedRole}
                    onChange={(event) =>
                      setHyperscapeScriptedRole(
                        event.target.value as "" | HyperscapeScriptedRole,
                      )
                    }
                    className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none"
                  >
                    <option value="">No scripted role</option>
                    {HYPERSCAPE_SCRIPTED_ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-muted flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={hyperscapeAutoStart}
                      onChange={(event) =>
                        setHyperscapeAutoStart(event.target.checked)
                      }
                    />
                    Auto start
                  </label>
                  <button
                    className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
                    disabled={hyperscapeBusyAction === "create"}
                    onClick={() => void handleCreateHyperscapeAgent()}
                  >
                    {hyperscapeBusyAction === "create"
                      ? "Creating..."
                      : "Create Agent"}
                  </button>
                </div>
              </div>

              <div className="border border-border p-2 flex flex-col gap-2">
                <div className="font-bold text-xs">Send Message</div>
                <textarea
                  rows={2}
                  value={hyperscapeMessageInput}
                  onChange={(event) => setHyperscapeMessageInput(event.target.value)}
                  placeholder="Say something to selected agent..."
                  className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none resize-y"
                />
                <button
                  className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 self-start"
                  disabled={hyperscapeBusyAction === "message"}
                  onClick={() => void handleSendHyperscapeMessage()}
                >
                  {hyperscapeBusyAction === "message"
                    ? "Sending..."
                    : "Send Message"}
                </button>
              </div>

              <div className="border border-border p-2 flex flex-col gap-2">
                <div className="font-bold text-xs">Send Command</div>
                <select
                  value={hyperscapeCommand}
                  onChange={(event) =>
                    setHyperscapeCommand(
                      event.target.value as (typeof HYPERSCAPE_COMMAND_OPTIONS)[number],
                    )
                  }
                  className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none"
                >
                  {HYPERSCAPE_COMMAND_OPTIONS.map((command) => (
                    <option key={command} value={command}>
                      {command}
                    </option>
                  ))}
                </select>
                <textarea
                  rows={2}
                  value={hyperscapeCommandDataInput}
                  onChange={(event) =>
                    setHyperscapeCommandDataInput(event.target.value)
                  }
                  placeholder='{"target":[0,0,0]}'
                  className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none resize-y"
                />
                <button
                  className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 self-start"
                  disabled={hyperscapeBusyAction === "command"}
                  onClick={() => void handleSendHyperscapeCommand()}
                >
                  {hyperscapeBusyAction === "command"
                    ? "Sending..."
                    : "Send Command"}
                </button>
              </div>

              <div className="border border-border p-2 flex flex-col gap-2">
                <div className="font-bold text-xs">Goal + Quick Actions</div>
                <div className="text-xs text-muted">
                  {hyperscapeGoalResponse?.goal ? (
                    <>
                      Goal: {hyperscapeGoalResponse.goal.description ?? "unknown"}
                      {typeof hyperscapeGoalResponse.goal.progressPercent === "number"
                        ? ` (${hyperscapeGoalResponse.goal.progressPercent}%)`
                        : ""}
                    </>
                  ) : (
                    hyperscapeGoalResponse?.message ??
                    "No active goal loaded for the selected agent."
                  )}
                </div>

                {hyperscapeGoalResponse?.availableGoals?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {hyperscapeGoalResponse.availableGoals.slice(0, 8).map((goal) => (
                      <span
                        key={goal.id}
                        className="text-[10px] px-1.5 py-0.5 border border-border text-muted"
                        title={goal.description}
                      >
                        {goal.type}
                      </span>
                    ))}
                  </div>
                ) : null}

                {hyperscapeQuickActionsResponse?.quickCommands?.length ? (
                  <div className="flex flex-wrap gap-1">
                    {hyperscapeQuickActionsResponse.quickCommands.map((command) => (
                      <button
                        key={command.id}
                        className="text-[10px] px-2 py-1 border border-border bg-card text-txt cursor-pointer hover:bg-accent hover:text-accent-fg disabled:opacity-40"
                        disabled={!command.available || hyperscapeBusyAction === "message"}
                        onClick={() => void handleSendHyperscapeMessage(command.command)}
                        title={command.reason ?? command.command}
                      >
                        {command.label}
                      </button>
                    ))}
                  </div>
                ) : null}

                {hyperscapeQuickActionsResponse?.nearbyLocations?.length ? (
                  <div className="text-[11px] text-muted">
                    Nearby:{" "}
                    {hyperscapeQuickActionsResponse.nearbyLocations
                      .slice(0, 4)
                      .map((location) => `${location.name} (${location.distance})`)
                      .join(", ")}
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {error && (
        <div className="p-3 border border-danger text-danger text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted italic">Loading apps...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted italic">{searchQuery ? "No apps match your search." : "No apps available."}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {filtered.map((app) => (
            <div
              key={app.name}
              className="border border-border p-4 bg-card flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <div className="font-bold text-sm">{app.displayName ?? app.name}</div>
                {app.category && (
                  <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                    {CATEGORY_LABELS[app.category] ?? app.category}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted flex-1">{app.description ?? "No description"}</div>
              <button
                className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover self-start disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={busyApp === app.name}
                onClick={() => handleLaunch(app)}
              >
                {busyApp === app.name ? "Launching..." : "Launch"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
