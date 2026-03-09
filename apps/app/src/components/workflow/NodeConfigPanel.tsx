/**
 * NodeConfigPanel — right sidebar for configuring a selected node.
 *
 * Renders type-specific configuration fields based on the node type.
 */

import { Trash2, X } from "lucide-react";
import type { WorkflowConditionOperator, WorkflowNode } from "../../api-client";

interface NodeConfigPanelProps {
  node: WorkflowNode;
  onUpdate: (updates: Partial<WorkflowNode>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export function NodeConfigPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: NodeConfigPanelProps) {
  const updateConfig = (key: string, value: unknown) => {
    onUpdate({ config: { ...node.config, [key]: value } });
  };

  return (
    <div className="w-72 border-l border-border bg-surface/20 overflow-y-auto shrink-0">
      <div className="p-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs font-medium">Node Config</div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onDelete}
              className="p-1 rounded hover:bg-red-500/10 text-red-400"
              title="Delete node"
            >
              <Trash2 size={12} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded hover:bg-surface text-muted"
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Common fields */}
        <Field label="Label">
          <input
            type="text"
            value={node.label}
            onChange={(e) => onUpdate({ label: e.target.value })}
            className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
          />
        </Field>

        <div className="text-[10px] text-muted mb-3">
          Type: <span className="font-medium">{node.type}</span> | ID:{" "}
          {node.id.slice(0, 12)}
        </div>

        <hr className="border-border mb-3" />

