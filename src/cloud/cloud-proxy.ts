/**
 * Drop-in replacement for a local AgentRuntime when running in cloud mode.
 * Routes chat/status calls through the ElizaCloudClient to the remote sandbox.
 */

import type { ChatMode, ElizaCloudClient } from "./bridge-client.js";

export class CloudRuntimeProxy {
  constructor(
    private client: ElizaCloudClient,
    private agentId: string,
    private _agentName: string,
  ) {}

  get agentName(): string {
    return this._agentName;
  }

  async handleChatMessage(
    text: string,
    roomId = "web-chat",
    mode: ChatMode = "power",
  ): Promise<string> {
    return this.client.sendMessage(this.agentId, text, roomId, mode);
  }

  async *handleChatMessageStream(
    text: string,
    roomId = "web-chat",
    mode: ChatMode = "power",
  ): AsyncGenerator<string> {
    for await (const event of this.client.sendMessageStream(
      this.agentId,
      text,
      roomId,
      mode,
    )) {
      if (event.type === "chunk" && typeof event.data.text === "string") {
        yield event.data.text;
      }
    }
  }

  async getStatus(): Promise<{ state: string; agentName: string }> {
    const agent = await this.client.getAgent(this.agentId);
    return { state: agent.status, agentName: agent.agentName };
  }

  async isAlive(): Promise<boolean> {
    return this.client.heartbeat(this.agentId).catch(() => false);
  }
}
