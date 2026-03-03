import { ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type {
  StreamEventEnvelope,
  TriggerSummary,
  WorkbenchTask,
  WorkbenchTodo,
} from "../api-client";
import { ChatControlsPanel } from "./ChatControlsPanel";
import { CodingAgentsSection } from "./CodingAgentsSection";
import { formatTime } from "./shared/format";

function getEventText(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<
    string,
    string | number | boolean | null | object | undefined
  >;
  const text = payload.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const preview = payload.preview;
  if (typeof preview === "string" && preview.trim()) return preview.trim();
  const reason = payload.reason;
  if (typeof reason === "string" && reason.trim()) return reason.trim();
  return event.stream ? `${event.stream} event` : event.type;
}

function getEventTone(event: StreamEventEnvelope): string {
  if (event.type === "heartbeat_event") return "text-accent";
  if (event.stream === "error") return "text-danger";
  if (
    event.stream === "action" ||
    event.stream === "tool" ||
    event.stream === "provider"
  ) {
    return "text-ok";
  }
  if (event.stream === "assistant") return "text-accent";
  return "text-muted";
}

function isThoughtStream(stream: string | undefined): boolean {
  return stream === "assistant" || stream === "evaluator";
}

function isActionStream(stream: string | undefined): boolean {
  return stream === "action" || stream === "tool" || stream === "provider";
}

function formatRunId(runId: string): string {
  if (runId.length <= 16) return runId;
  return `${runId.slice(0, 8)}…${runId.slice(-6)}`;
}

function getRunHealthBadgeClasses(status: string): string {
  switch (status) {
    case "gap_detected":
      return "border-danger text-danger bg-danger/10";
    case "partial":
      return "border-accent text-accent bg-accent/10";
    case "recovered":
      return "border-ok text-ok bg-ok/10";
    default:
      return "border-border text-muted bg-card";
  }
}

function getRunHealthLabel(status: string): string {
  switch (status) {
    case "gap_detected":
      return "Gap detected";
    case "partial":
      return "Partial";
    case "recovered":
      return "Recovered";
    default:
      return "OK";
  }
}

interface AutonomousPanelProps {
  mobile?: boolean;
  onClose?: () => void;
}

export function AutonomousPanel({
  mobile = false,
  onClose,
}: AutonomousPanelProps) {
  const {
    agentStatus,
    autonomousEvents,
    autonomousRunHealthByRunId,
    ptySessions,
    workbench,
    workbenchLoading,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
    chatAvatarVisible,
    chatAgentVoiceMuted,
    chatAvatarSpeaking,
    setState,
  } = useApp();

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [triggersCollapsed, setTriggersCollapsed] = useState(false);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);

  const events = useMemo(
    () => autonomousEvents.slice(-120).reverse(),
    [autonomousEvents],
  );
  const latestThought = useMemo(
    () =>
      autonomousEvents
        .slice()
        .reverse()
        .find((event) => isThoughtStream(event.stream)),
    [autonomousEvents],
  );
  const latestAction = useMemo(
    () =>
      autonomousEvents
        .slice()
        .reverse()
        .find((event) => isActionStream(event.stream)),
    [autonomousEvents],
  );
  const runHealthRows = useMemo(
    () =>
      Object.values(autonomousRunHealthByRunId).sort((left, right) => {
        const unresolvedLeft = left.missingSeqs.length > 0 ? 1 : 0;
        const unresolvedRight = right.missingSeqs.length > 0 ? 1 : 0;
        if (unresolvedLeft !== unresolvedRight) {
          return unresolvedRight - unresolvedLeft;
        }
        return left.runId.localeCompare(right.runId);
      }),
    [autonomousRunHealthByRunId],
  );
  const unresolvedRunCount = useMemo(
    () => runHealthRows.filter((row) => row.missingSeqs.length > 0).length,
    [runHealthRows],
  );

  const isAgentStopped = agentStatus?.state === "stopped" || !agentStatus;
  const tasks = workbench?.tasks ?? [];
  const triggers = workbench?.triggers ?? [];
  const todos = workbench?.todos ?? [];

  return (
    <aside
      className={`${mobile ? "w-full min-w-0" : "w-[280px] min-w-[280px] xl:w-[340px] xl:min-w-[340px] 2xl:w-[420px] 2xl:min-w-[420px] border-l"} border-border bg-bg flex flex-col h-full font-body text-[13px]`}
      data-testid="autonomous-panel"
    >
      <div className="px-3 py-2 border-b border-border flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-muted">
            {mobile ? "Status" : "Autonomous Loop"}
          </div>
          <div className="mt-1 text-[12px] text-muted">
            {agentStatus?.state === "running"
              ? "Live stream connected"
              : `Agent state: ${agentStatus?.state ?? "offline"}`}
          </div>
        </div>
        {mobile && (
          <button
            type="button"
            className="inline-flex items-center justify-center w-7 h-7 border border-border bg-card text-sm text-muted cursor-pointer hover:border-accent hover:text-accent transition-colors shrink-0"
            onClick={onClose}
            aria-label="Close autonomous panel"
          >
            &times;
          </button>
        )}
      </div>

      {isAgentStopped ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted">Agent not running</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="border-b border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted mb-2">
              Current
            </div>
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-muted uppercase">Thought</div>
                <div className="text-txt">
                  {latestThought
                    ? getEventText(latestThought)
                    : "No thought events yet"}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-muted uppercase">Action</div>
                <div className="text-txt">
                  {latestAction
                    ? getEventText(latestAction)
                    : "No action events yet"}
                </div>
              </div>
            </div>
            <div className="mt-3 border border-border rounded bg-card/60 px-2 py-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[11px] text-muted uppercase">
                  Replay Health
                </div>
                <span
                  className={`px-1.5 py-0.5 text-[10px] border ${unresolvedRunCount > 0 ? "border-danger text-danger" : "border-ok text-ok"}`}
                >
                  {unresolvedRunCount > 0
                    ? `Gaps ${unresolvedRunCount}`
                    : "No gaps"}
                </span>
              </div>
              {runHealthRows.length === 0 ? (
                <div className="mt-1 text-[11px] text-muted">
                  No replay diagnostics yet
                </div>
              ) : (
                <div className="mt-2 flex flex-col gap-1 max-h-[120px] overflow-y-auto">
                  {runHealthRows.map((row) => (
                    <div
                      key={row.runId}
                      className="flex items-center justify-between gap-2 text-[11px]"
                    >
                      <span className="text-muted font-mono">
                        {formatRunId(row.runId)}
                      </span>
                      <div className="flex items-center gap-1">
                        {row.lastSeq !== null && (
                          <span className="px-1.5 py-0.5 border border-border text-muted">
                            seq {row.lastSeq}
                          </span>
                        )}
                        {row.missingSeqs.length > 0 && (
                          <span className="px-1.5 py-0.5 border border-danger text-danger">
                            missing {row.missingSeqs.slice(0, 3).join(",")}
                            {row.missingSeqs.length > 3 ? ",…" : ""}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 border ${getRunHealthBadgeClasses(row.status)}`}
                        >
                          {getRunHealthLabel(row.status)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {ptySessions.length > 0 && (
            <CodingAgentsSection sessions={ptySessions} />
          )}

          <div className="border-b border-border">
            <button
              type="button"
              className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
              onClick={() => setEventsCollapsed(!eventsCollapsed)}
            >
              <span>Event Stream ({events.length})</span>
              <span>
                {eventsCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
              </span>
            </button>
            {!eventsCollapsed && (
              <div className="px-3 pb-2 max-h-[320px] overflow-y-auto space-y-2">
                {events.length === 0 ? (
                  <div className="text-muted text-sm py-2">No events yet</div>
                ) : (
                  events.map((event) => (
                    <div
                      key={event.eventId}
                      className="rounded border border-border px-2 py-1"
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-[11px] uppercase ${getEventTone(event)}`}
                        >
                          {event.stream ?? event.type}
                        </span>
                        <span className="text-[11px] text-muted">
                          {formatTime(event.ts, { fallback: "—" })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1 flex-wrap">
                        {typeof event.runId === "string" && event.runId && (
                          <span className="px-1.5 py-0.5 text-[10px] border border-border text-muted font-mono">
                            run {formatRunId(event.runId)}
                          </span>
                        )}
                        {typeof event.seq === "number" &&
                          Number.isFinite(event.seq) && (
                            <span className="px-1.5 py-0.5 text-[10px] border border-border text-muted">
                              seq {Math.trunc(event.seq)}
                            </span>
                          )}
                        {typeof event.runId === "string" &&
                          autonomousRunHealthByRunId[event.runId] && (
                            <span
                              className={`px-1.5 py-0.5 text-[10px] border ${getRunHealthBadgeClasses(
                                autonomousRunHealthByRunId[event.runId].status,
                              )}`}
                            >
                              {getRunHealthLabel(
                                autonomousRunHealthByRunId[event.runId].status,
                              )}
                            </span>
                          )}
                      </div>
                      <div className="text-[12px] text-txt mt-1 break-words">
                        {getEventText(event)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {workbenchLoading ? (
            <div className="flex items-center justify-center py-5">
              <p className="text-muted">Loading workbench&hellip;</p>
            </div>
          ) : (
            <>
              {workbenchTasksAvailable && (
                <div className="border-b border-border">
                  <button
                    type="button"
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTasksCollapsed(!tasksCollapsed)}
                  >
                    <span>Tasks ({tasks.length})</span>
                    <span>
                      {tasksCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                  </button>
                  {!tasksCollapsed && (
                    <div className="px-3 py-2">
                      {tasks.length === 0 ? (
                        <div className="text-muted text-sm py-2">No tasks</div>
                      ) : (
                        tasks.map((task: WorkbenchTask) => (
                          <div key={task.id} className="flex gap-2 py-2">
                            <input
                              type="checkbox"
                              checked={task.isCompleted}
                              readOnly
                              className="mt-0.5"
                            />
                            <div className="flex-1 min-w-0">
                              <div
                                className={`text-txt-strong ${
                                  task.isCompleted
                                    ? "line-through opacity-60"
                                    : ""
                                }`}
                              >
                                {task.name}
                              </div>
                              {task.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {task.tags.map((tag: string) => (
                                    <span
                                      key={tag}
                                      className="px-1.5 py-0.5 text-[11px] bg-bg-muted text-muted rounded"
                                    >
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {workbenchTriggersAvailable && (
                <div className="border-b border-border">
                  <button
                    type="button"
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTriggersCollapsed(!triggersCollapsed)}
                  >
                    <span>Triggers ({triggers.length})</span>
                    <span>
                      {triggersCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                  </button>
                  {!triggersCollapsed && (
                    <div className="px-3 py-2">
                      {triggers.length === 0 ? (
                        <div className="text-muted text-sm py-2">
                          No triggers
                        </div>
                      ) : (
                        triggers.map((trigger: TriggerSummary) => (
                          <div key={trigger.id} className="py-2">
                            <div className="text-txt-strong">
                              {trigger.displayName}
                            </div>
                            <div className="text-[11px] text-muted mt-1">
                              {trigger.triggerType} ·{" "}
                              {trigger.enabled ? "enabled" : "disabled"} · runs{" "}
                              {trigger.runCount}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}

              {workbenchTodosAvailable && (
                <div className="border-b border-border">
                  <button
                    type="button"
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTodosCollapsed(!todosCollapsed)}
                  >
                    <span>Todos ({todos.length})</span>
                    <span>
                      {todosCollapsed ? (
                        <ChevronRight className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </span>
                  </button>
                  {!todosCollapsed && (
                    <div className="px-3 py-2">
                      {todos.length === 0 ? (
                        <div className="text-muted text-sm py-2">No todos</div>
                      ) : (
                        todos.map((todo: WorkbenchTodo) => (
                          <div
                            key={todo.id}
                            className="flex items-start gap-2 py-2"
                          >
                            <input
                              type="checkbox"
                              checked={todo.isCompleted}
                              readOnly
                              className="mt-0.5"
                            />
                            <div
                              className={`flex-1 text-txt ${
                                todo.isCompleted
                                  ? "line-through opacity-60"
                                  : ""
                              }`}
                            >
                              {todo.name}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      <ChatControlsPanel
        mobile={mobile}
        chatAvatarVisible={chatAvatarVisible}
        chatAvatarSpeaking={chatAvatarSpeaking}
        chatAgentVoiceMuted={chatAgentVoiceMuted}
        setState={setState}
      />
    </aside>
  );
}
