/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
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

function formatHyperscapePosition(
  position: HyperscapeEmbeddedAgent["position"],
): string {
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
    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return parsed as { [key: string]: HyperscapeJsonValue };
  } catch {
    return null;
  }
}

export function AppsView() {
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    setState,
    setActionNotice,
  } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [activeAppNames, setActiveAppNames] = useState<Set<string>>(new Set());
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
  const [busyApp, setBusyApp] = useState<string | null>(null);
  const [hyperscapePanelOpen, setHyperscapePanelOpen] = useState(false);
  const [hyperscapeAgents, setHyperscapeAgents] = useState<
    HyperscapeEmbeddedAgent[]
  >([]);
  const [hyperscapeAgentsLoading, setHyperscapeAgentsLoading] = useState(false);
  const [hyperscapeTelemetryLoading, setHyperscapeTelemetryLoading] =
    useState(false);
  const [hyperscapeBusyAction, setHyperscapeBusyAction] = useState<
    string | null
  >(null);
  const [hyperscapeError, setHyperscapeError] = useState<string | null>(null);
  const [hyperscapeSelectedAgentId, setHyperscapeSelectedAgentId] =
    useState("");
  const [hyperscapeGoalResponse, setHyperscapeGoalResponse] =
    useState<HyperscapeAgentGoalResponse | null>(null);
  const [hyperscapeQuickActionsResponse, setHyperscapeQuickActionsResponse] =
    useState<HyperscapeQuickActionsResponse | null>(null);
  const [hyperscapeCharacterIdInput, setHyperscapeCharacterIdInput] =
    useState("");
  const [hyperscapeScriptedRole, setHyperscapeScriptedRole] = useState<
    "" | HyperscapeScriptedRole
  >("");
  const [hyperscapeAutoStart, setHyperscapeAutoStart] = useState(true);
  const [hyperscapeMessageInput, setHyperscapeMessageInput] = useState("");
  const [hyperscapeCommand, setHyperscapeCommand] =
    useState<(typeof HYPERSCAPE_COMMAND_OPTIONS)[number]>("chat");
  const [hyperscapeCommandDataInput, setHyperscapeCommandDataInput] =
    useState("{}");
  const currentGameViewerUrl =
    typeof activeGameViewerUrl === "string" ? activeGameViewerUrl : "";
  const hasCurrentGame = currentGameViewerUrl.trim().length > 0;

  const selectedApp = useMemo(
    () => apps.find((app) => app.name === selectedAppName) ?? null,
    [apps, selectedAppName],
  );
  const selectedAppHasActiveViewer =
    !!selectedApp && hasCurrentGame && activeGameApp === selectedApp.name;
  const selectedAppIsActive =
    !!selectedApp && activeAppNames.has(selectedApp.name);
  const hyperscapeDetailOpen = selectedApp?.name === HYPERSCAPE_APP_NAME;

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [list, installed] = await Promise.all([
        client.listApps(),
        client.listInstalledApps().catch(() => []),
      ]);
      setApps(list);
      setActiveAppNames(new Set(installed.map((app) => app.name)));
      setSelectedAppName((current) => {
        if (!current) return current;
        return list.some((app) => app.name === current) ? current : null;
      });
    } catch (err) {
      setError(
        `Failed to load apps: ${err instanceof Error ? err.message : "network error"}`,
      );
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
    void loadApps();
  }, [loadApps]);

  const handleLaunch = async (app: RegistryAppInfo) => {
    setBusyApp(app.name);
    try {
      const result = await client.launchApp(app.name);
      setActiveAppNames((previous) => {
        const next = new Set(previous);
        next.add(app.name);
        return next;
      });
      if (result.viewer?.url) {
        setState("activeGameApp", app.name);
        setState("activeGameDisplayName", app.displayName ?? app.name);
        setState("activeGameViewerUrl", result.viewer.url);
        setState(
          "activeGameSandbox",
          result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX,
        );
        setState(
          "activeGamePostMessageAuth",
          Boolean(result.viewer.postMessageAuth),
        );
        setState(
          "activeGamePostMessagePayload",
          result.viewer.authMessage ?? null,
        );
        if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
          setActionNotice(
            `${app.displayName ?? app.name} requires iframe auth, but no auth payload is configured.`,
            "error",
            4800,
          );
        }
        setState("tab", "apps");
        setState("appsSubTab", "games");
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

  const handleOpenCurrentGame = useCallback(() => {
    if (!hasCurrentGame) return;
    setState("tab", "apps");
    setState("appsSubTab", "games");
  }, [hasCurrentGame, setState]);

  const handleOpenCurrentGameInNewTab = useCallback(() => {
    if (!hasCurrentGame) return;
    const popup = window.open(
      currentGameViewerUrl,
      "_blank",
      "noopener,noreferrer",
    );
    if (popup) {
      setActionNotice("Current game opened in a new tab.", "success", 2600);
      return;
    }
    setActionNotice(
      "Popup blocked. Allow popups and try again.",
      "error",
      4200,
    );
  }, [currentGameViewerUrl, hasCurrentGame, setActionNotice]);

  const selectedHyperscapeAgent = useMemo(
    () =>
      hyperscapeAgents.find(
        (agent) => agent.agentId === hyperscapeSelectedAgentId,
      ) ?? null,
    [hyperscapeAgents, hyperscapeSelectedAgentId],
  );

  const loadHyperscapeAgents = useCallback(async () => {
    setHyperscapeAgentsLoading(true);
    setHyperscapeError(null);
    try {
      const response = await client.listHyperscapeEmbeddedAgents();
      setHyperscapeAgents(response.agents);
      setHyperscapeSelectedAgentId((current) => {
        if (
          current &&
          response.agents.some((agent) => agent.agentId === current)
        ) {
          return current;
        }
        return response.agents[0]?.agentId ?? "";
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load agents";
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
    if (!hyperscapeDetailOpen || !hyperscapePanelOpen) return;
    void loadHyperscapeAgents();
  }, [hyperscapeDetailOpen, hyperscapePanelOpen, loadHyperscapeAgents]);

  useEffect(() => {
    if (
      !hyperscapeDetailOpen ||
      !hyperscapePanelOpen ||
      !hyperscapeSelectedAgentId
    ) {
      return;
    }
    void refreshHyperscapeTelemetry(hyperscapeSelectedAgentId);
  }, [
    hyperscapeDetailOpen,
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
      setActionNotice(
        "Character ID is required to create an embedded agent.",
        "error",
        3600,
      );
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
        setActionNotice(
          response.message ?? "Message sent to agent.",
          "success",
          3000,
        );
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
  const ALLOWED_APP_KEYWORDS = [
    "2004scape",
    "hyperscape",
    "hyperfy",
    "babylon",
  ];

  const filtered = apps.filter((app) => {
    const isAllowed = ALLOWED_APP_KEYWORDS.some((keyword) =>
      app.name.toLowerCase().includes(keyword),
    );
    if (!isAllowed) return false;

    if (
      normalizedSearch &&
      !app.name.toLowerCase().includes(normalizedSearch) &&
      !(app.displayName ?? "").toLowerCase().includes(normalizedSearch) &&
      !(app.description ?? "").toLowerCase().includes(normalizedSearch)
    ) {
      return false;
    }
    if (showActiveOnly && !activeAppNames.has(app.name)) {
      return false;
    }
    return true;
  });

  const renderHyperscapeControls = () => (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={handleToggleHyperscapePanel}
        className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover self-start"
      >
        {hyperscapePanelOpen
          ? "Hide Hyperscape Controls"
          : "Show Hyperscape Controls"}
      </button>
      {hyperscapePanelOpen ? (
        <div className="flex flex-col gap-3">
          {hyperscapeError ? (
            <div className="p-2 border border-danger text-danger text-xs">
              {hyperscapeError}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40"
              disabled={hyperscapeAgentsLoading}
              onClick={() => void loadHyperscapeAgents()}
            >
              {hyperscapeAgentsLoading ? "Refreshing..." : "Refresh Agents"}
            </button>
            <button
              type="button"
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
            <span className="text-[11px] text-muted">
              Embedded agents ({hyperscapeAgents.length})
            </span>
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
                type="button"
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
              <span className="text-xs text-muted flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={hyperscapeAutoStart}
                  onChange={(event) =>
                    setHyperscapeAutoStart(event.target.checked)
                  }
                />
                Auto start
              </span>
              <button
                type="button"
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
              onChange={(event) =>
                setHyperscapeMessageInput(event.target.value)
              }
              placeholder="Say something to selected agent..."
              className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none resize-y"
            />
            <button
              type="button"
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
                  event.target
                    .value as (typeof HYPERSCAPE_COMMAND_OPTIONS)[number],
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
              type="button"
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
                  {typeof hyperscapeGoalResponse.goal.progressPercent ===
                  "number"
                    ? ` (${hyperscapeGoalResponse.goal.progressPercent}%)`
                    : ""}
                </>
              ) : (
                (hyperscapeGoalResponse?.message ??
                "No active goal loaded for the selected agent.")
              )}
            </div>

            {hyperscapeGoalResponse?.availableGoals?.length ? (
              <div className="flex flex-wrap gap-1">
                {hyperscapeGoalResponse.availableGoals
                  .slice(0, 8)
                  .map((goal) => (
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
                    type="button"
                    key={command.id}
                    className="text-[10px] px-2 py-1 border border-border bg-card text-txt cursor-pointer hover:bg-accent hover:text-accent-fg disabled:opacity-40"
                    disabled={
                      !command.available || hyperscapeBusyAction === "message"
                    }
                    onClick={() =>
                      void handleSendHyperscapeMessage(command.command)
                    }
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
  );

  const renderActiveSessionCard = () => {
    if (!hasCurrentGame) return null;

    return (
      <div className="mb-4 border border-border bg-card p-3 flex flex-col gap-2">
        <div className="font-bold text-xs">Active Game Session</div>
        <div className="text-sm">
          {activeGameDisplayName || activeGameApp || "Current game"}
        </div>
        <div className="text-[11px] text-muted">
          Resume in full-screen or open the viewer in a new tab.
        </div>
        <div className="text-[11px] text-muted break-all">
          {currentGameViewerUrl}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleOpenCurrentGame}
            className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
          >
            Resume Fullscreen
          </button>
          <button
            type="button"
            onClick={handleOpenCurrentGameInNewTab}
            className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
          >
            Open in New Tab
          </button>
        </div>
      </div>
    );
  };

  if (selectedApp) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-4">
          <button
            type="button"
            onClick={() => setSelectedAppName(null)}
            className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
          >
            Back
          </button>
          <div className="text-[11px] text-muted break-all">
            {selectedApp.name}
          </div>
        </div>

        {renderActiveSessionCard()}

        {error ? (
          <div className="p-3 border border-danger text-danger text-xs mb-3">
            {error}
          </div>
        ) : null}

        <div className="border border-border p-4 bg-card flex flex-col gap-3">
          <div className="flex items-start gap-2">
            <div>
              <div className="font-bold text-sm">
                {selectedApp.displayName ?? selectedApp.name}
              </div>
              <div className="text-xs text-muted">
                {selectedApp.description ?? "No description"}
              </div>
            </div>
            <span className="flex-1" />
            {selectedAppIsActive ? (
              <span className="text-[10px] px-1.5 py-0.5 border border-ok text-ok">
                Active
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                Inactive
              </span>
            )}
            {selectedApp.category ? (
              <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                {CATEGORY_LABELS[selectedApp.category] ?? selectedApp.category}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
              disabled={busyApp === selectedApp.name}
              onClick={() => void handleLaunch(selectedApp)}
            >
              {busyApp === selectedApp.name ? "Launching..." : "Launch"}
            </button>
            {selectedAppHasActiveViewer ? (
              <button
                type="button"
                className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
                onClick={handleOpenCurrentGame}
              >
                View Active Session
              </button>
            ) : null}
            {selectedAppHasActiveViewer ? (
              <button
                type="button"
                className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
                onClick={handleOpenCurrentGameInNewTab}
              >
                Open Viewer in New Tab
              </button>
            ) : null}
          </div>

          <div className="border border-border p-2 flex flex-col gap-1 text-[11px]">
            <div>
              <span className="text-muted">Launch type:</span>{" "}
              {selectedApp.launchType || "n/a"}
            </div>
            <div>
              <span className="text-muted">Latest version:</span>{" "}
              {selectedApp.latestVersion ?? "n/a"}
            </div>
            <div>
              <span className="text-muted">Launch URL:</span>{" "}
              {selectedApp.launchUrl ?? "n/a"}
            </div>
            <div className="break-all">
              <span className="text-muted">Repository:</span>{" "}
              {selectedApp.repository ? (
                <a
                  href={selectedApp.repository}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent hover:underline"
                >
                  {selectedApp.repository}
                </a>
              ) : (
                "n/a"
              )}
            </div>
          </div>

          {selectedApp.capabilities?.length ? (
            <div className="border border-border p-2 flex flex-col gap-1">
              <div className="font-bold text-xs">Capabilities</div>
              <div className="flex flex-wrap gap-1">
                {selectedApp.capabilities.map((capability) => (
                  <span
                    key={capability}
                    className="text-[10px] px-1.5 py-0.5 border border-border text-muted"
                  >
                    {capability}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {selectedApp.viewer ? (
            <div className="border border-border p-2 flex flex-col gap-1 text-[11px]">
              <div className="font-bold text-xs">Viewer Config</div>
              <div className="break-all">
                <span className="text-muted">URL:</span>{" "}
                {selectedApp.viewer.url}
              </div>
              <div>
                <span className="text-muted">postMessage auth:</span>{" "}
                {selectedApp.viewer.postMessageAuth ? "enabled" : "disabled"}
              </div>
              <div>
                <span className="text-muted">Sandbox:</span>{" "}
                {selectedApp.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX}
              </div>
            </div>
          ) : null}

          {selectedApp.name === HYPERSCAPE_APP_NAME ? (
            <div className="border border-border p-2 flex flex-col gap-2">
              <div className="font-bold text-xs">Hyperscape Controls</div>
              <div className="text-[11px] text-muted">
                Embedded agents, commands, and telemetry.
              </div>
              {renderHyperscapeControls()}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-txt text-sm focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() => void loadApps()}
          className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
        >
          Refresh
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 text-[11px] text-muted">
        <button
          type="button"
          onClick={() => setShowActiveOnly((current) => !current)}
          className="px-2.5 py-1 text-[11px] bg-card border border-border cursor-pointer hover:border-accent"
        >
          {showActiveOnly ? "Showing Active" : "Active Only"}
        </button>
        <span>{activeAppNames.size} active</span>
      </div>

      {renderActiveSessionCard()}

      {error && (
        <div className="p-3 border border-danger text-danger text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted italic">
          Loading apps...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted italic">
          {showActiveOnly
            ? "No active apps found."
            : searchQuery
              ? "No apps match your search."
              : "No apps available."}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {filtered.map((app) => {
            const isActive = activeAppNames.has(app.name);
            return (
              <div
                key={app.name}
                className="border border-border p-4 bg-card flex flex-col gap-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="font-bold text-sm">
                    {app.displayName ?? app.name}
                  </div>
                  <button
                    type="button"
                    className="text-xs px-2 py-0.5 bg-card border border-border cursor-pointer hover:border-accent"
                    onClick={() => setSelectedAppName(app.name)}
                    title={`Open ${app.displayName ?? app.name}`}
                  >
                    {">"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {app.category ? (
                    <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                      {CATEGORY_LABELS[app.category] ?? app.category}
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="text-[10px] px-1.5 py-0.5 border border-ok text-ok">
                      Active
                    </span>
                  ) : null}
                </div>

                <div className="text-xs text-muted flex-1">
                  {app.description ?? "No description"}
                </div>

                <button
                  type="button"
                  className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover self-start disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={busyApp === app.name}
                  onClick={() => void handleLaunch(app)}
                >
                  {busyApp === app.name ? "Launching..." : "Launch"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
