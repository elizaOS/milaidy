export function getDefaultWorkflowNodeConfig(
  type: string,
): Record<string, unknown> {
  switch (type) {
    case "trigger":
      return { triggerType: "manual" };
    case "action":
      return { actionName: "", parameters: {} };
    case "llm":
      return { prompt: "", temperature: 0.7, maxTokens: 2000 };
    case "condition":
      return {
        leftOperand: "{{_last}}",
        operator: "truthy",
        rightOperand: "",
        expression: "{{_last}}",
      };
    case "transform":
      return { code: "return params._last;" };
    case "delay":
      return { duration: "5m" };
    case "hook":
      return { hookId: "", description: "", webhookEnabled: false };
    case "loop":
      return { itemsExpression: "", variableName: "item" };
    case "subworkflow":
      return { workflowId: "" };
    case "output":
      return { outputExpression: "" };
    default:
      return {};
  }
}
