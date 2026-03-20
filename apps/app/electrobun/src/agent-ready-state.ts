/**
 * Shared agent-ready state for the application menu.
 *
 * Extracted to a separate module to avoid circular dependencies between
 * index.ts and rpc-handlers.ts.
 */

type AgentReadyListener = (ready: boolean) => void;

let _agentReady = false;
let _listener: AgentReadyListener | null = null;

export function isAgentReady(): boolean {
  return _agentReady;
}

export function setAgentReady(ready: boolean): void {
  _agentReady = ready;
  _listener?.(ready);
}

export function onAgentReadyChange(listener: AgentReadyListener): void {
  _listener = listener;
}
