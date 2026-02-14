import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type {
  StreamEventEnvelope,
  TriggerSummary,
  WorkbenchTask,
  WorkbenchTodo,
} from "../api-client";
import { formatTime } from "./shared/format";

function getEventText(event: StreamEventEnvelope): string {
  const payload = event.payload as Record<string, string | number | boolean | null | object | undefined>;
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

export function AutonomousPanel() {
  const {
    agentStatus,
    autonomousEvents,
    workbench,
    workbenchLoading,
    workbenchTasksAvailable,
    workbenchTriggersAvailable,
    workbenchTodosAvailable,
  } = useApp();

  const [tasksCollapsed, setTasksCollapsed] = useState(false);
  const [triggersCollapsed, setTriggersCollapsed] = useState(false);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);

  const events = useMemo(() => autonomousEvents.slice(-120).reverse(), [autonomousEvents]);
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

  const isAgentStopped = agentStatus?.state === "stopped" || !agentStatus;
  const tasks = workbench?.tasks ?? [];
  const triggers = workbench?.triggers ?? [];
  const todos = workbench?.todos ?? [];

  return (
    <aside
      className="w-[420px] min-w-[420px] border-l border-border flex flex-col h-full font-body text-[13px]"
      data-testid="autonomous-panel"
    >
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs uppercase tracking-wide text-muted">Autonomous Loop</div>
        <div className="mt-1 text-[12px] text-muted">
          {agentStatus?.state === "running"
            ? "Live stream connected"
            : `Agent state: ${agentStatus?.state ?? "offline"}`}
        </div>
      </div>

      {isAgentStopped ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted">Agent not running</p>
        </div>
      ) : (
        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="border-b border-border px-3 py-2">
            <div className="text-xs uppercase tracking-wide text-muted mb-2">Current</div>
            <div className="space-y-2">
              <div>
                <div className="text-[11px] text-muted uppercase">Thought</div>
                <div className="text-txt">{latestThought ? getEventText(latestThought) : "No thought events yet"}</div>
              </div>
              <div>
                <div className="text-[11px] text-muted uppercase">Action</div>
                <div className="text-txt">{latestAction ? getEventText(latestAction) : "No action events yet"}</div>
              </div>
            </div>
          </div>

          <div className="border-b border-border">
            <button
              className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
              onClick={() => setEventsCollapsed(!eventsCollapsed)}
            >
              <span>Event Stream ({events.length})</span>
              <span>{eventsCollapsed ? "▶" : "▼"}</span>
            </button>
            {!eventsCollapsed && (
              <div className="px-3 pb-2 max-h-[320px] overflow-y-auto space-y-2">
                {events.length === 0 ? (
                  <div className="text-muted text-sm py-2">No events yet</div>
                ) : (
                  events.map((event) => (
                    <div key={event.eventId} className="rounded border border-border px-2 py-1">
                      <div className="flex items-center justify-between">
                        <span className={`text-[11px] uppercase ${getEventTone(event)}`}>
                          {event.stream ?? event.type}
                        </span>
                        <span className="text-[11px] text-muted">
                          {formatTime(event.ts, { fallback: "—" })}
                        </span>
                      </div>
                      <div className="text-[12px] text-txt mt-1 break-words">{getEventText(event)}</div>
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
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTasksCollapsed(!tasksCollapsed)}
                  >
                    <span>Tasks ({tasks.length})</span>
                    <span>{tasksCollapsed ? "▶" : "▼"}</span>
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
                                  task.isCompleted ? "line-through opacity-60" : ""
                                }`}
                              >
                                {task.name}
                              </div>
                              {task.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {task.tags.map((tag: string, idx: number) => (
                                    <span
                                      key={idx}
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
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTriggersCollapsed(!triggersCollapsed)}
                  >
                    <span>Triggers ({triggers.length})</span>
                    <span>{triggersCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!triggersCollapsed && (
                    <div className="px-3 py-2">
                      {triggers.length === 0 ? (
                        <div className="text-muted text-sm py-2">No triggers</div>
                      ) : (
                        triggers.map((trigger: TriggerSummary) => (
                          <div key={trigger.id} className="py-2">
                            <div className="text-txt-strong">{trigger.displayName}</div>
                            <div className="text-[11px] text-muted mt-1">
                              {trigger.triggerType} · {trigger.enabled ? "enabled" : "disabled"} · runs {trigger.runCount}
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
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTodosCollapsed(!todosCollapsed)}
                  >
                    <span>Todos ({todos.length})</span>
                    <span>{todosCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!todosCollapsed && (
                    <div className="px-3 py-2">
                      {todos.length === 0 ? (
                        <div className="text-muted text-sm py-2">No todos</div>
                      ) : (
                        todos.map((todo: WorkbenchTodo) => (
                          <div key={todo.id} className="flex items-start gap-2 py-2">
                            <input
                              type="checkbox"
                              checked={todo.isCompleted}
                              readOnly
                              className="mt-0.5"
                            />
                            <div
                              className={`flex-1 text-txt ${
                                todo.isCompleted ? "line-through opacity-60" : ""
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
    </aside>
  );
}
