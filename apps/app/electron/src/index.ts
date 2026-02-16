import type { CapacitorElectronConfig } from '@capacitor-community/electron';
import { getCapacitorElectronConfig, setupElectronDeepLinking } from '@capacitor-community/electron';
import type { MenuItemConstructorOptions } from 'electron';
import { app, MenuItem } from 'electron';
import electronIsDev from 'electron-is-dev';
import unhandled from 'electron-unhandled';
import { autoUpdater } from 'electron-updater';
import { File as NodeFile } from 'node:buffer';
import path from 'node:path';

import { ElectronCapacitorApp, setupContentSecurityPolicy, setupReloadWatcher } from './setup';
import { initializeNativeModules, registerAllIPC, disposeNativeModules, getAgentManager } from './native';

// Graceful handling of unhandled errors.
unhandled();

// Allow overriding Electron userData during automated E2E runs.
const userDataOverride = process.env.MILADY_ELECTRON_USER_DATA_DIR?.trim();
if (userDataOverride) {
  app.setPath('userData', userDataOverride);
}

// Electron 26 (Node 18) can miss global File, which breaks undici-based deps.
const globalWithFile = globalThis as unknown as { File?: typeof NodeFile };
if (typeof globalWithFile.File === 'undefined' && typeof NodeFile === 'function') {
  globalWithFile.File = NodeFile;
}

