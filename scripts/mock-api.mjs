#!/usr/bin/env node
/**
 * Minimal mock API for previewing the UI without a full backend.
 * Responds to the critical endpoints the app-core startup checks need.
 */
import http from "node:http";

const PORT = 31337;

const MOCK_ROUTES = {
  "/api/auth/status": { authenticated: true, required: false },
  "/api/status": {
    state: "running",
    agentName: "TestAgent",
    version: "2.0.0-alpha.92",
  },
  "/api/agent/status": {
    state: "running",
    agentName: "TestAgent",
    version: "2.0.0-alpha.92",
  },
  "/api/config": {
    messages: { tts: {} },
    settings: {},
  },
  "/api/onboarding/status": { complete: true },
  "/api/onboarding/options": { styles: [] },
  "/api/character": {
    name: "FreshInstallAgent",
    username: "FreshInstallAgent",
    bio: "A freshly installed test agent",
    system: "",
    adjectives: [],
    style: { all: [], chat: [], post: [] },
    messageExamples: [],
    postExamples: [],
  },
  "/api/registry/status": { registered: false },
  "/api/drop/status": {
    dropEnabled: false,
    publicMintOpen: false,
    mintedOut: false,
    userHasMinted: false,
  },
  "/api/wallet/config": { evmAddress: null },
  "/api/wallet/addresses": {},
  "/api/conversations": { conversations: [] },
  "/api/conversations/list": { conversations: [] },
  "/api/plugins": { plugins: [] },
  "/api/skills": { skills: [] },
  "/api/triggers": { triggers: [] },
  "/api/autonomous/events": { events: [], lastEventId: null },
  "/api/autonomous/events/replay": { events: [], lastEventId: null },
  "/api/logs": { logs: [] },
  "/api/connectors": { connectors: [] },
  "/api/update/status": { available: false },
  "/api/extension/status": { installed: false },
  "/api/store/plugins": [],
  "/api/workbench": { tasks: [], triggers: [], todos: [] },
  "/api/cloud/status": { enabled: false, connected: false },
};

const server = http.createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS, PATCH",
  );
  res.setHeader("Access-Control-Allow-Headers", "*");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url.split("?")[0];

  // Exact match
  const body = MOCK_ROUTES[url];
  if (body !== undefined) {
    res.writeHead(200);
    res.end(JSON.stringify(body));
    return;
  }

  // Prefix matches for sub-routes
  for (const [route, data] of Object.entries(MOCK_ROUTES)) {
    if (url.startsWith(`${route}/`)) {
      res.writeHead(200);
      res.end(JSON.stringify(data));
      return;
    }
  }

  // POST/PUT endpoints that just ack
  if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
    res.writeHead(200);
    res.end(JSON.stringify({ success: true }));
    return;
  }

  // Default fallback
  res.writeHead(200);
  res.end(JSON.stringify({}));
});

server.listen(PORT, () => {
  console.log(`[mock-api] Listening on http://localhost:${PORT}`);
});
