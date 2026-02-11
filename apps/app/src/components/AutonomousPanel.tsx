import { useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type { StreamEventEnvelope, WorkbenchGoal, WorkbenchTodo } from "../api-client";

function getGoalStatusEmoji(goal: { isCompleted: boolean }): string {
  return goal.isCompleted ? "✅" : "🎯";
}

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
  if (event.stream === "action" || event.stream === "tool") return "text-ok";
  if (event.stream === "assistant") return "text-accent";
  return "text-muted";
}

export function AutonomousPanel() {
  const {
    agentStatus,
    autonomousEvents,
    workbench,
    workbenchLoading,
    workbenchGoalsAvailable,
    workbenchTodosAvailable,
  } = useApp();

  const [goalsCollapsed, setGoalsCollapsed] = useState(false);
  const [todosCollapsed, setTodosCollapsed] = useState(false);
  const [eventsCollapsed, setEventsCollapsed] = useState(false);

  const events = useMemo(() => autonomousEvents.slice(-120).reverse(), [autonomousEvents]);
  const latestThought = useMemo(
    () => autonomousEvents.slice().reverse().find((event) => event.stream === "assistant"),
    [autonomousEvents],
  );
  const latestAction = useMemo(
    () =>
      autonomousEvents
        .slice()
        .reverse()
        .find((event) => event.stream === "action" || event.stream === "tool"),
    [autonomousEvents],
  );

  const isAgentStopped = agentStatus?.state === "stopped" || !agentStatus;
  const goals = workbench?.goals ?? [];
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
                          {new Date(event.ts).toLocaleTimeString()}
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
              {workbenchGoalsAvailable && (
                <div className="border-b border-border">
                  <button
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setGoalsCollapsed(!goalsCollapsed)}
                  >
                    <span>Goals ({goals.length})</span>
                    <span>{goalsCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!goalsCollapsed && (
                    <div className="px-3 py-2">
                      {goals.length === 0 ? (
                        <div className="text-muted text-sm py-2">No goals</div>
                      ) : (
                        goals.map((goal: WorkbenchGoal) => (
                          <div key={goal.id} className="flex gap-2 py-2">
                            <span className="text-base">{getGoalStatusEmoji(goal)}</span>
                            <div className="flex-1 min-w-0">
                              <div className="text-txt-strong">{goal.name}</div>
                              {goal.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {goal.tags.map((tag: string, idx: number) => (
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

              {workbenchTodosAvailable && (
                <div className="border-b border-border">
                  <button
                    className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
                    onClick={() => setTodosCollapsed(!todosCollapsed)}
                  >
                    <span>Tasks ({todos.length})</span>
                    <span>{todosCollapsed ? "▶" : "▼"}</span>
                  </button>
                  {!todosCollapsed && (
                    <div className="px-3 py-2">
                      {todos.length === 0 ? (
                        <div className="text-muted text-sm py-2">No tasks</div>
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