        {/* Type-specific fields */}
        {node.type === "trigger" && (
          <TriggerConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "action" && (
          <ActionConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "llm" && (
          <LlmConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "condition" && (
          <ConditionConfig
            config={node.config}
            onChange={(updates) =>
              onUpdate({ config: { ...node.config, ...updates } })
            }
          />
        )}
        {node.type === "transform" && (
          <TransformConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "delay" && (
          <DelayConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "hook" && (
          <HookConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "loop" && (
          <LoopConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "subworkflow" && (
          <SubworkflowConfig config={node.config} onChange={updateConfig} />
        )}
        {node.type === "output" && (
          <OutputConfig config={node.config} onChange={updateConfig} />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared field wrapper
// ---------------------------------------------------------------------------

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="mb-2.5">
      <div className="block text-[10px] text-muted mb-1 font-medium">
        {label}
      </div>
      {children}
      {hint && <p className="text-[9px] text-muted/60 mt-0.5">{hint}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Type-specific config forms
// ---------------------------------------------------------------------------

type ConfigProps = {
  config: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
};

type ConditionConfigProps = {
  config: Record<string, unknown>;
  onChange: (updates: Record<string, unknown>) => void;
};

function TriggerConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field label="Trigger Type">
        <select
          value={String(config.triggerType ?? "manual")}
          onChange={(e) => onChange("triggerType", e.target.value)}
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none"
        >
          <option value="manual">Manual</option>
          <option value="cron">Cron Schedule</option>
          <option value="webhook">Webhook</option>
          <option value="event">Agent Event</option>
        </select>
      </Field>

      {config.triggerType === "cron" && (
        <Field label="Cron Expression" hint="e.g. 0 9 * * * (daily at 9am)">
          <input
            type="text"
            value={String(config.cronExpression ?? "")}
            onChange={(e) => onChange("cronExpression", e.target.value)}
            placeholder="0 9 * * *"
            className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
          />
        </Field>
      )}

      {config.triggerType === "webhook" && (
        <Field label="Webhook Path" hint="Path suffix for the webhook URL">
          <input
            type="text"
            value={String(config.webhookPath ?? "")}
            onChange={(e) => onChange("webhookPath", e.target.value)}
            placeholder="/my-webhook"
            className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
          />
        </Field>
      )}

      {config.triggerType === "event" && (
        <Field label="Event Name" hint="elizaOS event to listen for">
          <input
            type="text"
            value={String(config.eventName ?? "")}
            onChange={(e) => onChange("eventName", e.target.value)}
            placeholder="message.received"
            className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
          />
        </Field>
      )}
    </>
  );
}

function ActionConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field
        label="Action Name"
        hint="Name of a registered action (e.g. SEND_MESSAGE)"
      >
        <input
          type="text"
          value={String(config.actionName ?? "")}
          onChange={(e) => onChange("actionName", e.target.value)}
          placeholder="SEND_MESSAGE"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
        />
      </Field>

      <Field
        label="Parameters (JSON)"
        hint="Key-value pairs, use {{nodeId.field}} for interpolation"
      >
        <textarea
          value={
            typeof config.parameters === "object"
              ? JSON.stringify(config.parameters, null, 2)
              : "{}"
          }
          onChange={(e) => {
            try {
              onChange("parameters", JSON.parse(e.target.value));
            } catch {
              // Let user keep typing
            }
          }}
          rows={4}
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono resize-y"
        />
      </Field>
    </>
  );
}

function LlmConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field
        label="Prompt"
        hint="Use {{_last}} or {{nodeId.field}} for context"
      >
        <textarea
          value={String(config.prompt ?? "")}
          onChange={(e) => onChange("prompt", e.target.value)}
          rows={6}
          placeholder="Summarize the following data: {{_last}}"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent resize-y"
        />
      </Field>

      <Field label="Temperature">
        <input
          type="number"
          value={Number(config.temperature ?? 0.7)}
          onChange={(e) =>
            onChange("temperature", Number.parseFloat(e.target.value))
          }
          step={0.1}
          min={0}
          max={2}
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </Field>

      <Field label="Max Tokens">
        <input
          type="number"
          value={Number(config.maxTokens ?? 2000)}
          onChange={(e) =>
            onChange("maxTokens", Number.parseInt(e.target.value, 10))
          }
          min={1}
          max={100000}
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </Field>
    </>
  );
}

const CONDITION_OPERATORS: Array<{
  value: WorkflowConditionOperator;
  label: string;
}> = [
  { value: "truthy", label: "Is truthy" },
  { value: "===", label: "Equals" },
  { value: "!==", label: "Does not equal" },
  { value: ">", label: "Greater than" },
  { value: "<", label: "Less than" },
  { value: ">=", label: "Greater than or equal" },
  { value: "<=", label: "Less than or equal" },
  { value: "contains", label: "Contains" },
];

function ConditionConfig({ config, onChange }: ConditionConfigProps) {
  const normalized = normalizeConditionConfig(config);
  const updateCondition = (
    updates: Partial<{
      leftOperand: string;
      operator: WorkflowConditionOperator;
      rightOperand: string;
    }>,
  ) => {
    const next = {
      ...normalized,
      ...updates,
    };
    const rightOperand =
      next.operator === "truthy" ? "" : (next.rightOperand ?? "");
    onChange({
      leftOperand: next.leftOperand,
      operator: next.operator,
      rightOperand,
      expression: serializeConditionExpression(
        next.leftOperand,
        next.operator,
        rightOperand,
      ),
    });
  };

  return (
    <>
      <Field
        label="Value To Check"
        hint="Use {{_last}} or {{nodeId.field}} to reference workflow data"
      >
        <input
          type="text"
          value={normalized.leftOperand}
          onChange={(e) => updateCondition({ leftOperand: e.target.value })}
          placeholder="{{_last.status}}"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
        />
      </Field>

      <Field label="Operator">
        <select
          value={normalized.operator}
          onChange={(e) =>
            updateCondition({
              operator: e.target.value as WorkflowConditionOperator,
            })
          }
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none"
        >
          {CONDITION_OPERATORS.map((operator) => (
            <option key={operator.value} value={operator.value}>
              {operator.label}
            </option>
          ))}
        </select>
      </Field>

      {normalized.operator !== "truthy" && (
        <Field
          label="Compare Against"
          hint='Literal values like 200 or "done" are supported'
        >
          <input
            type="text"
            value={normalized.rightOperand}
            onChange={(e) => updateCondition({ rightOperand: e.target.value })}
            placeholder={
              normalized.operator === "contains" ? '"success"' : "200"
            }
            className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
          />
        </Field>
      )}
    </>
  );
}

function TransformConfig({ config, onChange }: ConfigProps) {
  return (
    <Field
      label="JavaScript Code"
      hint="Sandboxed. Access data via params object. Return a value."
    >
      <textarea
        value={String(config.code ?? "")}
        onChange={(e) => onChange("code", e.target.value)}
        rows={8}
        placeholder="return { filtered: params._last.items.filter(i => i.active) };"
        className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono resize-y"
      />
    </Field>
  );
}

function DelayConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field label="Duration" hint="e.g. 5m, 2h, 1d, 30s">
        <input
          type="text"
          value={String(config.duration ?? "")}
          onChange={(e) => onChange("duration", e.target.value)}
          placeholder="5m"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </Field>

      <Field label="Or Until Date" hint="ISO date (overrides duration)">
        <input
          type="datetime-local"
          value={String(config.date ?? "")}
          onChange={(e) => onChange("date", e.target.value)}
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </Field>
    </>
  );
}

function HookConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field label="Hook ID" hint="Unique identifier for this pause point">
        <input
          type="text"
          value={String(config.hookId ?? "")}
          onChange={(e) => onChange("hookId", e.target.value)}
          placeholder="approval-gate"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
        />
      </Field>

      <Field label="Description" hint="Shown in UI when workflow is paused">
        <input
          type="text"
          value={String(config.description ?? "")}
          onChange={(e) => onChange("description", e.target.value)}
          placeholder="Waiting for admin approval"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent"
        />
      </Field>

      <Field label="Webhook Enabled">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={config.webhookEnabled === true}
            onChange={(e) => onChange("webhookEnabled", e.target.checked)}
          />
          Allow external HTTP resume
        </label>
      </Field>
    </>
  );
}

function LoopConfig({ config, onChange }: ConfigProps) {
  return (
    <>
      <Field
        label="Items Expression"
        hint="Path to array in context (e.g. _last.users)"
      >
        <input
          type="text"
          value={String(config.itemsExpression ?? "")}
          onChange={(e) => onChange("itemsExpression", e.target.value)}
          placeholder="_last.users"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
        />
      </Field>

      <Field label="Variable Name" hint="Name for each iteration item">
        <input
          type="text"
          value={String(config.variableName ?? "item")}
          onChange={(e) => onChange("variableName", e.target.value)}
          placeholder="item"
          className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
        />
      </Field>
    </>
  );
}

function SubworkflowConfig({ config, onChange }: ConfigProps) {
  return (
    <Field label="Workflow ID" hint="ID of the workflow to execute">
      <input
        type="text"
        value={String(config.workflowId ?? "")}
        onChange={(e) => onChange("workflowId", e.target.value)}
        placeholder="workflow-uuid"
        className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
      />
    </Field>
  );
}

function OutputConfig({ config, onChange }: ConfigProps) {
  return (
    <Field
      label="Output Expression"
      hint="Optional. Defaults to last result. Use {{nodeId.field}} syntax."
    >
      <input
        type="text"
        value={String(config.outputExpression ?? "")}
        onChange={(e) => onChange("outputExpression", e.target.value)}
        placeholder="{{_last}}"
        className="w-full px-2 py-1 text-xs rounded bg-surface border border-border outline-none focus:border-accent font-mono"
      />
    </Field>
  );
}

function normalizeConditionConfig(config: Record<string, unknown>): {
  leftOperand: string;
  operator: WorkflowConditionOperator;
  rightOperand: string;
} {
  const leftOperand =
    typeof config.leftOperand === "string" ? config.leftOperand : "";
  const operator =
    typeof config.operator === "string" &&
    CONDITION_OPERATORS.some(({ value }) => value === config.operator)
      ? (config.operator as WorkflowConditionOperator)
      : "truthy";
  const rightOperand =
    typeof config.rightOperand === "string" ? config.rightOperand : "";

  if (leftOperand) {
    return { leftOperand, operator, rightOperand };
  }

  return parseLegacyConditionExpression(String(config.expression ?? ""));
}

function parseLegacyConditionExpression(expression: string): {
  leftOperand: string;
  operator: WorkflowConditionOperator;
  rightOperand: string;
} {
  const trimmed = expression.trim();
  if (!trimmed) {
    return {
      leftOperand: "{{_last}}",
      operator: "truthy",
      rightOperand: "",
    };
  }

  const containsMatch = trimmed.match(/^(.+?)\s+contains\s+(.+)$/i);
  if (containsMatch) {
    return {
      leftOperand: containsMatch[1].trim(),
      operator: "contains",
      rightOperand: containsMatch[2].trim(),
    };
  }

  for (const operator of ["===", "!==", ">=", "<=", ">", "<"] as const) {
    const idx = findTopLevelOperatorIndex(trimmed, operator);
    if (idx < 0) {
      continue;
    }

    return {
      leftOperand: trimmed.slice(0, idx).trim(),
      operator,
      rightOperand: trimmed.slice(idx + operator.length).trim(),
    };
  }

  return {
    leftOperand: trimmed,
    operator: "truthy",
    rightOperand: "",
  };
}

function findTopLevelOperatorIndex(
  expression: string,
  operator: Exclude<WorkflowConditionOperator, "truthy" | "contains">,
): number {
  let quote: '"' | "'" | null = null;

  for (let i = 0; i <= expression.length - operator.length; i += 1) {
    const ch = expression[i];
    if (quote) {
      if (ch === quote && expression[i - 1] !== "\\") {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (expression.slice(i, i + operator.length) === operator) {
      return i;
    }
  }

  return -1;
}

function serializeConditionExpression(
  leftOperand: string,
  operator: WorkflowConditionOperator,
  rightOperand: string,
): string {
  const left = leftOperand.trim();
  const right = rightOperand.trim();
  if (!left) {
    return "";
  }
  if (operator === "truthy") {
    return left;
  }
  if (!right) {
    return left;
  }
  return `${left} ${operator} ${right}`;
}