// Define our menu templates (these are optional)
const trayMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [new MenuItem({ label: 'Quit App', role: 'quit' })];
const appMenuBarMenuTemplate: (MenuItemConstructorOptions | MenuItem)[] = [
  { role: process.platform === 'darwin' ? 'appMenu' : 'fileMenu' },
  {
    label: 'Workspace',
    submenu: [
      {
        label: 'New Note',
        accelerator: 'CmdOrCtrl+Shift+Alt+N',
        click: () => dispatchRendererEvent('milaidy:app-command', { command: 'open-notes-new' }),
      },
      { type: 'separator' },
      {
        label: 'Notes',
        submenu: [
          {
            label: 'Open Notes (Edit)',
            accelerator: 'CmdOrCtrl+Shift+N',
            click: () => dispatchRendererEvent('milaidy:open-notes-panel', { mode: 'edit' }),
          },
          {
            label: 'Open Notes (Split)',
            accelerator: 'CmdOrCtrl+Shift+U',
            click: () => dispatchRendererEvent('milaidy:app-command', { command: 'open-notes-split' }),
          },
          {
            label: 'Open Notes (Preview)',
            accelerator: 'CmdOrCtrl+Shift+V',
            click: () => dispatchRendererEvent('milaidy:open-notes-panel', { mode: 'view' }),
          },
        ],
      },
      {
        label: 'Notes Templates',
        submenu: [
          {
            label: 'New Skill Draft',
            accelerator: 'CmdOrCtrl+Shift+K',
            click: () => dispatchRendererEvent('milaidy:app-command', {
              command: 'open-notes-with-seed',
              seedText: '## Skill Draft\n- Inputs:\n- Output:\n- Edge cases:\n',
            }),
          },
          {
            label: 'New Action Prompt',
            click: () => dispatchRendererEvent('milaidy:app-command', {
              command: 'open-notes-with-seed',
              seedText:
                '## Action\n\nGoal:\n- Why now:\n- Inputs:\n- Expected output:\n',
            }),
          },
          {
            label: 'New Runbook Draft',
            click: () => dispatchRendererEvent('milaidy:app-command', {
              command: 'open-notes-with-seed',
              seedText:
                '## Runbook\n\n## Trigger\n\n## Steps\n1.\n2.\n3.\n\n## Validation\n- [ ] \n',
            }),
          },
          {
            label: 'New Incident Log',
            click: () => dispatchRendererEvent('milaidy:app-command', {
              command: 'open-notes-with-seed',
              seedText:
                '## Incident\n\n- Reported:\n- Impact:\n- Detection:\n- Resolution:\n- Next actions:\n',
            }),
          },
        ],
      },
    ],
  },
  {
    label: 'Actions',
    submenu: [
      {
        label: 'Open Custom Actions',
        accelerator: 'CmdOrCtrl+Shift+J',
        click: () => dispatchRendererEvent('milaidy:app-command', { command: 'open-custom-actions-panel' }),
      },
      {
        label: 'Open Custom Actions Page',
        click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'actions' }),
      },
      {
        label: 'New Custom Action',
        accelerator: 'CmdOrCtrl+Shift+L',
        click: () => dispatchRendererEvent('milaidy:app-command', { command: 'open-custom-action-editor' }),
      },
      {
        label: 'Generate Action from Prompt',
        click: () => dispatchRendererEvent('milaidy:app-command', {
          command: 'open-custom-action-editor-with-prompt',
          seedPrompt: 'Generate a custom action that does the following:',
        }),
      },
    ],
  },
  {
    label: 'Agent',
    submenu: [
      { label: 'Start Agent', accelerator: 'CmdOrCtrl+Alt+S', click: () => dispatchRendererEvent('milaidy:agent-control', { action: 'start' }) },
      { label: 'Pause Agent', accelerator: 'CmdOrCtrl+Alt+P', click: () => dispatchRendererEvent('milaidy:agent-control', { action: 'pause' }) },
      { label: 'Resume Agent', accelerator: 'CmdOrCtrl+Alt+R', click: () => dispatchRendererEvent('milaidy:agent-control', { action: 'resume' }) },
      { label: 'Stop Agent', accelerator: 'CmdOrCtrl+Alt+X', click: () => dispatchRendererEvent('milaidy:agent-control', { action: 'stop' }) },
      { label: 'Restart Agent', accelerator: 'CmdOrCtrl+Alt+T', click: () => dispatchRendererEvent('milaidy:agent-control', { action: 'restart' }) },
    ],
  },
  {
    label: 'Dashboard',
    submenu: [
      { label: 'Open Command Palette', accelerator: 'CmdOrCtrl+Shift+P', click: () => dispatchRendererEvent('milaidy:app-command', { command: 'open-command-palette' }) },
      { type: 'separator' },
      { label: 'Open Chat', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'chat' }) },
      { label: 'Open Character', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'character' }) },
      { label: 'Open Wallets', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'wallets' }) },
      { label: 'Open Knowledge', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'knowledge' }) },
      { label: 'Open Social', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'connectors' }) },
      { label: 'Open Apps', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'apps' }) },
      { label: 'Open Plugins', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'plugins' }) },
      { label: 'Open Skills', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'skills' }) },
      { label: 'Open Actions', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'actions' }) },
      { label: 'Open Logs', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'logs' }) },
      { label: 'Open Settings', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'settings' }) },
      { type: 'separator' },
      { label: 'Refresh Plugins', click: () => dispatchRendererEvent('milaidy:app-command', { command: 'refresh-plugins' }) },
      { label: 'Refresh Skills', click: () => dispatchRendererEvent('milaidy:app-command', { command: 'refresh-skills' }) },
      { label: 'Refresh Logs', click: () => dispatchRendererEvent('milaidy:app-command', { command: 'refresh-logs' }) },
      { label: 'Refresh Workbench', click: () => dispatchRendererEvent('milaidy:app-command', { command: 'refresh-workbench' }) },
    ],
  },
  {
    label: 'Tools',
    submenu: [
      { label: 'Open Database', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'database' }) },
      { label: 'Open Runtime', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'runtime' }) },
      { label: 'Open Triggers', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'triggers' }) },
      { label: 'Open Fine-Tuning', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'fine-tuning' }) },
      { label: 'Open Trajectories', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'trajectories' }) },
      { label: 'Open Advanced', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'advanced' }) },
      { label: 'Open Voice', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'voice' }) },
      { label: 'Open Inventory', click: () => dispatchRendererEvent('milaidy:open-tab', { tab: 'wallets' }) },
    ],
  },
  { role: 'editMenu' },
  { role: 'viewMenu' },
];

