/**
 * Provider that injects structured action call examples into the prompt context.
 *
 * ElizaOS core only shows exampleCalls from its static action-docs registry,
 * which doesn't include custom plugin actions. This provider bridges the gap
 * by formatting our coding agent action examples in the same structured format
 * the model sees for core actions.
 *
 * @module providers/action-examples
 */

import type { IAgentRuntime, Memory, Provider, State } from "@elizaos/core";

interface ActionCallExample {
  user: string;
  actions: string[];
  params?: Record<string, Record<string, string>>;
}

const CODING_AGENT_EXAMPLES: ActionCallExample[] = [
  {
    user: "Can you set up a workspace for https://github.com/acme/my-app and have Claude fix the login bug?",
    actions: ["REPLY", "START_CODING_TASK"],
    params: {
      START_CODING_TASK: {
        repo: "https://github.com/acme/my-app",
        agentType: "claude",
        task: "Fix the login bug in src/auth.ts — users are getting 401 errors after token refresh",
      },
    },
  },
  {
    user: "Use a coding agent to research the latest Next.js patterns and summarize them",
    actions: ["REPLY", "START_CODING_TASK"],
    params: {
      START_CODING_TASK: {
        agentType: "claude",
        task: "Research the latest Next.js patterns (app router, server components, etc.) and write a summary in RESEARCH.md",
      },
    },
  },
  {
    user: "Tell the coding agent to accept those changes",
    actions: ["REPLY", "SEND_TO_CODING_AGENT"],
    params: {
      SEND_TO_CODING_AGENT: {
        input: "Yes, accept the changes",
      },
    },
  },
  {
    user: "The agent is asking me to press enter, can you handle that?",
    actions: ["REPLY", "SEND_TO_CODING_AGENT"],
    params: {
      SEND_TO_CODING_AGENT: {
        keys: "Enter",
      },
    },
  },
  {
    user: "Create a PR for what the agent did",
    actions: ["REPLY", "FINALIZE_WORKSPACE"],
    params: {
      FINALIZE_WORKSPACE: {
        prTitle: "Fix login bug in auth module",
        prBody:
          "Resolved 401 errors after token refresh by fixing the token expiry check",
      },
    },
  },
];

function formatExample(ex: ActionCallExample): string {
  const actionTags = ex.actions
    .map((a) => `  <action>${a}</action>`)
    .join("\n");
  const paramBlocks = Object.entries(ex.params ?? {})
    .map(([actionName, params]) => {
      const inner = Object.entries(params)
        .map(([k, v]) => `    <${k}>${v}</${k}>`)
        .join("\n");
      return `  <${actionName}>\n${inner}\n  </${actionName}>`;
    })
    .join("\n");
  const paramsSection = paramBlocks
    ? `\n<params>\n${paramBlocks}\n</params>`
    : "";
  return `User: ${ex.user}\nAssistant:\n<actions>\n${actionTags}\n</actions>${paramsSection}`;
}

// Multi-agent example uses the pipe-delimited `agents` param to spawn multiple agents in one action call.
// Each segment is a separate task. Optionally prefix with agent type: "claude:task | gemini:task".
// Each agent gets its own workspace clone — they cannot see each other's work.
const MULTI_AGENT_EXAMPLE = `User: Spin up 3 agents on https://github.com/acme/app — one to fix auth, one to write tests, one to update docs
Assistant:
<actions>
  <action>REPLY</action>
  <action>START_CODING_TASK</action>
</actions>
<params>
  <START_CODING_TASK>
    <repo>https://github.com/acme/app</repo>
    <agents>Fix the authentication bug in src/auth.ts — users get 401 after token refresh. Your unique identifier is "alpha". | Write comprehensive unit tests for the auth module in src/auth.ts. Your unique identifier is "beta". | Update the API documentation in docs/ to reflect the new auth flow. Your unique identifier is "gamma".</agents>
  </START_CODING_TASK>
</params>`;

export const codingAgentExamplesProvider: Provider = {
  name: "CODING_AGENT_EXAMPLES",
  description:
    "Structured examples showing how to use coding agent actions with parameters",
  position: -1, // Low priority — supplementary context

  get: async (_runtime: IAgentRuntime, _message: Memory, _state: State) => {
    const examples = CODING_AGENT_EXAMPLES.map(formatExample).join("\n\n");
    const text = [
      "# Coding Agent Action Call Examples",
      "When the user asks you to work on code, clone repos, spawn agents, or run agent tasks,",
      "you MUST select the appropriate actions and include parameters. Do NOT just describe",
      "what you would do — actually select the actions.",
      "",
      "IMPORTANT: Use START_CODING_TASK to launch coding agents. It handles workspace setup",
      "automatically. If a repo URL is provided, it clones it first. If no repo, the agent",
      "runs in a safe scratch directory. You do NOT need to call PROVISION_WORKSPACE separately.",
      "",
      "## Single Agent Examples",
      "",
      examples,
      "",
      "## Multi-Agent Example",
      "To spawn multiple agents, use the `agents` parameter with pipe-delimited (|) tasks.",
      "Each segment becomes a separate agent with its own workspace clone.",
      "You can optionally prefix each segment with an agent type: 'claude:task | gemini:task'.",
      "CRITICAL: Give each agent a DIFFERENT task with unique instructions, topics, file names,",
      "and unique identifiers so their work is clearly differentiated.",
      "",
      MULTI_AGENT_EXAMPLE,
    ].join("\n");

    return {
      data: { codingAgentExamples: CODING_AGENT_EXAMPLES },
      values: { codingAgentExamples: text },
      text,
    };
  },
};
