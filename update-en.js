const fs = require('fs');
const p = 'apps/app/src/i18n/locales/en.json';
const data = JSON.parse(fs.readFileSync(p, 'utf8'));
data['game'] = data['game'] || {};
Object.assign(data['game'], {
  noActiveSession: "No active game session.",
  backToApps: "Back to Apps",
  agentActivity: "Agent Activity",
  chatPlaceholder: "e.g. 'go chop wood' or 'attack the goblin'",
  noAgentActivity: "No agent activity yet.",
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
  hideLogs: "Hide Logs",
  showLogs: "Show Logs",
  retakeTitle: "Stream this view to retake.tv (requires active retake stream)",
  stopCapture: "Stop Capture",
  retakeCapture: "Retake Capture",
  disableOverlay: "Disable floating overlay",
  keepVisible: "Keep game visible when switching tabs",
  unpinOverlay: "Unpin Overlay",
  keepOnTop: "Keep on Top",
  openInNewTab: "Open in New Tab",
  stopping: "Stopping...",
  stop: "Stop"
});
fs.writeFileSync(p, JSON.stringify(data, null, 2));