interface ShareTargetPayload {
  source: string;
  title?: string;
  text?: string;
  url?: string;
  files?: Array<{ name: string; path?: string }>;
}

let pendingSharePayloads: ShareTargetPayload[] = [];

function parseShareUrl(rawUrl: string): ShareTargetPayload | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== 'milady:') return null;
  const sharePath = (parsed.pathname || parsed.host || '').replace(/^\/+/, '');
  if (sharePath !== 'share') return null;

  const title = parsed.searchParams.get('title')?.trim() || undefined;
  const text = parsed.searchParams.get('text')?.trim() || undefined;
  const sharedUrl = parsed.searchParams.get('url')?.trim() || undefined;
  const files = parsed.searchParams.getAll('file')
    .map((filePath) => filePath.trim())
    .filter((filePath) => filePath.length > 0)
    .map((filePath) => ({
      name: path.basename(filePath),
      path: filePath,
    }));

  return {
    source: 'electron-open-url',
    title,
    text,
    url: sharedUrl,
    files,
  };
}

function dispatchShareToRenderer(payload: ShareTargetPayload): void {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    pendingSharePayloads.push(payload);
    return;
  }

  const eventName = JSON.stringify('milady:share-target');
  const detail = JSON.stringify(payload).replace(/</g, '\\u003c');
  mainWindow.webContents.executeJavaScript(
    `window.__MILADY_SHARE_QUEUE__ = Array.isArray(window.__MILADY_SHARE_QUEUE__) ? window.__MILADY_SHARE_QUEUE__ : [];` +
    `window.__MILADY_SHARE_QUEUE__.push(${detail});` +
    `document.dispatchEvent(new CustomEvent(${eventName}, { detail: ${detail} }));`
  ).catch(() => {
    pendingSharePayloads.push(payload);
  });
}

function dispatchRendererEvent(eventName: string, detail?: unknown): void {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const safeName = JSON.stringify(eventName);
  const payload = detail === undefined ? "undefined" : JSON.stringify(detail).replace(/</g, '\\u003c');
  const detailExpression = payload === "undefined" ? "" : `, { detail: ${payload} }`;
  const script = `try { document.dispatchEvent(new CustomEvent(${safeName}${detailExpression})); } catch (err) { console.error(err); }`;

  void mainWindow.webContents.executeJavaScript(script).catch(() => {});
}

function flushPendingSharePayloads(): void {
  if (pendingSharePayloads.length === 0) return;
  const toFlush = pendingSharePayloads;
  pendingSharePayloads = [];
  for (const payload of toFlush) {
    dispatchShareToRenderer(payload);
  }
}

function revealMainWindow(): void {
  const mainWindow = myCapacitorApp.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function normalizeApiBase(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  dispatchShareToRenderer({
    source: 'electron-open-file',
    files: [{ name: path.basename(filePath), path: filePath }],
  });
  revealMainWindow();
});

app.on('open-url', (event, url) => {
  const payload = parseShareUrl(url);
  if (!payload) return;
  event.preventDefault();
  dispatchShareToRenderer(payload);
  revealMainWindow();
});

for (const arg of process.argv) {
  const payload = parseShareUrl(arg);
  if (payload) pendingSharePayloads.push(payload);
}

// Get Config options from capacitor.config
const capacitorFileConfig: CapacitorElectronConfig = getCapacitorElectronConfig();

// Initialize our app. You can pass menu templates into the app here.
// const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig);
const myCapacitorApp = new ElectronCapacitorApp(capacitorFileConfig, trayMenuTemplate, appMenuBarMenuTemplate);

// If deeplinking is enabled then we will set it up here.
if (capacitorFileConfig.electron?.deepLinkingEnabled) {
  setupElectronDeepLinking(myCapacitorApp, {
    customProtocol: capacitorFileConfig.electron.deepLinkingCustomProtocol ?? 'mycapacitorapp',
  });
}

// If we are in Dev mode, use the file watcher components.
if (electronIsDev) {
  setupReloadWatcher(myCapacitorApp);
}

