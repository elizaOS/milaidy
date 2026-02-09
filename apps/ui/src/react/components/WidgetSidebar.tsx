/**
 * Widget sidebar component — right sidebar for goals and tasks.
 */

import { useState } from "react";
import { useApp } from "../AppContext.js";
import type { WorkbenchGoal, WorkbenchTodo } from "../../ui/api-client.js";

function getGoalStatusEmoji(goal: { isCompleted: boolean }): string {
  return goal.isCompleted ? "✅" : "🎯";
}

export function WidgetSidebar() {
  const {
    agentStatus,
    workbench,
    workbenchLoading,
    workbenchGoalsAvailable,
    workbenchTodosAvailable,
    loadWorkbench,
  } = useApp();

  const [goalsCollapsed, setGoalsCollapsed] = useState(false);
  const [todosCollapsed, setTodosCollapsed] = useState(false);

  const isAgentStopped = agentStatus?.state === "stopped" || !agentStatus;
  const goals = workbench?.goals ?? [];
  const todos = workbench?.todos ?? [];

  return (
    <aside className="w-[260px] min-w-[260px] border-l border-border flex flex-col h-full font-body text-[13px]">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h3 className="text-txt-strong font-semibold">Workbench</h3>
        <button
          className="text-muted hover:text-txt-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={loadWorkbench}
          disabled={workbenchLoading}
          title="Refresh workbench"
        >
          ↻
        </button>
      </div>

      {isAgentStopped ? (
        <div className="flex items-center justify-center flex-1">
          <p className="text-muted">Agent not running</p>
        </div>
      ) : (
        <>
          {!workbenchGoalsAvailable && !workbenchTodosAvailable ? (
            <div className="flex items-center justify-center flex-1">
              <p className="text-muted">Plugin not loaded</p>
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
        </>
      )}
    </aside>
  );
}
