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
import { createTranslator } from "../i18n";

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
const HYPERSCAPE_SCRIPTED_ROLE_OPTIONS: HyperscapeScriptedRole[] = [
  "balanced",
  "combat",
  "woodcutting",
  "fishing",
  "mining",
];

const CATEGORY_LABEL_KEYS: Record<string, string> = {
  game: "apps.ui.category.game",
  social: "apps.ui.category.social",
  platform: "apps.ui.category.platform",
  world: "apps.ui.category.world",
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
  const {
    activeGameApp,
    activeGameDisplayName,
    activeGameViewerUrl,
    uiLanguage,
    setState,
    setActionNotice,
  } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showActiveOnly, setShowActiveOnly] = useState(false);
  const [activeAppNames, setActiveAppNames] = useState<Set<string>>(new Set());
  const [selectedAppName, setSelectedAppName] = useState<string | null>(null);
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
  const getCategoryLabel = useCallback(
    (category?: string) => {
      if (!category) return "";
      const key = CATEGORY_LABEL_KEYS[category];
      return key ? t(key) : category;
    },
    [t],
  );
  const getHyperscapeRoleLabel = useCallback(
    (role: HyperscapeScriptedRole) => t(`apps.ui.hyperscape.role.${role}`),
    [t],
  );
  const getHyperscapeCommandLabel = useCallback(
    (command: (typeof HYPERSCAPE_COMMAND_OPTIONS)[number]) =>
      t(`apps.ui.hyperscape.command.${command}`),
    [t],
  );

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
        t("apps.ui.failedLoadApps", {
          error: err instanceof Error ? err.message : t("apps.ui.networkError"),
        }),
      );
    } finally {
      setLoading(false);
    }
  }, [t]);

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
        setState("activeGameSandbox", result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX);
        setState("activeGamePostMessageAuth", Boolean(result.viewer.postMessageAuth));
        setState("activeGamePostMessagePayload", result.viewer.authMessage ?? null);
        if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
          setActionNotice(
            t("apps.notice.requiresIframeAuthMissingPayload", {
              appName: app.displayName ?? app.name,
            }),
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
            t("apps.notice.openedInNewTab", { appName: app.displayName ?? app.name }),
            "success",
            2600,
          );
        } else {
          setActionNotice(
            t("apps.notice.popupBlockedWhileOpening", {
              appName: app.displayName ?? app.name,
            }),
            "error",
            4200,
          );
        }
        return;
      }
      setActionNotice(
        t("apps.notice.launchedWithoutViewerOrUrl", {
          appName: app.displayName ?? app.name,
        }),
        "error",
        4000,
      );
    } catch (err) {
      setActionNotice(
        t("apps.notice.failedLaunch", {
          appName: app.displayName ?? app.name,
          error: err instanceof Error ? err.message : "error",
        }),
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
    const popup = window.open(currentGameViewerUrl, "_blank", "noopener,noreferrer");
    if (popup) {
      setActionNotice(t("apps.notice.currentGameOpenedInNewTab"), "success", 2600);
      return;
    }
    setActionNotice(t("apps.notice.popupBlocked"), "error", 4200);
  }, [currentGameViewerUrl, hasCurrentGame, setActionNotice, t]);

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
      const message = err instanceof Error ? err.message : t("apps.ui.hyperscape.failedLoadAgents");
      setHyperscapeError(message);
      setActionNotice(t("apps.notice.hyperscapeControlsError", { error: message }), "error", 4200);
    } finally {
      setHyperscapeAgentsLoading(false);
    }
  }, [setActionNotice, t]);

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
          err instanceof Error ? err.message : t("apps.ui.hyperscape.failedLoadTelemetry");
        setActionNotice(t("apps.notice.hyperscapeTelemetryError", { error: message }), "error", 4200);
      } finally {
        setHyperscapeTelemetryLoading(false);
      }
    },
    [setActionNotice, t],
  );

  useEffect(() => {
    if (!hyperscapeDetailOpen || !hyperscapePanelOpen) return;
    void loadHyperscapeAgents();
  }, [hyperscapeDetailOpen, hyperscapePanelOpen, loadHyperscapeAgents]);

  useEffect(() => {
    if (!hyperscapeDetailOpen || !hyperscapePanelOpen || !hyperscapeSelectedAgentId) {
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
      setActionNotice(t("apps.notice.characterIdRequired"), "error", 3600);
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
        response.message ?? t("apps.notice.embeddedAgentCreated"),
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
        t("apps.notice.failedCreateEmbeddedAgent", {
          error: err instanceof Error ? err.message : t("apps.ui.error"),
        }),
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
    t,
  ]);

  const handleControlHyperscapeAgent = useCallback(
    async (action: HyperscapeEmbeddedAgentControlAction) => {
      if (!selectedHyperscapeAgent) {
        setActionNotice(t("apps.notice.selectEmbeddedAgentFirst"), "error", 3200);
        return;
      }
      setHyperscapeBusyAction(`control:${action}`);
      try {
        const response = await client.controlHyperscapeEmbeddedAgent(
          selectedHyperscapeAgent.characterId,
          action,
        );
        setActionNotice(
          response.message ?? t("apps.notice.agentActionRequestSent", { action }),
          "success",
          3000,
        );
        await loadHyperscapeAgents();
        await refreshHyperscapeTelemetry(selectedHyperscapeAgent.agentId);
      } catch (err) {
        setActionNotice(
          t("apps.notice.failedAgentAction", {
            action,
            error: err instanceof Error ? err.message : t("apps.ui.error"),
          }),
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
      t,
    ],
  );

  const handleSendHyperscapeMessage = useCallback(
    async (contentOverride?: string) => {
      if (!selectedHyperscapeAgent) {
        setActionNotice(t("apps.notice.selectEmbeddedAgentFirst"), "error", 3200);
        return;
      }
      const content = (contentOverride ?? hyperscapeMessageInput).trim();
      if (!content) {
        setActionNotice(t("apps.notice.messageEmpty"), "error", 3000);
        return;
      }
      setHyperscapeBusyAction("message");
      try {
        const response = await client.sendHyperscapeAgentMessage(
          selectedHyperscapeAgent.agentId,
          content,
        );
        setActionNotice(response.message ?? t("apps.notice.messageSentToAgent"), "success", 3000);
        if (!contentOverride) {
          setHyperscapeMessageInput("");
        }
      } catch (err) {
        setActionNotice(
          t("apps.notice.failedSendMessage", {
            error: err instanceof Error ? err.message : t("apps.ui.error"),
          }),
          "error",
          4200,
        );
      } finally {
        setHyperscapeBusyAction(null);
      }
    },
    [hyperscapeMessageInput, selectedHyperscapeAgent, setActionNotice, t],
  );

  const handleSendHyperscapeCommand = useCallback(async () => {
    if (!selectedHyperscapeAgent) {
      setActionNotice(t("apps.notice.selectEmbeddedAgentFirst"), "error", 3200);
      return;
    }
    const command = hyperscapeCommand.trim();
    if (!command) {
      setActionNotice(t("apps.notice.commandEmpty"), "error", 3200);
      return;
    }
    const parsedData = parseHyperscapeCommandData(hyperscapeCommandDataInput);
    if (parsedData === null) {
      setActionNotice(t("apps.notice.commandDataInvalidJsonObject"), "error", 3600);
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
        response.message ?? t("apps.notice.commandSent", { command }),
        "success",
        3000,
      );
      await loadHyperscapeAgents();
      await refreshHyperscapeTelemetry(selectedHyperscapeAgent.agentId);
    } catch (err) {
      setActionNotice(
        t("apps.notice.failedSendCommand", {
          error: err instanceof Error ? err.message : t("apps.ui.error"),
        }),
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
    t,
  ]);

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filtered = apps.filter((app) => {
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
        onClick={handleToggleHyperscapePanel}
        className="btn text-xs py-1 self-start"
      >
        {hyperscapePanelOpen
          ? t("apps.ui.hyperscape.hideControls")
          : t("apps.ui.hyperscape.showControls")}
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
              className="btn text-xs py-1"
              disabled={hyperscapeAgentsLoading}
              onClick={() => void loadHyperscapeAgents()}
            >
              {hyperscapeAgentsLoading ? t("apps.ui.hyperscape.refreshing") : t("apps.ui.hyperscape.refreshAgents")}
            </button>
            <button
              className="btn text-xs py-1"
              disabled={hyperscapeTelemetryLoading || !hyperscapeSelectedAgentId}
              onClick={() =>
                void refreshHyperscapeTelemetry(hyperscapeSelectedAgentId)
              }
            >
              {hyperscapeTelemetryLoading
                ? t("apps.ui.hyperscape.loadingTelemetry")
                : t("apps.ui.hyperscape.refreshGoalActions")}
            </button>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-muted">
              {t("apps.ui.hyperscape.embeddedAgentsCount", { count: hyperscapeAgents.length })}
            </label>
            <select
              value={hyperscapeSelectedAgentId}
              onChange={(event) => setHyperscapeSelectedAgentId(event.target.value)}
              className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none"
            >
              <option value="">{t("apps.ui.hyperscape.selectEmbeddedAgent")}</option>
              {hyperscapeAgents.map((agent) => (
                <option key={agent.agentId} value={agent.agentId}>
                  {agent.name} ({agent.state}) [{agent.agentId}]
                </option>
              ))}
            </select>
            {selectedHyperscapeAgent ? (
              <div className="text-[11px] text-muted">
                {t("apps.ui.hyperscape.characterLabel")} {selectedHyperscapeAgent.characterId} | {t("apps.ui.hyperscape.healthLabel")}{" "}
                {selectedHyperscapeAgent.health ?? t("apps.ui.notAvailable")}
                {" / "}
                {selectedHyperscapeAgent.maxHealth ?? t("apps.ui.notAvailable")} | {t("apps.ui.hyperscape.positionLabel")}{" "}
                {formatHyperscapePosition(selectedHyperscapeAgent.position)}
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(["start", "pause", "resume", "stop"] as const).map((action) => (
              <button
                key={action}
                className="btn text-xs py-1"
                disabled={
                  !selectedHyperscapeAgent ||
                  hyperscapeBusyAction === `control:${action}`
                }
                onClick={() => void handleControlHyperscapeAgent(action)}
              >
                {hyperscapeBusyAction === `control:${action}`
                  ? t("apps.ui.hyperscape.actionBusy", { action: getHyperscapeCommandLabel(action) })
                  : getHyperscapeCommandLabel(action)}
              </button>
            ))}
          </div>

          <div className="border border-border p-2 flex flex-col gap-2">
            <div className="font-bold text-xs">{t("apps.ui.hyperscape.createEmbeddedAgent")}</div>
            <input
              type="text"
              value={hyperscapeCharacterIdInput}
              onChange={(event) => setHyperscapeCharacterIdInput(event.target.value)}
              placeholder={t("apps.ui.hyperscape.characterIdPlaceholder")}
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
                <option value="">{t("apps.ui.hyperscape.noScriptedRole")}</option>
                {HYPERSCAPE_SCRIPTED_ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {getHyperscapeRoleLabel(role)}
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
                {t("apps.ui.hyperscape.autoStart")}
              </label>
              <button
                className="btn text-xs py-1"
                disabled={hyperscapeBusyAction === "create"}
                onClick={() => void handleCreateHyperscapeAgent()}
              >
                {hyperscapeBusyAction === "create" ? t("apps.ui.hyperscape.creating") : t("apps.ui.hyperscape.createAgent")}
              </button>
            </div>
          </div>

          <div className="border border-border p-2 flex flex-col gap-2">
            <div className="font-bold text-xs">{t("apps.ui.hyperscape.sendMessage")}</div>
            <textarea
              rows={2}
              value={hyperscapeMessageInput}
              onChange={(event) => setHyperscapeMessageInput(event.target.value)}
              placeholder={t("apps.ui.hyperscape.saySomethingPlaceholder")}
              className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none resize-y"
            />
            <button
              className="btn text-xs py-1 self-start"
              disabled={hyperscapeBusyAction === "message"}
              onClick={() => void handleSendHyperscapeMessage()}
            >
              {hyperscapeBusyAction === "message" ? t("apps.ui.hyperscape.sending") : t("apps.ui.hyperscape.sendMessage")}
            </button>
          </div>

          <div className="border border-border p-2 flex flex-col gap-2">
            <div className="font-bold text-xs">{t("apps.ui.hyperscape.sendCommand")}</div>
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
                  {getHyperscapeCommandLabel(command)}
                </option>
              ))}
            </select>
            <textarea
              rows={2}
              value={hyperscapeCommandDataInput}
              onChange={(event) => setHyperscapeCommandDataInput(event.target.value)}
              placeholder='{"target":[0,0,0]}'
              className="px-3 py-2 border border-border rounded-md bg-card text-txt text-xs focus:border-accent focus:outline-none resize-y"
            />
            <button
              className="btn text-xs py-1 self-start"
              disabled={hyperscapeBusyAction === "command"}
              onClick={() => void handleSendHyperscapeCommand()}
            >
              {hyperscapeBusyAction === "command" ? t("apps.ui.hyperscape.sending") : t("apps.ui.hyperscape.sendCommand")}
            </button>
          </div>

          <div className="border border-border p-2 flex flex-col gap-2">
            <div className="font-bold text-xs">{t("apps.ui.hyperscape.goalQuickActions")}</div>
            <div className="text-xs text-muted">
              {hyperscapeGoalResponse?.goal ? (
                <>
                  {t("apps.ui.hyperscape.goalLabel")} {hyperscapeGoalResponse.goal.description ?? t("apps.ui.hyperscape.unknown")}
                  {typeof hyperscapeGoalResponse.goal.progressPercent === "number"
                    ? ` (${hyperscapeGoalResponse.goal.progressPercent}%)`
                    : ""}
                </>
              ) : (
                hyperscapeGoalResponse?.message ??
                t("apps.ui.hyperscape.noActiveGoal")
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
                    className="btn btn-ghost text-[10px] py-1"
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
                {t("apps.ui.hyperscape.nearbyLabel")}{" "}
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
        <div className="font-bold text-xs">{t("apps.ui.activeGameSession")}</div>
        <div className="text-sm">
          {activeGameDisplayName || activeGameApp || t("apps.ui.currentGame")}
        </div>
        <div className="text-[11px] text-muted">
          {t("apps.ui.activeSessionHint")}
        </div>
        <div className="text-[11px] text-muted break-all">{currentGameViewerUrl}</div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleOpenCurrentGame}
            className="btn text-xs py-1"
          >
            {t("apps.ui.resumeFullscreen")}
          </button>
          <button
            onClick={handleOpenCurrentGameInNewTab}
            className="btn text-xs py-1"
          >
            {t("game.action.openInNewTab")}
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
            onClick={() => setSelectedAppName(null)}
            className="btn text-xs py-1"
          >
            {t("common.back")}
          </button>
          <div className="text-[11px] text-muted break-all">{selectedApp.name}</div>
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
              <div className="font-bold text-sm">{selectedApp.displayName ?? selectedApp.name}</div>
              <div className="text-xs text-muted">{selectedApp.description ?? t("apps.ui.noDescription")}</div>
            </div>
            <span className="flex-1" />
            {selectedAppIsActive ? (
              <span className="text-[10px] px-1.5 py-0.5 border border-ok text-ok">
                {t("apps.ui.active")}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                {t("apps.ui.inactive")}
              </span>
            )}
            {selectedApp.category ? (
              <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                {getCategoryLabel(selectedApp.category)}
              </span>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              className="btn text-xs py-1.5"
              disabled={busyApp === selectedApp.name}
              onClick={() => void handleLaunch(selectedApp)}
            >
              {busyApp === selectedApp.name ? t("apps.ui.launching") : t("apps.ui.launch")}
            </button>
            {selectedAppHasActiveViewer ? (
              <button
                className="btn text-xs py-1.5"
                onClick={handleOpenCurrentGame}
              >
                {t("apps.ui.viewActiveSession")}
              </button>
            ) : null}
            {selectedAppHasActiveViewer ? (
              <button
                className="btn text-xs py-1.5"
                onClick={handleOpenCurrentGameInNewTab}
              >
                {t("apps.ui.openViewerInNewTab")}
              </button>
            ) : null}
          </div>

          <div className="border border-border p-2 flex flex-col gap-1 text-[11px]">
            <div>
              <span className="text-muted">{t("apps.ui.launchTypeLabel")}</span> {selectedApp.launchType || t("apps.ui.notAvailable")}
            </div>
            <div>
              <span className="text-muted">{t("apps.ui.latestVersionLabel")}</span> {selectedApp.latestVersion ?? t("apps.ui.notAvailable")}
            </div>
            <div>
              <span className="text-muted">{t("apps.ui.launchUrlLabel")}</span>{" "}
              {selectedApp.launchUrl ?? t("apps.ui.notAvailable")}
            </div>
            <div className="break-all">
              <span className="text-muted">{t("apps.ui.repositoryLabel")}</span>{" "}
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
                t("apps.ui.notAvailable")
              )}
            </div>
          </div>

          {selectedApp.capabilities.length ? (
            <div className="border border-border p-2 flex flex-col gap-1">
              <div className="font-bold text-xs">{t("apps.ui.capabilities")}</div>
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
              <div className="font-bold text-xs">{t("apps.ui.viewerConfig")}</div>
              <div className="break-all">
                <span className="text-muted">{t("apps.ui.urlLabel")}</span> {selectedApp.viewer.url}
              </div>
              <div>
                <span className="text-muted">{t("apps.ui.postMessageAuthLabel")}</span>{" "}
                {selectedApp.viewer.postMessageAuth ? t("apps.ui.enabled") : t("apps.ui.disabled")}
              </div>
              <div>
                <span className="text-muted">{t("apps.ui.sandboxLabel")}</span>{" "}
                {selectedApp.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX}
              </div>
            </div>
          ) : null}

          {selectedApp.name === HYPERSCAPE_APP_NAME ? (
            <div className="border border-border p-2 flex flex-col gap-2">
              <div className="font-bold text-xs">{t("apps.ui.hyperscapeControls")}</div>
              <div className="text-[11px] text-muted">
                {t("apps.ui.hyperscapeControlsHint")}
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
          placeholder={t("apps.ui.searchPlaceholder")}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-txt text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={() => void loadApps()}
          className="btn text-xs py-1"
        >
          {t("apps.ui.refresh")}
        </button>
      </div>

      <div className="flex items-center gap-2 mb-4 text-[11px] text-muted">
        <button
          onClick={() => setShowActiveOnly((current) => !current)}
          className="btn btn-ghost text-[11px] py-1"
        >
          {showActiveOnly ? t("apps.ui.showingActive") : t("apps.ui.activeOnly")}
        </button>
        <span>{t("apps.ui.activeCount", { count: activeAppNames.size })}</span>
      </div>

      {renderActiveSessionCard()}

      {error && (
        <div className="p-3 border border-danger text-danger text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted italic">{t("apps.ui.loadingApps")}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted italic">
          {showActiveOnly
            ? t("apps.ui.noActiveAppsFound")
            : searchQuery
              ? t("apps.ui.noAppsMatchSearch")
              : t("apps.ui.noAppsAvailable")}
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
                  <div className="font-bold text-sm">{app.displayName ?? app.name}</div>
                  <button
                    className="btn btn-ghost text-xs py-0.5"
                    onClick={() => setSelectedAppName(app.name)}
                    title={t("apps.ui.openAppTitle", { appName: app.displayName ?? app.name })}
                  >
                    {">"}
                  </button>
                </div>

                <div className="flex flex-wrap gap-1">
                  {app.category ? (
                    <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                      {getCategoryLabel(app.category)}
                    </span>
                  ) : null}
                  {isActive ? (
                    <span className="text-[10px] px-1.5 py-0.5 border border-ok text-ok">
                      {t("apps.ui.active")}
                    </span>
                  ) : null}
                </div>

                <div className="text-xs text-muted flex-1">{app.description ?? t("apps.ui.noDescription")}</div>

                <button
                  className="btn text-xs py-1.5 self-start disabled:opacity-40 disabled:cursor-not-allowed"
                  disabled={busyApp === app.name}
                  onClick={() => void handleLaunch(app)}
                >
                  {busyApp === app.name ? t("apps.ui.launching") : t("apps.ui.launch")}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