// Run Application
(async () => {
  // Wait for electron app to be ready.
  await app.whenReady();
  // Security - Set Content-Security-Policy based on whether or not we are in dev mode.
  setupContentSecurityPolicy(myCapacitorApp.getCustomURLScheme());
  // Initialize our app, build windows, and load content.
  await myCapacitorApp.init();
  const mainWindow = myCapacitorApp.getMainWindow();
  initializeNativeModules(mainWindow);
  registerAllIPC();

  // Start the embedded agent runtime and pass the API port to the renderer.
  // The UI's api-client reads window.__MILADY_API_BASE__ to know where to connect.
  const externalApiBase = normalizeApiBase(process.env.MILADY_ELECTRON_TEST_API_BASE);
  if (!externalApiBase && process.env.MILADY_ELECTRON_TEST_API_BASE) {
    console.warn('[Milady] Ignoring invalid MILADY_ELECTRON_TEST_API_BASE value');
  }
  const skipEmbeddedAgent = process.env.MILADY_ELECTRON_SKIP_EMBEDDED_AGENT === '1' || Boolean(externalApiBase);
  const agentManager = getAgentManager();
  agentManager.setMainWindow(mainWindow);
  let injectedApiBase: string | null = null;
  const injectApiBase = (base: string | null): void => {
    if (!base || base === injectedApiBase || mainWindow.isDestroyed()) return;
    injectedApiBase = base;
    const apiToken = process.env.MILADY_API_TOKEN;
    const tokenSnippet = apiToken ? `window.__MILADY_API_TOKEN__ = ${JSON.stringify(apiToken)};` : "";
    const baseSnippet = `window.__MILADY_API_BASE__ = ${JSON.stringify(base)};`;
    const inject = `${baseSnippet}${tokenSnippet}`;

    // Inject now if possible (no-op if the page isn't ready yet).
    void mainWindow.webContents.executeJavaScript(inject)
      .then(() => {
        flushPendingSharePayloads();
      })
      .catch(() => { /* did-finish-load hook below handles first successful injection */ });
  };
  const injectApiEndpoint = (port: number | null): void => {
    if (!port) return;
    injectApiBase(`http://localhost:${port}`);
  };

  // Always inject on renderer reload/navigation once we know the port.
  mainWindow.webContents.on('did-finish-load', () => {
    if (externalApiBase) {
      injectApiBase(externalApiBase);
    } else {
      injectApiEndpoint(agentManager.getPort());
    }
    flushPendingSharePayloads();
  });

  if (externalApiBase) {
    console.info(`[Milady] Using external API base for renderer: ${externalApiBase}`);
    injectApiBase(externalApiBase);
  } else if (!skipEmbeddedAgent) {
    // Start in background and inject API base as soon as the port is available,
    // without waiting for the full runtime/plugin initialization path.
    const startPromise = agentManager.start();
    void (async () => {
      const startedAt = Date.now();
      const timeoutMs = 30_000;
      while (Date.now() - startedAt < timeoutMs) {
        const port = agentManager.getPort();
        if (port) {
          injectApiEndpoint(port);
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    })();

    startPromise.catch((err) => {
      console.error('[Milady] Agent startup failed:', err);
    });
  } else {
    console.info('[Milady] Embedded agent startup disabled by configuration');
  }

  // Check for updates if we are in a packaged app.
  if (process.env.MILADY_ELECTRON_DISABLE_AUTO_UPDATER !== '1') {
    autoUpdater.checkForUpdatesAndNotify().catch((err: Error) => {
      console.warn('[Milady] Update check failed (non-fatal):', err.message);
    });
  }
})();

// Handle when all of our windows are close (platforms have their own expectations).
app.on('window-all-closed', function () {
  // On OS X it is common for applications and their menu bar
  // to stay active until the user quits explicitly with Cmd + Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// When the dock icon is clicked.
app.on('activate', async function () {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (myCapacitorApp.getMainWindow().isDestroyed()) {
    await myCapacitorApp.init();
  }
});

app.on('before-quit', () => {
  disposeNativeModules();
});

// Place all ipc or other electron api calls and custom functionality under this line
