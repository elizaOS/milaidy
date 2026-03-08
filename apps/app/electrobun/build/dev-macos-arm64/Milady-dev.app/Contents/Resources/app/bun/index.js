// @bun
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __moduleCache = /* @__PURE__ */ new WeakMap;
var __toCommonJS = (from) => {
  var entry = __moduleCache.get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function")
    __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
      get: () => from[key],
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    }));
  __moduleCache.set(from, entry);
  return entry;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: (newValue) => all[name] = () => newValue
    });
};
var __esm = (fn, res) => () => (fn && (res = fn(fn = 0)), res);
var __promiseAll = (args) => Promise.all(args);

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/event.ts
class ElectrobunEvent {
  name;
  data;
  _response;
  responseWasSet = false;
  constructor(name, data) {
    this.name = name;
    this.data = data;
  }
  get response() {
    return this._response;
  }
  set response(value) {
    this._response = value;
    this.responseWasSet = true;
  }
  clearResponse() {
    this._response = undefined;
    this.responseWasSet = false;
  }
}

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/windowEvents.ts
var windowEvents_default;
var init_windowEvents = __esm(() => {
  windowEvents_default = {
    close: (data) => new ElectrobunEvent("close", data),
    resize: (data) => new ElectrobunEvent("resize", data),
    move: (data) => new ElectrobunEvent("move", data),
    focus: (data) => new ElectrobunEvent("focus", data)
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/webviewEvents.ts
var webviewEvents_default;
var init_webviewEvents = __esm(() => {
  webviewEvents_default = {
    willNavigate: (data) => new ElectrobunEvent("will-navigate", data),
    didNavigate: (data) => new ElectrobunEvent("did-navigate", data),
    didNavigateInPage: (data) => new ElectrobunEvent("did-navigate-in-page", data),
    didCommitNavigation: (data) => new ElectrobunEvent("did-commit-navigation", data),
    domReady: (data) => new ElectrobunEvent("dom-ready", data),
    newWindowOpen: (data) => new ElectrobunEvent("new-window-open", data),
    hostMessage: (data) => new ElectrobunEvent("host-message", data),
    downloadStarted: (data) => new ElectrobunEvent("download-started", data),
    downloadProgress: (data) => new ElectrobunEvent("download-progress", data),
    downloadCompleted: (data) => new ElectrobunEvent("download-completed", data),
    downloadFailed: (data) => new ElectrobunEvent("download-failed", data)
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/trayEvents.ts
var trayEvents_default;
var init_trayEvents = __esm(() => {
  trayEvents_default = {
    trayClicked: (data) => new ElectrobunEvent("tray-clicked", data)
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/ApplicationEvents.ts
var ApplicationEvents_default;
var init_ApplicationEvents = __esm(() => {
  ApplicationEvents_default = {
    applicationMenuClicked: (data) => new ElectrobunEvent("application-menu-clicked", data),
    contextMenuClicked: (data) => new ElectrobunEvent("context-menu-clicked", data),
    openUrl: (data) => new ElectrobunEvent("open-url", data),
    beforeQuit: (data) => new ElectrobunEvent("before-quit", data)
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/events/eventEmitter.ts
import EventEmitter from "events";
var ElectrobunEventEmitter, electrobunEventEmitter, eventEmitter_default;
var init_eventEmitter = __esm(() => {
  init_windowEvents();
  init_webviewEvents();
  init_trayEvents();
  init_ApplicationEvents();
  ElectrobunEventEmitter = class ElectrobunEventEmitter extends EventEmitter {
    constructor() {
      super();
    }
    emitEvent(ElectrobunEvent2, specifier) {
      if (specifier) {
        this.emit(`${ElectrobunEvent2.name}-${specifier}`, ElectrobunEvent2);
      } else {
        this.emit(ElectrobunEvent2.name, ElectrobunEvent2);
      }
    }
    events = {
      window: {
        ...windowEvents_default
      },
      webview: {
        ...webviewEvents_default
      },
      tray: {
        ...trayEvents_default
      },
      app: {
        ...ApplicationEvents_default
      }
    };
  };
  electrobunEventEmitter = new ElectrobunEventEmitter;
  eventEmitter_default = electrobunEventEmitter;
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/shared/rpc.ts
function missingTransportMethodError(methods, action) {
  const methodsString = methods.map((m) => `"${m}"`).join(", ");
  return new Error(`This RPC instance cannot ${action} because the transport did not provide one or more of these methods: ${methodsString}`);
}
function createRPC(options = {}) {
  let debugHooks = {};
  let transport = {};
  let requestHandler = undefined;
  function setTransport(newTransport) {
    if (transport.unregisterHandler)
      transport.unregisterHandler();
    transport = newTransport;
    transport.registerHandler?.(handler);
  }
  function setRequestHandler(h) {
    if (typeof h === "function") {
      requestHandler = h;
      return;
    }
    requestHandler = (method, params) => {
      const handlerFn = h[method];
      if (handlerFn)
        return handlerFn(params);
      const fallbackHandler = h._;
      if (!fallbackHandler)
        throw new Error(`The requested method has no handler: ${String(method)}`);
      return fallbackHandler(method, params);
    };
  }
  const { maxRequestTime = DEFAULT_MAX_REQUEST_TIME } = options;
  if (options.transport)
    setTransport(options.transport);
  if (options.requestHandler)
    setRequestHandler(options.requestHandler);
  if (options._debugHooks)
    debugHooks = options._debugHooks;
  let lastRequestId = 0;
  function getRequestId() {
    if (lastRequestId <= MAX_ID)
      return ++lastRequestId;
    return lastRequestId = 0;
  }
  const requestListeners = new Map;
  const requestTimeouts = new Map;
  function requestFn(method, ...args) {
    const params = args[0];
    return new Promise((resolve, reject) => {
      if (!transport.send)
        throw missingTransportMethodError(["send"], "make requests");
      const requestId = getRequestId();
      const request2 = {
        type: "request",
        id: requestId,
        method,
        params
      };
      requestListeners.set(requestId, { resolve, reject });
      if (maxRequestTime !== Infinity)
        requestTimeouts.set(requestId, setTimeout(() => {
          requestTimeouts.delete(requestId);
          reject(new Error("RPC request timed out."));
        }, maxRequestTime));
      debugHooks.onSend?.(request2);
      transport.send(request2);
    });
  }
  const request = new Proxy(requestFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (params) => requestFn(prop, params);
    }
  });
  const requestProxy = request;
  function sendFn(message, ...args) {
    const payload = args[0];
    if (!transport.send)
      throw missingTransportMethodError(["send"], "send messages");
    const rpcMessage = {
      type: "message",
      id: message,
      payload
    };
    debugHooks.onSend?.(rpcMessage);
    transport.send(rpcMessage);
  }
  const send = new Proxy(sendFn, {
    get: (target, prop, receiver) => {
      if (prop in target)
        return Reflect.get(target, prop, receiver);
      return (payload) => sendFn(prop, payload);
    }
  });
  const sendProxy = send;
  const messageListeners = new Map;
  const wildcardMessageListeners = new Set;
  function addMessageListener(message, listener) {
    if (!transport.registerHandler)
      throw missingTransportMethodError(["registerHandler"], "register message listeners");
    if (message === "*") {
      wildcardMessageListeners.add(listener);
      return;
    }
    if (!messageListeners.has(message))
      messageListeners.set(message, new Set);
    messageListeners.get(message).add(listener);
  }
  function removeMessageListener(message, listener) {
    if (message === "*") {
      wildcardMessageListeners.delete(listener);
      return;
    }
    messageListeners.get(message)?.delete(listener);
    if (messageListeners.get(message)?.size === 0)
      messageListeners.delete(message);
  }
  async function handler(message) {
    debugHooks.onReceive?.(message);
    if (!("type" in message))
      throw new Error("Message does not contain a type.");
    if (message.type === "request") {
      if (!transport.send || !requestHandler)
        throw missingTransportMethodError(["send", "requestHandler"], "handle requests");
      const { id, method, params } = message;
      let response;
      try {
        response = {
          type: "response",
          id,
          success: true,
          payload: await requestHandler(method, params)
        };
      } catch (error) {
        if (!(error instanceof Error))
          throw error;
        response = {
          type: "response",
          id,
          success: false,
          error: error.message
        };
      }
      debugHooks.onSend?.(response);
      transport.send(response);
      return;
    }
    if (message.type === "response") {
      const timeout = requestTimeouts.get(message.id);
      if (timeout != null)
        clearTimeout(timeout);
      const { resolve, reject } = requestListeners.get(message.id) ?? {};
      if (!message.success)
        reject?.(new Error(message.error));
      else
        resolve?.(message.payload);
      return;
    }
    if (message.type === "message") {
      for (const listener of wildcardMessageListeners)
        listener(message.id, message.payload);
      const listeners = messageListeners.get(message.id);
      if (!listeners)
        return;
      for (const listener of listeners)
        listener(message.payload);
      return;
    }
    throw new Error(`Unexpected RPC message type: ${message.type}`);
  }
  const proxy = { send: sendProxy, request: requestProxy };
  return {
    setTransport,
    setRequestHandler,
    request,
    requestProxy,
    send,
    sendProxy,
    addMessageListener,
    removeMessageListener,
    proxy
  };
}
function defineElectrobunRPC(_side, config) {
  const rpcOptions = {
    maxRequestTime: config.maxRequestTime,
    requestHandler: {
      ...config.handlers.requests,
      ...config.extraRequestHandlers
    },
    transport: {
      registerHandler: () => {}
    }
  };
  const rpc = createRPC(rpcOptions);
  const messageHandlers = config.handlers.messages;
  if (messageHandlers) {
    rpc.addMessageListener("*", (messageName, payload) => {
      const globalHandler = messageHandlers["*"];
      if (globalHandler) {
        globalHandler(messageName, payload);
      }
      const messageHandler = messageHandlers[messageName];
      if (messageHandler) {
        messageHandler(payload);
      }
    });
  }
  return rpc;
}
var MAX_ID = 10000000000, DEFAULT_MAX_REQUEST_TIME = 1000;

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/shared/platform.ts
import { platform, arch } from "os";
var platformName, archName, OS, ARCH;
var init_platform = __esm(() => {
  platformName = platform();
  archName = arch();
  OS = (() => {
    switch (platformName) {
      case "win32":
        return "win";
      case "darwin":
        return "macos";
      case "linux":
        return "linux";
      default:
        throw new Error(`Unsupported platform: ${platformName}`);
    }
  })();
  ARCH = (() => {
    if (OS === "win") {
      return "x64";
    }
    switch (archName) {
      case "arm64":
        return "arm64";
      case "x64":
        return "x64";
      default:
        throw new Error(`Unsupported architecture: ${archName}`);
    }
  })();
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/shared/naming.ts
function sanitizeAppName(appName) {
  return appName.replace(/ /g, "");
}
function getAppFileName(appName, buildEnvironment) {
  const sanitized = sanitizeAppName(appName);
  return buildEnvironment === "stable" ? sanitized : `${sanitized}-${buildEnvironment}`;
}
function getPlatformPrefix(buildEnvironment, os2, arch2) {
  return `${buildEnvironment}-${os2}-${arch2}`;
}
function getTarballFileName(appFileName, os2) {
  return os2 === "macos" ? `${appFileName}.app.tar.zst` : `${appFileName}.tar.zst`;
}

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/Utils.ts
var exports_Utils = {};
__export(exports_Utils, {
  showNotification: () => showNotification,
  showMessageBox: () => showMessageBox,
  showItemInFolder: () => showItemInFolder,
  quit: () => quit,
  paths: () => paths,
  openPath: () => openPath,
  openFileDialog: () => openFileDialog,
  openExternal: () => openExternal,
  moveToTrash: () => moveToTrash,
  clipboardWriteText: () => clipboardWriteText,
  clipboardWriteImage: () => clipboardWriteImage,
  clipboardReadText: () => clipboardReadText,
  clipboardReadImage: () => clipboardReadImage,
  clipboardClear: () => clipboardClear,
  clipboardAvailableFormats: () => clipboardAvailableFormats
});
import { homedir, tmpdir } from "os";
import { join } from "path";
import { readFileSync } from "fs";
function getLinuxXdgUserDirs() {
  try {
    const content = readFileSync(join(home, ".config", "user-dirs.dirs"), "utf-8");
    const dirs = {};
    for (const line of content.split(`
`)) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed.includes("="))
        continue;
      const eqIdx = trimmed.indexOf("=");
      const key = trimmed.slice(0, eqIdx);
      let value = trimmed.slice(eqIdx + 1);
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      value = value.replace(/\$HOME/g, home);
      dirs[key] = value;
    }
    return dirs;
  } catch {
    return {};
  }
}
function xdgUserDir(key, fallbackName) {
  if (OS !== "linux")
    return "";
  if (!_xdgUserDirs)
    _xdgUserDirs = getLinuxXdgUserDirs();
  return _xdgUserDirs[key] || join(home, fallbackName);
}
function getVersionInfo() {
  if (_versionInfo)
    return _versionInfo;
  try {
    const resourcesDir = "Resources";
    const raw = readFileSync(join("..", resourcesDir, "version.json"), "utf-8");
    const parsed = JSON.parse(raw);
    _versionInfo = { identifier: parsed.identifier, channel: parsed.channel };
    return _versionInfo;
  } catch (error) {
    console.error("Failed to read version.json", error);
    throw error;
  }
}
function getAppDataDir() {
  switch (OS) {
    case "macos":
      return join(home, "Library", "Application Support");
    case "win":
      return process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    case "linux":
      return process.env["XDG_DATA_HOME"] || join(home, ".local", "share");
  }
}
function getCacheDir() {
  switch (OS) {
    case "macos":
      return join(home, "Library", "Caches");
    case "win":
      return process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    case "linux":
      return process.env["XDG_CACHE_HOME"] || join(home, ".cache");
  }
}
function getLogsDir() {
  switch (OS) {
    case "macos":
      return join(home, "Library", "Logs");
    case "win":
      return process.env["LOCALAPPDATA"] || join(home, "AppData", "Local");
    case "linux":
      return process.env["XDG_STATE_HOME"] || join(home, ".local", "state");
  }
}
function getConfigDir() {
  switch (OS) {
    case "macos":
      return join(home, "Library", "Application Support");
    case "win":
      return process.env["APPDATA"] || join(home, "AppData", "Roaming");
    case "linux":
      return process.env["XDG_CONFIG_HOME"] || join(home, ".config");
  }
}
function getUserDir(macName, winName, xdgKey, fallbackName) {
  switch (OS) {
    case "macos":
      return join(home, macName);
    case "win": {
      const userProfile = process.env["USERPROFILE"] || home;
      return join(userProfile, winName);
    }
    case "linux":
      return xdgUserDir(xdgKey, fallbackName);
  }
}
var moveToTrash = (path) => {
  return ffi.request.moveToTrash({ path });
}, showItemInFolder = (path) => {
  return ffi.request.showItemInFolder({ path });
}, openExternal = (url) => {
  return ffi.request.openExternal({ url });
}, openPath = (path) => {
  return ffi.request.openPath({ path });
}, showNotification = (options) => {
  const { title, body, subtitle, silent } = options;
  ffi.request.showNotification({ title, body, subtitle, silent });
}, isQuitting = false, quit = () => {
  if (isQuitting)
    return;
  isQuitting = true;
  const beforeQuitEvent = electrobunEventEmitter.events.app.beforeQuit({});
  electrobunEventEmitter.emitEvent(beforeQuitEvent);
  if (beforeQuitEvent.responseWasSet && beforeQuitEvent.response?.allow === false) {
    isQuitting = false;
    return;
  }
  native.symbols.stopEventLoop();
  native.symbols.waitForShutdownComplete(5000);
  native.symbols.forceExit(0);
}, openFileDialog = async (opts = {}) => {
  const optsWithDefault = {
    ...{
      startingFolder: "~/",
      allowedFileTypes: "*",
      canChooseFiles: true,
      canChooseDirectory: true,
      allowsMultipleSelection: true
    },
    ...opts
  };
  const result = await ffi.request.openFileDialog({
    startingFolder: optsWithDefault.startingFolder,
    allowedFileTypes: optsWithDefault.allowedFileTypes,
    canChooseFiles: optsWithDefault.canChooseFiles,
    canChooseDirectory: optsWithDefault.canChooseDirectory,
    allowsMultipleSelection: optsWithDefault.allowsMultipleSelection
  });
  const filePaths = result.split(",");
  return filePaths;
}, showMessageBox = async (opts = {}) => {
  const {
    type = "info",
    title = "",
    message = "",
    detail = "",
    buttons = ["OK"],
    defaultId = 0,
    cancelId = -1
  } = opts;
  const response = ffi.request.showMessageBox({
    type,
    title,
    message,
    detail,
    buttons,
    defaultId,
    cancelId
  });
  return { response };
}, clipboardReadText = () => {
  return ffi.request.clipboardReadText();
}, clipboardWriteText = (text) => {
  ffi.request.clipboardWriteText({ text });
}, clipboardReadImage = () => {
  return ffi.request.clipboardReadImage();
}, clipboardWriteImage = (pngData) => {
  ffi.request.clipboardWriteImage({ pngData });
}, clipboardClear = () => {
  ffi.request.clipboardClear();
}, clipboardAvailableFormats = () => {
  return ffi.request.clipboardAvailableFormats();
}, home, _xdgUserDirs, _versionInfo, paths;
var init_Utils = __esm(async () => {
  init_eventEmitter();
  init_platform();
  await init_native();
  process.exit = (code) => {
    if (isQuitting) {
      native.symbols.forceExit(code ?? 0);
      return;
    }
    quit();
  };
  home = homedir();
  paths = {
    get home() {
      return home;
    },
    get appData() {
      return getAppDataDir();
    },
    get config() {
      return getConfigDir();
    },
    get cache() {
      return getCacheDir();
    },
    get temp() {
      return tmpdir();
    },
    get logs() {
      return getLogsDir();
    },
    get documents() {
      return getUserDir("Documents", "Documents", "XDG_DOCUMENTS_DIR", "Documents");
    },
    get downloads() {
      return getUserDir("Downloads", "Downloads", "XDG_DOWNLOAD_DIR", "Downloads");
    },
    get desktop() {
      return getUserDir("Desktop", "Desktop", "XDG_DESKTOP_DIR", "Desktop");
    },
    get pictures() {
      return getUserDir("Pictures", "Pictures", "XDG_PICTURES_DIR", "Pictures");
    },
    get music() {
      return getUserDir("Music", "Music", "XDG_MUSIC_DIR", "Music");
    },
    get videos() {
      return getUserDir("Movies", "Videos", "XDG_VIDEOS_DIR", "Videos");
    },
    get userData() {
      const { identifier, channel } = getVersionInfo();
      return join(getAppDataDir(), identifier, channel);
    },
    get userCache() {
      const { identifier, channel } = getVersionInfo();
      return join(getCacheDir(), identifier, channel);
    },
    get userLogs() {
      const { identifier, channel } = getVersionInfo();
      return join(getLogsDir(), identifier, channel);
    }
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/Updater.ts
import { join as join2, dirname, resolve } from "path";
import { homedir as homedir2 } from "os";
import {
  renameSync,
  unlinkSync,
  mkdirSync,
  rmSync,
  statSync,
  readdirSync
} from "fs";
import { execSync } from "child_process";
function emitStatus(status, message, details) {
  const entry = {
    status,
    message,
    timestamp: Date.now(),
    details
  };
  statusHistory.push(entry);
  if (onStatusChangeCallback) {
    onStatusChangeCallback(entry);
  }
}
function getAppDataDir2() {
  switch (OS) {
    case "macos":
      return join2(homedir2(), "Library", "Application Support");
    case "win":
      return process.env["LOCALAPPDATA"] || join2(homedir2(), "AppData", "Local");
    case "linux":
      return process.env["XDG_DATA_HOME"] || join2(homedir2(), ".local", "share");
    default:
      return join2(homedir2(), ".config");
  }
}
function cleanupExtractionFolder(extractionFolder, keepTarHash) {
  const keepFile = `${keepTarHash}.tar`;
  try {
    const entries = readdirSync(extractionFolder);
    for (const entry of entries) {
      if (entry === keepFile)
        continue;
      const fullPath = join2(extractionFolder, entry);
      try {
        const s = statSync(fullPath);
        if (s.isDirectory()) {
          rmSync(fullPath, { recursive: true });
        } else {
          unlinkSync(fullPath);
        }
      } catch (e) {}
    }
  } catch (e) {}
}
var statusHistory, onStatusChangeCallback = null, localInfo, updateInfo, Updater;
var init_Updater = __esm(async () => {
  init_platform();
  await init_Utils();
  statusHistory = [];
  Updater = {
    updateInfo: () => {
      return updateInfo;
    },
    getStatusHistory: () => {
      return [...statusHistory];
    },
    clearStatusHistory: () => {
      statusHistory.length = 0;
    },
    onStatusChange: (callback) => {
      onStatusChangeCallback = callback;
    },
    checkForUpdate: async () => {
      emitStatus("checking", "Checking for updates...");
      const localInfo2 = await Updater.getLocallocalInfo();
      if (localInfo2.channel === "dev") {
        emitStatus("no-update", "Dev channel - updates disabled", {
          currentHash: localInfo2.hash
        });
        return {
          version: localInfo2.version,
          hash: localInfo2.hash,
          updateAvailable: false,
          updateReady: false,
          error: ""
        };
      }
      const cacheBuster = Math.random().toString(36).substring(7);
      const platformPrefix = getPlatformPrefix(localInfo2.channel, OS, ARCH);
      const updateInfoUrl = `${localInfo2.baseUrl.replace(/\/+$/, "")}/${platformPrefix}-update.json?${cacheBuster}`;
      try {
        const updateInfoResponse = await fetch(updateInfoUrl);
        if (updateInfoResponse.ok) {
          const responseText = await updateInfoResponse.text();
          try {
            updateInfo = JSON.parse(responseText);
          } catch {
            emitStatus("error", "Invalid update.json: failed to parse JSON", {
              url: updateInfoUrl
            });
            return {
              version: "",
              hash: "",
              updateAvailable: false,
              updateReady: false,
              error: `Invalid update.json: failed to parse JSON`
            };
          }
          if (!updateInfo.hash) {
            emitStatus("error", "Invalid update.json: missing hash", {
              url: updateInfoUrl
            });
            return {
              version: "",
              hash: "",
              updateAvailable: false,
              updateReady: false,
              error: `Invalid update.json: missing hash`
            };
          }
          if (updateInfo.hash !== localInfo2.hash) {
            updateInfo.updateAvailable = true;
            emitStatus("update-available", `Update available: ${localInfo2.hash.slice(0, 8)} \u2192 ${updateInfo.hash.slice(0, 8)}`, {
              currentHash: localInfo2.hash,
              latestHash: updateInfo.hash
            });
          } else {
            emitStatus("no-update", "Already on latest version", {
              currentHash: localInfo2.hash
            });
          }
        } else {
          emitStatus("error", `Failed to fetch update info (HTTP ${updateInfoResponse.status})`, { url: updateInfoUrl });
          return {
            version: "",
            hash: "",
            updateAvailable: false,
            updateReady: false,
            error: `Failed to fetch update info from ${updateInfoUrl}`
          };
        }
      } catch (error) {
        return {
          version: "",
          hash: "",
          updateAvailable: false,
          updateReady: false,
          error: `Failed to fetch update info from ${updateInfoUrl}`
        };
      }
      return updateInfo;
    },
    downloadUpdate: async () => {
      emitStatus("download-starting", "Starting update download...");
      const appDataFolder = await Updater.appDataFolder();
      await Updater.channelBucketUrl();
      const appFileName = localInfo.name;
      let currentHash = (await Updater.getLocallocalInfo()).hash;
      let latestHash = (await Updater.checkForUpdate()).hash;
      const extractionFolder = join2(appDataFolder, "self-extraction");
      if (!await Bun.file(extractionFolder).exists()) {
        mkdirSync(extractionFolder, { recursive: true });
      }
      let currentTarPath = join2(extractionFolder, `${currentHash}.tar`);
      const latestTarPath = join2(extractionFolder, `${latestHash}.tar`);
      const seenHashes = [];
      let patchesApplied = 0;
      let usedPatchPath = false;
      if (!await Bun.file(latestTarPath).exists()) {
        emitStatus("checking-local-tar", `Checking for local tar file: ${currentHash.slice(0, 8)}`, { currentHash });
        while (currentHash !== latestHash) {
          seenHashes.push(currentHash);
          const currentTar = Bun.file(currentTarPath);
          if (!await currentTar.exists()) {
            emitStatus("local-tar-missing", `Local tar not found for ${currentHash.slice(0, 8)}, will download full bundle`, { currentHash });
            break;
          }
          emitStatus("local-tar-found", `Found local tar for ${currentHash.slice(0, 8)}`, { currentHash });
          const platformPrefix = getPlatformPrefix(localInfo.channel, OS, ARCH);
          const patchUrl = `${localInfo.baseUrl.replace(/\/+$/, "")}/${platformPrefix}-${currentHash}.patch`;
          emitStatus("fetching-patch", `Checking for patch: ${currentHash.slice(0, 8)}`, { currentHash, url: patchUrl });
          const patchResponse = await fetch(patchUrl);
          if (!patchResponse.ok) {
            emitStatus("patch-not-found", `No patch available for ${currentHash.slice(0, 8)}, will download full bundle`, { currentHash });
            break;
          }
          emitStatus("patch-found", `Patch found for ${currentHash.slice(0, 8)}`, { currentHash });
          emitStatus("downloading-patch", `Downloading patch for ${currentHash.slice(0, 8)}...`, { currentHash });
          const patchFilePath = join2(appDataFolder, "self-extraction", `${currentHash}.patch`);
          await Bun.write(patchFilePath, await patchResponse.arrayBuffer());
          const tmpPatchedTarFilePath = join2(appDataFolder, "self-extraction", `from-${currentHash}.tar`);
          const bunBinDir = dirname(process.execPath);
          const bspatchBinName = OS === "win" ? "bspatch.exe" : "bspatch";
          const bspatchPath = join2(bunBinDir, bspatchBinName);
          emitStatus("applying-patch", `Applying patch ${patchesApplied + 1} for ${currentHash.slice(0, 8)}...`, {
            currentHash,
            patchNumber: patchesApplied + 1
          });
          if (!statSync(bspatchPath, { throwIfNoEntry: false })) {
            emitStatus("patch-failed", `bspatch binary not found at ${bspatchPath}`, {
              currentHash,
              errorMessage: `bspatch not found: ${bspatchPath}`
            });
            console.error("bspatch not found:", bspatchPath);
            break;
          }
          if (!statSync(currentTarPath, { throwIfNoEntry: false })) {
            emitStatus("patch-failed", `Old tar not found at ${currentTarPath}`, {
              currentHash,
              errorMessage: `old tar not found: ${currentTarPath}`
            });
            console.error("old tar not found:", currentTarPath);
            break;
          }
          if (!statSync(patchFilePath, { throwIfNoEntry: false })) {
            emitStatus("patch-failed", `Patch file not found at ${patchFilePath}`, {
              currentHash,
              errorMessage: `patch not found: ${patchFilePath}`
            });
            console.error("patch file not found:", patchFilePath);
            break;
          }
          try {
            const patchResult = Bun.spawnSync([
              bspatchPath,
              currentTarPath,
              tmpPatchedTarFilePath,
              patchFilePath
            ]);
            if (patchResult.exitCode !== 0 || patchResult.success === false) {
              const stderr = patchResult.stderr ? patchResult.stderr.toString() : "";
              const stdout = patchResult.stdout ? patchResult.stdout.toString() : "";
              if (updateInfo) {
                updateInfo.error = stderr || `bspatch failed with exit code ${patchResult.exitCode}`;
              }
              emitStatus("patch-failed", `Patch application failed: ${stderr || `exit code ${patchResult.exitCode}`}`, {
                currentHash,
                errorMessage: stderr || `exit code ${patchResult.exitCode}`
              });
              console.error("bspatch failed", {
                exitCode: patchResult.exitCode,
                stdout,
                stderr,
                bspatchPath,
                oldTar: currentTarPath,
                newTar: tmpPatchedTarFilePath,
                patch: patchFilePath
              });
              break;
            }
          } catch (error) {
            emitStatus("patch-failed", `Patch threw exception: ${error.message}`, {
              currentHash,
              errorMessage: error.message
            });
            console.error("bspatch threw", error, { bspatchPath });
            break;
          }
          patchesApplied++;
          emitStatus("patch-applied", `Patch ${patchesApplied} applied successfully`, {
            currentHash,
            patchNumber: patchesApplied
          });
          emitStatus("extracting-version", "Extracting version info from patched tar...", { currentHash });
          let hashFilePath = "";
          const resourcesDir = "Resources";
          const patchedTarBytes = await Bun.file(tmpPatchedTarFilePath).arrayBuffer();
          const patchedArchive = new Bun.Archive(patchedTarBytes);
          const patchedFiles = await patchedArchive.files();
          for (const [filePath] of patchedFiles) {
            if (filePath.endsWith(`${resourcesDir}/version.json`) || filePath.endsWith("metadata.json")) {
              hashFilePath = filePath;
              break;
            }
          }
          if (!hashFilePath) {
            emitStatus("error", "Could not find version/metadata file in patched tar", { currentHash });
            console.error("Neither Resources/version.json nor metadata.json found in patched tar:", tmpPatchedTarFilePath);
            break;
          }
          const hashFile = patchedFiles.get(hashFilePath);
          const hashFileJson = JSON.parse(await hashFile.text());
          const nextHash = hashFileJson.hash;
          if (seenHashes.includes(nextHash)) {
            emitStatus("error", "Cyclical update detected, falling back to full download", { currentHash: nextHash });
            console.log("Warning: cyclical update detected");
            break;
          }
          seenHashes.push(nextHash);
          if (!nextHash) {
            emitStatus("error", "Could not determine next hash from patched tar", { currentHash });
            break;
          }
          const updatedTarPath = join2(appDataFolder, "self-extraction", `${nextHash}.tar`);
          renameSync(tmpPatchedTarFilePath, updatedTarPath);
          unlinkSync(currentTarPath);
          unlinkSync(patchFilePath);
          currentHash = nextHash;
          currentTarPath = join2(appDataFolder, "self-extraction", `${currentHash}.tar`);
          emitStatus("patch-applied", `Patched to ${nextHash.slice(0, 8)}, checking for more patches...`, {
            currentHash: nextHash,
            toHash: latestHash,
            totalPatchesApplied: patchesApplied
          });
        }
        if (currentHash === latestHash && patchesApplied > 0) {
          usedPatchPath = true;
          emitStatus("patch-chain-complete", `Patch chain complete! Applied ${patchesApplied} patches`, {
            totalPatchesApplied: patchesApplied,
            currentHash: latestHash,
            usedPatchPath: true
          });
        }
        if (currentHash !== latestHash) {
          emitStatus("downloading-full-bundle", "Downloading full update bundle...", {
            currentHash,
            latestHash,
            usedPatchPath: false
          });
          const cacheBuster = Math.random().toString(36).substring(7);
          const platformPrefix = getPlatformPrefix(localInfo.channel, OS, ARCH);
          const tarballName = getTarballFileName(appFileName, OS);
          const urlToLatestTarball = `${localInfo.baseUrl.replace(/\/+$/, "")}/${platformPrefix}-${tarballName}`;
          const prevVersionCompressedTarballPath = join2(appDataFolder, "self-extraction", "latest.tar.zst");
          emitStatus("download-progress", `Fetching ${tarballName}...`, {
            url: urlToLatestTarball
          });
          const response = await fetch(urlToLatestTarball + `?${cacheBuster}`);
          if (response.ok && response.body) {
            const contentLength = response.headers.get("content-length");
            const totalBytes = contentLength ? parseInt(contentLength, 10) : undefined;
            let bytesDownloaded = 0;
            const reader = response.body.getReader();
            const writer = Bun.file(prevVersionCompressedTarballPath).writer();
            while (true) {
              const { done, value } = await reader.read();
              if (done)
                break;
              await writer.write(value);
              bytesDownloaded += value.length;
              if (bytesDownloaded % 500000 < value.length) {
                emitStatus("download-progress", `Downloading: ${(bytesDownloaded / 1024 / 1024).toFixed(1)} MB`, {
                  bytesDownloaded,
                  totalBytes,
                  progress: totalBytes ? Math.round(bytesDownloaded / totalBytes * 100) : undefined
                });
              }
            }
            await writer.flush();
            writer.end();
            emitStatus("download-progress", `Download complete: ${(bytesDownloaded / 1024 / 1024).toFixed(1)} MB`, {
              bytesDownloaded,
              totalBytes,
              progress: 100
            });
          } else {
            emitStatus("error", `Failed to download: ${urlToLatestTarball}`, {
              url: urlToLatestTarball
            });
            console.log("latest version not found at: ", urlToLatestTarball);
          }
          emitStatus("decompressing", "Decompressing update bundle...");
          const bunBinDir = dirname(process.execPath);
          const zstdBinName = OS === "win" ? "zig-zstd.exe" : "zig-zstd";
          const zstdPath = join2(bunBinDir, zstdBinName);
          if (!statSync(zstdPath, { throwIfNoEntry: false })) {
            updateInfo.error = `zig-zstd not found: ${zstdPath}`;
            emitStatus("error", updateInfo.error, { zstdPath });
            console.error("zig-zstd not found:", zstdPath);
          } else {
            const decompressResult = Bun.spawnSync([
              zstdPath,
              "decompress",
              "-i",
              prevVersionCompressedTarballPath,
              "-o",
              latestTarPath,
              "--no-timing"
            ], {
              cwd: extractionFolder,
              stdout: "inherit",
              stderr: "inherit"
            });
            if (!decompressResult.success) {
              updateInfo.error = `zig-zstd failed with exit code ${decompressResult.exitCode}`;
              emitStatus("error", updateInfo.error, {
                zstdPath,
                exitCode: decompressResult.exitCode
              });
              console.error("zig-zstd failed", {
                exitCode: decompressResult.exitCode,
                zstdPath
              });
            } else {
              emitStatus("decompressing", "Decompression complete");
            }
          }
          unlinkSync(prevVersionCompressedTarballPath);
        }
      }
      if (await Bun.file(latestTarPath).exists()) {
        updateInfo.updateReady = true;
        emitStatus("download-complete", `Update ready to install (used ${usedPatchPath ? "patch" : "full download"} path)`, {
          latestHash,
          usedPatchPath,
          totalPatchesApplied: patchesApplied
        });
      } else {
        updateInfo.error = "Failed to download latest version";
        emitStatus("error", "Failed to download latest version", { latestHash });
      }
      cleanupExtractionFolder(extractionFolder, latestHash);
    },
    applyUpdate: async () => {
      if (updateInfo?.updateReady) {
        emitStatus("applying", "Starting update installation...");
        const appDataFolder = await Updater.appDataFolder();
        const extractionFolder = join2(appDataFolder, "self-extraction");
        if (!await Bun.file(extractionFolder).exists()) {
          mkdirSync(extractionFolder, { recursive: true });
        }
        let latestHash = (await Updater.checkForUpdate()).hash;
        const latestTarPath = join2(extractionFolder, `${latestHash}.tar`);
        let appBundleSubpath = "";
        if (await Bun.file(latestTarPath).exists()) {
          emitStatus("extracting", `Extracting update to ${latestHash.slice(0, 8)}...`, { latestHash });
          const extractionDir = OS === "win" ? join2(extractionFolder, `temp-${latestHash}`) : extractionFolder;
          if (OS === "win") {
            mkdirSync(extractionDir, { recursive: true });
          }
          const latestTarBytes = await Bun.file(latestTarPath).arrayBuffer();
          const latestArchive = new Bun.Archive(latestTarBytes);
          await latestArchive.extract(extractionDir);
          if (OS === "macos") {
            const extractedFiles = readdirSync(extractionDir);
            for (const file of extractedFiles) {
              if (file.endsWith(".app")) {
                appBundleSubpath = file + "/";
                break;
              }
            }
          } else {
            appBundleSubpath = "./";
          }
          console.log(`Tar extraction completed. Found appBundleSubpath: ${appBundleSubpath}`);
          if (!appBundleSubpath) {
            console.error("Failed to find app in tarball");
            return;
          }
          const extractedAppPath = resolve(join2(extractionDir, appBundleSubpath));
          let newAppBundlePath;
          if (OS === "linux") {
            const extractedFiles = readdirSync(extractionDir);
            const appBundleDir = extractedFiles.find((file) => {
              const filePath = join2(extractionDir, file);
              return statSync(filePath).isDirectory() && !file.endsWith(".tar");
            });
            if (!appBundleDir) {
              console.error("Could not find app bundle directory in extraction");
              return;
            }
            newAppBundlePath = join2(extractionDir, appBundleDir);
            const bundleStats = statSync(newAppBundlePath, { throwIfNoEntry: false });
            if (!bundleStats || !bundleStats.isDirectory()) {
              console.error(`App bundle directory not found at: ${newAppBundlePath}`);
              console.log("Contents of extraction directory:");
              try {
                const files = readdirSync(extractionDir);
                for (const file of files) {
                  console.log(`  - ${file}`);
                  const subPath = join2(extractionDir, file);
                  if (statSync(subPath).isDirectory()) {
                    const subFiles = readdirSync(subPath);
                    for (const subFile of subFiles) {
                      console.log(`    - ${subFile}`);
                    }
                  }
                }
              } catch (e) {
                console.log("Could not list directory contents:", e);
              }
              return;
            }
          } else if (OS === "win") {
            const appBundleName = getAppFileName(localInfo.name, localInfo.channel);
            newAppBundlePath = join2(extractionDir, appBundleName);
            if (!statSync(newAppBundlePath, { throwIfNoEntry: false })) {
              console.error(`Extracted app not found at: ${newAppBundlePath}`);
              console.log("Contents of extraction directory:");
              try {
                const files = readdirSync(extractionDir);
                for (const file of files) {
                  console.log(`  - ${file}`);
                }
              } catch (e) {
                console.log("Could not list directory contents:", e);
              }
              return;
            }
          } else {
            newAppBundlePath = extractedAppPath;
          }
          let runningAppBundlePath;
          const appDataFolder2 = await Updater.appDataFolder();
          if (OS === "macos") {
            runningAppBundlePath = resolve(dirname(process.execPath), "..", "..");
          } else if (OS === "linux" || OS === "win") {
            runningAppBundlePath = join2(appDataFolder2, "app");
          } else {
            throw new Error(`Unsupported platform: ${OS}`);
          }
          try {
            emitStatus("replacing-app", "Removing old version...");
            if (OS === "macos") {
              if (statSync(runningAppBundlePath, { throwIfNoEntry: false })) {
                rmSync(runningAppBundlePath, { recursive: true });
              }
              emitStatus("replacing-app", "Installing new version...");
              renameSync(newAppBundlePath, runningAppBundlePath);
              try {
                execSync(`xattr -r -d com.apple.quarantine "${runningAppBundlePath}"`, { stdio: "ignore" });
              } catch (e) {}
            } else if (OS === "linux") {
              const appBundleDir = join2(appDataFolder2, "app");
              if (statSync(appBundleDir, { throwIfNoEntry: false })) {
                rmSync(appBundleDir, { recursive: true });
              }
              renameSync(newAppBundlePath, appBundleDir);
              const launcherPath = join2(appBundleDir, "bin", "launcher");
              if (statSync(launcherPath, { throwIfNoEntry: false })) {
                execSync(`chmod +x "${launcherPath}"`);
              }
              const bunPath = join2(appBundleDir, "bin", "bun");
              if (statSync(bunPath, { throwIfNoEntry: false })) {
                execSync(`chmod +x "${bunPath}"`);
              }
            }
            if (OS !== "win") {
              cleanupExtractionFolder(extractionFolder, latestHash);
            }
            if (OS === "win") {
              const parentDir = dirname(runningAppBundlePath);
              const updateScriptPath = join2(parentDir, "update.bat");
              const launcherPath = join2(runningAppBundlePath, "bin", "launcher.exe");
              const runningAppWin = runningAppBundlePath.replace(/\//g, "\\");
              const newAppWin = newAppBundlePath.replace(/\//g, "\\");
              const extractionDirWin = extractionDir.replace(/\//g, "\\");
              const launcherPathWin = launcherPath.replace(/\//g, "\\");
              const updateScript = `@echo off
setlocal

:: Wait for the app to fully exit (check if launcher.exe is still running)
:waitloop
tasklist /FI "IMAGENAME eq launcher.exe" 2>NUL | find /I /N "launcher.exe">NUL
if "%ERRORLEVEL%"=="0" (
    timeout /t 1 /nobreak >nul
    goto waitloop
)

:: Small extra delay to ensure all file handles are released
timeout /t 2 /nobreak >nul

:: Remove current app folder
if exist "${runningAppWin}" (
    rmdir /s /q "${runningAppWin}"
)

:: Move new app to current location
move "${newAppWin}" "${runningAppWin}"

:: Clean up extraction directory
rmdir /s /q "${extractionDirWin}" 2>nul

:: Launch the new app
start "" "${launcherPathWin}"

:: Clean up scheduled tasks starting with ElectrobunUpdate_
for /f "tokens=1" %%t in ('schtasks /query /fo list ^| findstr /i "ElectrobunUpdate_"') do (
    schtasks /delete /tn "%%t" /f >nul 2>&1
)

:: Delete this update script after a short delay
ping -n 2 127.0.0.1 >nul
del "%~f0"
`;
              await Bun.write(updateScriptPath, updateScript);
              const scriptPathWin = updateScriptPath.replace(/\//g, "\\");
              const taskName = `ElectrobunUpdate_${Date.now()}`;
              execSync(`schtasks /create /tn "${taskName}" /tr "cmd /c \\"${scriptPathWin}\\"" /sc once /st 00:00 /f`, { stdio: "ignore" });
              execSync(`schtasks /run /tn "${taskName}"`, { stdio: "ignore" });
              quit();
            }
          } catch (error) {
            emitStatus("error", `Failed to replace app: ${error.message}`, {
              errorMessage: error.message
            });
            console.error("Failed to replace app with new version", error);
            return;
          }
          emitStatus("launching-new-version", "Launching updated version...");
          if (OS === "macos") {
            const pid = process.pid;
            Bun.spawn([
              "sh",
              "-c",
              `while kill -0 ${pid} 2>/dev/null; do sleep 0.5; done; sleep 1; open "${runningAppBundlePath}"`
            ], {
              detached: true,
              stdio: ["ignore", "ignore", "ignore"]
            });
          } else if (OS === "linux") {
            const launcherPath = join2(runningAppBundlePath, "bin", "launcher");
            Bun.spawn(["sh", "-c", `"${launcherPath}" &`], {
              detached: true
            });
          }
          emitStatus("complete", "Update complete, restarting application...");
          quit();
        }
      }
    },
    channelBucketUrl: async () => {
      await Updater.getLocallocalInfo();
      return localInfo.baseUrl;
    },
    appDataFolder: async () => {
      await Updater.getLocallocalInfo();
      const appDataFolder = join2(getAppDataDir2(), localInfo.identifier, localInfo.channel);
      return appDataFolder;
    },
    localInfo: {
      version: async () => {
        return (await Updater.getLocallocalInfo()).version;
      },
      hash: async () => {
        return (await Updater.getLocallocalInfo()).hash;
      },
      channel: async () => {
        return (await Updater.getLocallocalInfo()).channel;
      },
      baseUrl: async () => {
        return (await Updater.getLocallocalInfo()).baseUrl;
      }
    },
    getLocallocalInfo: async () => {
      if (localInfo) {
        return localInfo;
      }
      try {
        const resourcesDir = "Resources";
        localInfo = await Bun.file(`../${resourcesDir}/version.json`).json();
        return localInfo;
      } catch (error) {
        console.error("Failed to read version.json", error);
        throw error;
      }
    }
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/BuildConfig.ts
var buildConfig = null, BuildConfig;
var init_BuildConfig = __esm(() => {
  BuildConfig = {
    get: async () => {
      if (buildConfig) {
        return buildConfig;
      }
      try {
        const resourcesDir = "Resources";
        buildConfig = await Bun.file(`../${resourcesDir}/build.json`).json();
        return buildConfig;
      } catch (error) {
        buildConfig = {
          defaultRenderer: "native",
          availableRenderers: ["native"]
        };
        return buildConfig;
      }
    },
    getCached: () => buildConfig
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/Socket.ts
var exports_Socket = {};
__export(exports_Socket, {
  socketMap: () => socketMap,
  sendMessageToWebviewViaSocket: () => sendMessageToWebviewViaSocket,
  rpcServer: () => rpcServer,
  rpcPort: () => rpcPort
});
import { createCipheriv, createDecipheriv, randomBytes } from "crypto";
function base64ToUint8Array(base64) {
  {
    return new Uint8Array(atob(base64).split("").map((char) => char.charCodeAt(0)));
  }
}
function encrypt(secretKey, text) {
  const iv = new Uint8Array(randomBytes(12));
  const cipher = createCipheriv("aes-256-gcm", secretKey, iv);
  const encrypted = Buffer.concat([
    new Uint8Array(cipher.update(text, "utf8")),
    new Uint8Array(cipher.final())
  ]).toString("base64");
  const tag = cipher.getAuthTag().toString("base64");
  return { encrypted, iv: Buffer.from(iv).toString("base64"), tag };
}
function decrypt(secretKey, encryptedData, iv, tag) {
  const decipher = createDecipheriv("aes-256-gcm", secretKey, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    new Uint8Array(decipher.update(encryptedData)),
    new Uint8Array(decipher.final())
  ]);
  return decrypted.toString("utf8");
}
var socketMap, startRPCServer = () => {
  const startPort = 50000;
  const endPort = 65535;
  const payloadLimit = 1024 * 1024 * 500;
  let port = startPort;
  let server = null;
  while (port <= endPort) {
    try {
      server = Bun.serve({
        port,
        fetch(req, server2) {
          const url = new URL(req.url);
          if (url.pathname === "/socket") {
            const webviewIdString = url.searchParams.get("webviewId");
            if (!webviewIdString) {
              return new Response("Missing webviewId", { status: 400 });
            }
            const webviewId = parseInt(webviewIdString, 10);
            const success = server2.upgrade(req, { data: { webviewId } });
            return success ? undefined : new Response("Upgrade failed", { status: 500 });
          }
          console.log("unhandled RPC Server request", req.url);
        },
        websocket: {
          idleTimeout: 960,
          maxPayloadLength: payloadLimit,
          backpressureLimit: payloadLimit * 2,
          open(ws) {
            if (!ws?.data) {
              return;
            }
            const { webviewId } = ws.data;
            if (!socketMap[webviewId]) {
              socketMap[webviewId] = { socket: ws, queue: [] };
            } else {
              socketMap[webviewId].socket = ws;
            }
          },
          close(ws, _code, _reason) {
            if (!ws?.data) {
              return;
            }
            const { webviewId } = ws.data;
            if (socketMap[webviewId]) {
              socketMap[webviewId].socket = null;
            }
          },
          message(ws, message) {
            if (!ws?.data) {
              return;
            }
            const { webviewId } = ws.data;
            const browserView = BrowserView.getById(webviewId);
            if (!browserView) {
              return;
            }
            if (browserView.rpcHandler) {
              if (typeof message === "string") {
                try {
                  const encryptedPacket = JSON.parse(message);
                  const decrypted = decrypt(browserView.secretKey, base64ToUint8Array(encryptedPacket.encryptedData), base64ToUint8Array(encryptedPacket.iv), base64ToUint8Array(encryptedPacket.tag));
                  browserView.rpcHandler(JSON.parse(decrypted));
                } catch (error) {
                  console.log("Error handling message:", error);
                }
              } else if (message instanceof ArrayBuffer) {
                console.log("TODO: Received ArrayBuffer message:", message);
              }
            }
          }
        }
      });
      break;
    } catch (error) {
      if (error.code === "EADDRINUSE") {
        console.log(`Port ${port} in use, trying next port...`);
        port++;
      } else {
        throw error;
      }
    }
  }
  return { rpcServer: server, rpcPort: port };
}, rpcServer, rpcPort, sendMessageToWebviewViaSocket = (webviewId, message) => {
  const rpc = socketMap[webviewId];
  const browserView = BrowserView.getById(webviewId);
  if (!browserView)
    return false;
  if (rpc?.socket?.readyState === WebSocket.OPEN) {
    try {
      const unencryptedString = JSON.stringify(message);
      const encrypted = encrypt(browserView.secretKey, unencryptedString);
      const encryptedPacket = {
        encryptedData: encrypted.encrypted,
        iv: encrypted.iv,
        tag: encrypted.tag
      };
      const encryptedPacketString = JSON.stringify(encryptedPacket);
      rpc.socket.send(encryptedPacketString);
      return true;
    } catch (error) {
      console.error("Error sending message to webview via socket:", error);
    }
  }
  return false;
};
var init_Socket = __esm(async () => {
  await init_BrowserView();
  socketMap = {};
  ({ rpcServer, rpcPort } = startRPCServer());
  console.log("Server started at", rpcServer?.url.origin);
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/BrowserView.ts
import { randomBytes as randomBytes2 } from "crypto";

class BrowserView {
  id = nextWebviewId++;
  ptr;
  hostWebviewId;
  windowId;
  renderer;
  url = null;
  html = null;
  preload = null;
  partition = null;
  autoResize = true;
  frame = {
    x: 0,
    y: 0,
    width: 800,
    height: 600
  };
  pipePrefix;
  inStream;
  outStream;
  secretKey;
  rpc;
  rpcHandler;
  navigationRules = null;
  sandbox = false;
  startTransparent = false;
  startPassthrough = false;
  constructor(options = defaultOptions) {
    this.url = options.url || defaultOptions.url || null;
    this.html = options.html || defaultOptions.html || null;
    this.preload = options.preload || defaultOptions.preload || null;
    this.frame = {
      x: options.frame?.x ?? defaultOptions.frame.x,
      y: options.frame?.y ?? defaultOptions.frame.y,
      width: options.frame?.width ?? defaultOptions.frame.width,
      height: options.frame?.height ?? defaultOptions.frame.height
    };
    this.rpc = options.rpc;
    this.secretKey = new Uint8Array(randomBytes2(32));
    this.partition = options.partition || null;
    this.pipePrefix = `/private/tmp/electrobun_ipc_pipe_${hash}_${randomId}_${this.id}`;
    this.hostWebviewId = options.hostWebviewId;
    this.windowId = options.windowId ?? 0;
    this.autoResize = options.autoResize === false ? false : true;
    this.navigationRules = options.navigationRules || null;
    this.renderer = options.renderer ?? defaultOptions.renderer ?? "native";
    this.sandbox = options.sandbox ?? false;
    this.startTransparent = options.startTransparent ?? false;
    this.startPassthrough = options.startPassthrough ?? false;
    BrowserViewMap[this.id] = this;
    this.ptr = this.init();
    if (this.html) {
      console.log(`DEBUG: BrowserView constructor triggering loadHTML for webview ${this.id}`);
      setTimeout(() => {
        console.log(`DEBUG: BrowserView delayed loadHTML for webview ${this.id}`);
        this.loadHTML(this.html);
      }, 100);
    } else {
      console.log(`DEBUG: BrowserView constructor - no HTML provided for webview ${this.id}`);
    }
  }
  init() {
    this.createStreams();
    return ffi.request.createWebview({
      id: this.id,
      windowId: this.windowId,
      renderer: this.renderer,
      rpcPort,
      secretKey: this.secretKey.toString(),
      hostWebviewId: this.hostWebviewId || null,
      pipePrefix: this.pipePrefix,
      partition: this.partition,
      url: this.html ? null : this.url,
      html: this.html,
      preload: this.preload,
      frame: {
        width: this.frame.width,
        height: this.frame.height,
        x: this.frame.x,
        y: this.frame.y
      },
      autoResize: this.autoResize,
      navigationRules: this.navigationRules,
      sandbox: this.sandbox,
      startTransparent: this.startTransparent,
      startPassthrough: this.startPassthrough
    });
  }
  createStreams() {
    if (!this.rpc) {
      this.rpc = BrowserView.defineRPC({
        handlers: { requests: {}, messages: {} }
      });
    }
    this.rpc.setTransport(this.createTransport());
  }
  sendMessageToWebviewViaExecute(jsonMessage) {
    const stringifiedMessage = typeof jsonMessage === "string" ? jsonMessage : JSON.stringify(jsonMessage);
    const wrappedMessage = `window.__electrobun.receiveMessageFromBun(${stringifiedMessage})`;
    this.executeJavascript(wrappedMessage);
  }
  sendInternalMessageViaExecute(jsonMessage) {
    const stringifiedMessage = typeof jsonMessage === "string" ? jsonMessage : JSON.stringify(jsonMessage);
    const wrappedMessage = `window.__electrobun.receiveInternalMessageFromBun(${stringifiedMessage})`;
    this.executeJavascript(wrappedMessage);
  }
  executeJavascript(js) {
    ffi.request.evaluateJavascriptWithNoCompletion({ id: this.id, js });
  }
  loadURL(url) {
    console.log(`DEBUG: loadURL called for webview ${this.id}: ${url}`);
    this.url = url;
    native.symbols.loadURLInWebView(this.ptr, toCString(this.url));
  }
  loadHTML(html) {
    this.html = html;
    console.log(`DEBUG: Setting HTML content for webview ${this.id}:`, html.substring(0, 50) + "...");
    if (this.renderer === "cef") {
      native.symbols.setWebviewHTMLContent(this.id, toCString(html));
      this.loadURL("views://internal/index.html");
    } else {
      native.symbols.loadHTMLInWebView(this.ptr, toCString(html));
    }
  }
  setNavigationRules(rules) {
    this.navigationRules = JSON.stringify(rules);
    const rulesJson = JSON.stringify(rules);
    native.symbols.setWebviewNavigationRules(this.ptr, toCString(rulesJson));
  }
  findInPage(searchText, options) {
    const forward = options?.forward ?? true;
    const matchCase = options?.matchCase ?? false;
    native.symbols.webviewFindInPage(this.ptr, toCString(searchText), forward, matchCase);
  }
  stopFindInPage() {
    native.symbols.webviewStopFind(this.ptr);
  }
  openDevTools() {
    native.symbols.webviewOpenDevTools(this.ptr);
  }
  closeDevTools() {
    native.symbols.webviewCloseDevTools(this.ptr);
  }
  toggleDevTools() {
    native.symbols.webviewToggleDevTools(this.ptr);
  }
  on(name, handler) {
    const specificName = `${name}-${this.id}`;
    eventEmitter_default.on(specificName, handler);
  }
  createTransport = () => {
    const that = this;
    return {
      send(message) {
        const sentOverSocket = sendMessageToWebviewViaSocket(that.id, message);
        if (!sentOverSocket) {
          try {
            const messageString = JSON.stringify(message);
            that.sendMessageToWebviewViaExecute(messageString);
          } catch (error) {
            console.error("bun: failed to serialize message to webview", error);
          }
        }
      },
      registerHandler(handler) {
        that.rpcHandler = handler;
      }
    };
  };
  remove() {
    native.symbols.webviewRemove(this.ptr);
    delete BrowserViewMap[this.id];
  }
  static getById(id) {
    return BrowserViewMap[id];
  }
  static getAll() {
    return Object.values(BrowserViewMap);
  }
  static defineRPC(config) {
    return defineElectrobunRPC("bun", config);
  }
}
var BrowserViewMap, nextWebviewId = 1, hash, buildConfig2, defaultOptions, randomId;
var init_BrowserView = __esm(async () => {
  init_eventEmitter();
  init_BuildConfig();
  await __promiseAll([
    init_native(),
    init_Updater(),
    init_Socket()
  ]);
  BrowserViewMap = {};
  hash = await Updater.localInfo.hash();
  buildConfig2 = await BuildConfig.get();
  defaultOptions = {
    url: null,
    html: null,
    preload: null,
    renderer: buildConfig2.defaultRenderer,
    frame: {
      x: 0,
      y: 0,
      width: 800,
      height: 600
    }
  };
  randomId = Math.random().toString(36).substring(7);
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/Paths.ts
var exports_Paths = {};
__export(exports_Paths, {
  VIEWS_FOLDER: () => VIEWS_FOLDER
});
import { resolve as resolve2 } from "path";
var RESOURCES_FOLDER, VIEWS_FOLDER;
var init_Paths = __esm(() => {
  RESOURCES_FOLDER = resolve2("../Resources/");
  VIEWS_FOLDER = resolve2(RESOURCES_FOLDER, "app/views");
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/Tray.ts
import { join as join3 } from "path";

class Tray {
  id = nextTrayId++;
  ptr = null;
  constructor({
    title = "",
    image = "",
    template = true,
    width = 16,
    height = 16
  } = {}) {
    try {
      this.ptr = ffi.request.createTray({
        id: this.id,
        title,
        image: this.resolveImagePath(image),
        template,
        width,
        height
      });
    } catch (error) {
      console.warn("Tray creation failed:", error);
      console.warn("System tray functionality may not be available on this platform");
      this.ptr = null;
    }
    TrayMap[this.id] = this;
  }
  resolveImagePath(imgPath) {
    if (imgPath.startsWith("views://")) {
      return join3(VIEWS_FOLDER, imgPath.replace("views://", ""));
    } else {
      return imgPath;
    }
  }
  setTitle(title) {
    if (!this.ptr)
      return;
    ffi.request.setTrayTitle({ id: this.id, title });
  }
  setImage(imgPath) {
    if (!this.ptr)
      return;
    ffi.request.setTrayImage({
      id: this.id,
      image: this.resolveImagePath(imgPath)
    });
  }
  setMenu(menu) {
    if (!this.ptr)
      return;
    const menuWithDefaults = menuConfigWithDefaults(menu);
    ffi.request.setTrayMenu({
      id: this.id,
      menuConfig: JSON.stringify(menuWithDefaults)
    });
  }
  on(name, handler) {
    const specificName = `${name}-${this.id}`;
    eventEmitter_default.on(specificName, handler);
  }
  remove() {
    console.log("Tray.remove() called for id:", this.id);
    if (this.ptr) {
      ffi.request.removeTray({ id: this.id });
    }
    delete TrayMap[this.id];
    console.log("Tray removed from TrayMap");
  }
  static getById(id) {
    return TrayMap[id];
  }
  static getAll() {
    return Object.values(TrayMap);
  }
  static removeById(id) {
    const tray = TrayMap[id];
    if (tray) {
      tray.remove();
    }
  }
}
var nextTrayId = 1, TrayMap, menuConfigWithDefaults = (menu) => {
  return menu.map((item) => {
    if (item.type === "divider" || item.type === "separator") {
      return { type: "divider" };
    } else {
      const menuItem = item;
      const actionWithDataId = ffi.internal.serializeMenuAction(menuItem.action || "", menuItem.data);
      return {
        label: menuItem.label || "",
        type: menuItem.type || "normal",
        action: actionWithDataId,
        enabled: menuItem.enabled === false ? false : true,
        checked: Boolean(menuItem.checked),
        hidden: Boolean(menuItem.hidden),
        tooltip: menuItem.tooltip || undefined,
        ...menuItem.submenu ? { submenu: menuConfigWithDefaults(menuItem.submenu) } : {}
      };
    }
  });
};
var init_Tray = __esm(async () => {
  init_eventEmitter();
  init_Paths();
  await init_native();
  TrayMap = {};
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/preload/.generated/compiled.ts
var preloadScript = `(() => {
  // src/bun/preload/encryption.ts
  function base64ToUint8Array(base64) {
    return new Uint8Array(atob(base64).split("").map((char) => char.charCodeAt(0)));
  }
  function uint8ArrayToBase64(uint8Array) {
    let binary = "";
    for (let i = 0;i < uint8Array.length; i++) {
      binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
  }
  async function generateKeyFromBytes(rawKey) {
    return await window.crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  }
  async function initEncryption() {
    const secretKey = await generateKeyFromBytes(new Uint8Array(window.__electrobunSecretKeyBytes));
    const encryptString = async (plaintext) => {
      const encoder = new TextEncoder;
      const encodedText = encoder.encode(plaintext);
      const iv = window.crypto.getRandomValues(new Uint8Array(12));
      const encryptedBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, secretKey, encodedText);
      const encryptedData = new Uint8Array(encryptedBuffer.slice(0, -16));
      const tag = new Uint8Array(encryptedBuffer.slice(-16));
      return {
        encryptedData: uint8ArrayToBase64(encryptedData),
        iv: uint8ArrayToBase64(iv),
        tag: uint8ArrayToBase64(tag)
      };
    };
    const decryptString = async (encryptedDataB64, ivB64, tagB64) => {
      const encryptedData = base64ToUint8Array(encryptedDataB64);
      const iv = base64ToUint8Array(ivB64);
      const tag = base64ToUint8Array(tagB64);
      const combinedData = new Uint8Array(encryptedData.length + tag.length);
      combinedData.set(encryptedData);
      combinedData.set(tag, encryptedData.length);
      const decryptedBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, secretKey, combinedData);
      const decoder = new TextDecoder;
      return decoder.decode(decryptedBuffer);
    };
    window.__electrobun_encrypt = encryptString;
    window.__electrobun_decrypt = decryptString;
  }

  // src/bun/preload/internalRpc.ts
  var pendingRequests = {};
  var requestId = 0;
  var isProcessingQueue = false;
  var sendQueue = [];
  function processQueue() {
    if (isProcessingQueue) {
      setTimeout(processQueue);
      return;
    }
    if (sendQueue.length === 0)
      return;
    isProcessingQueue = true;
    const batch = JSON.stringify(sendQueue);
    sendQueue.length = 0;
    window.__electrobunInternalBridge?.postMessage(batch);
    setTimeout(() => {
      isProcessingQueue = false;
    }, 2);
  }
  function send(type, payload) {
    sendQueue.push(JSON.stringify({ type: "message", id: type, payload }));
    processQueue();
  }
  function request(type, payload) {
    return new Promise((resolve, reject) => {
      const id = \`req_\${++requestId}_\${Date.now()}\`;
      pendingRequests[id] = { resolve, reject };
      sendQueue.push(JSON.stringify({
        type: "request",
        method: type,
        id,
        params: payload,
        hostWebviewId: window.__electrobunWebviewId
      }));
      processQueue();
      setTimeout(() => {
        if (pendingRequests[id]) {
          delete pendingRequests[id];
          reject(new Error(\`Request timeout: \${type}\`));
        }
      }, 1e4);
    });
  }
  function handleResponse(msg) {
    if (msg && msg.type === "response" && msg.id) {
      const pending = pendingRequests[msg.id];
      if (pending) {
        delete pendingRequests[msg.id];
        if (msg.success)
          pending.resolve(msg.payload);
        else
          pending.reject(msg.payload);
      }
    }
  }

  // src/bun/preload/dragRegions.ts
  function isAppRegionDrag(e) {
    const target = e.target;
    if (!target || !target.closest)
      return false;
    const draggableByStyle = target.closest('[style*="app-region"][style*="drag"]');
    const draggableByClass = target.closest(".electrobun-webkit-app-region-drag");
    return !!(draggableByStyle || draggableByClass);
  }
  function initDragRegions() {
    document.addEventListener("mousedown", (e) => {
      if (isAppRegionDrag(e)) {
        send("startWindowMove", { id: window.__electrobunWindowId });
      }
    });
    document.addEventListener("mouseup", (e) => {
      if (isAppRegionDrag(e)) {
        send("stopWindowMove", { id: window.__electrobunWindowId });
      }
    });
  }

  // src/bun/preload/webviewTag.ts
  var webviewRegistry = {};

  class ElectrobunWebviewTag extends HTMLElement {
    webviewId = null;
    maskSelectors = new Set;
    lastRect = { x: 0, y: 0, width: 0, height: 0 };
    resizeObserver = null;
    positionCheckLoop = null;
    transparent = false;
    passthroughEnabled = false;
    hidden = false;
    sandboxed = false;
    _eventListeners = {};
    constructor() {
      super();
    }
    connectedCallback() {
      requestAnimationFrame(() => this.initWebview());
    }
    disconnectedCallback() {
      if (this.webviewId !== null) {
        send("webviewTagRemove", { id: this.webviewId });
        delete webviewRegistry[this.webviewId];
      }
      if (this.resizeObserver)
        this.resizeObserver.disconnect();
      if (this.positionCheckLoop)
        clearInterval(this.positionCheckLoop);
    }
    async initWebview() {
      const rect = this.getBoundingClientRect();
      this.lastRect = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
      const url = this.getAttribute("src");
      const html = this.getAttribute("html");
      const preload = this.getAttribute("preload");
      const partition = this.getAttribute("partition");
      const renderer = this.getAttribute("renderer") || "native";
      const masks = this.getAttribute("masks");
      const sandbox = this.hasAttribute("sandbox");
      this.sandboxed = sandbox;
      const transparent = this.hasAttribute("transparent");
      const passthrough = this.hasAttribute("passthrough");
      this.transparent = transparent;
      this.passthroughEnabled = passthrough;
      if (transparent)
        this.style.opacity = "0";
      if (passthrough)
        this.style.pointerEvents = "none";
      if (masks) {
        masks.split(",").forEach((s) => this.maskSelectors.add(s.trim()));
      }
      try {
        const webviewId = await request("webviewTagInit", {
          hostWebviewId: window.__electrobunWebviewId,
          windowId: window.__electrobunWindowId,
          renderer,
          url,
          html,
          preload,
          partition,
          frame: {
            width: rect.width,
            height: rect.height,
            x: rect.x,
            y: rect.y
          },
          navigationRules: null,
          sandbox,
          transparent,
          passthrough
        });
        this.webviewId = webviewId;
        this.id = \`electrobun-webview-\${webviewId}\`;
        webviewRegistry[webviewId] = this;
        this.setupObservers();
        this.syncDimensions(true);
        requestAnimationFrame(() => {
          Object.values(webviewRegistry).forEach((webview) => {
            if (webview !== this && webview.webviewId !== null) {
              webview.syncDimensions(true);
            }
          });
        });
      } catch (err) {
        console.error("Failed to init webview:", err);
      }
    }
    setupObservers() {
      this.resizeObserver = new ResizeObserver(() => this.syncDimensions());
      this.resizeObserver.observe(this);
      this.positionCheckLoop = setInterval(() => this.syncDimensions(), 100);
    }
    syncDimensions(force = false) {
      if (this.webviewId === null)
        return;
      const rect = this.getBoundingClientRect();
      const newRect = {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
      if (newRect.width === 0 && newRect.height === 0) {
        return;
      }
      if (!force && newRect.x === this.lastRect.x && newRect.y === this.lastRect.y && newRect.width === this.lastRect.width && newRect.height === this.lastRect.height) {
        return;
      }
      this.lastRect = newRect;
      const masks = [];
      this.maskSelectors.forEach((selector) => {
        try {
          document.querySelectorAll(selector).forEach((el) => {
            const mr = el.getBoundingClientRect();
            masks.push({
              x: mr.x - rect.x,
              y: mr.y - rect.y,
              width: mr.width,
              height: mr.height
            });
          });
        } catch (_e) {}
      });
      send("webviewTagResize", {
        id: this.webviewId,
        frame: newRect,
        masks: JSON.stringify(masks)
      });
    }
    loadURL(url) {
      if (this.webviewId === null)
        return;
      this.setAttribute("src", url);
      send("webviewTagUpdateSrc", { id: this.webviewId, url });
    }
    loadHTML(html) {
      if (this.webviewId === null)
        return;
      send("webviewTagUpdateHtml", { id: this.webviewId, html });
    }
    reload() {
      if (this.webviewId !== null)
        send("webviewTagReload", { id: this.webviewId });
    }
    goBack() {
      if (this.webviewId !== null)
        send("webviewTagGoBack", { id: this.webviewId });
    }
    goForward() {
      if (this.webviewId !== null)
        send("webviewTagGoForward", { id: this.webviewId });
    }
    async canGoBack() {
      if (this.webviewId === null)
        return false;
      return await request("webviewTagCanGoBack", {
        id: this.webviewId
      });
    }
    async canGoForward() {
      if (this.webviewId === null)
        return false;
      return await request("webviewTagCanGoForward", {
        id: this.webviewId
      });
    }
    toggleTransparent(value) {
      if (this.webviewId === null)
        return;
      this.transparent = value !== undefined ? value : !this.transparent;
      this.style.opacity = this.transparent ? "0" : "";
      send("webviewTagSetTransparent", {
        id: this.webviewId,
        transparent: this.transparent
      });
    }
    togglePassthrough(value) {
      if (this.webviewId === null)
        return;
      this.passthroughEnabled = value !== undefined ? value : !this.passthroughEnabled;
      this.style.pointerEvents = this.passthroughEnabled ? "none" : "";
      send("webviewTagSetPassthrough", {
        id: this.webviewId,
        enablePassthrough: this.passthroughEnabled
      });
    }
    toggleHidden(value) {
      if (this.webviewId === null)
        return;
      this.hidden = value !== undefined ? value : !this.hidden;
      send("webviewTagSetHidden", { id: this.webviewId, hidden: this.hidden });
    }
    addMaskSelector(selector) {
      this.maskSelectors.add(selector);
      this.syncDimensions(true);
    }
    removeMaskSelector(selector) {
      this.maskSelectors.delete(selector);
      this.syncDimensions(true);
    }
    setNavigationRules(rules) {
      if (this.webviewId !== null) {
        send("webviewTagSetNavigationRules", { id: this.webviewId, rules });
      }
    }
    findInPage(searchText, options) {
      if (this.webviewId === null)
        return;
      const forward = options?.forward !== false;
      const matchCase = options?.matchCase || false;
      send("webviewTagFindInPage", {
        id: this.webviewId,
        searchText,
        forward,
        matchCase
      });
    }
    stopFindInPage() {
      if (this.webviewId !== null)
        send("webviewTagStopFind", { id: this.webviewId });
    }
    openDevTools() {
      if (this.webviewId !== null)
        send("webviewTagOpenDevTools", { id: this.webviewId });
    }
    closeDevTools() {
      if (this.webviewId !== null)
        send("webviewTagCloseDevTools", { id: this.webviewId });
    }
    toggleDevTools() {
      if (this.webviewId !== null)
        send("webviewTagToggleDevTools", { id: this.webviewId });
    }
    on(event, listener) {
      if (!this._eventListeners[event])
        this._eventListeners[event] = [];
      this._eventListeners[event].push(listener);
    }
    off(event, listener) {
      if (!this._eventListeners[event])
        return;
      const idx = this._eventListeners[event].indexOf(listener);
      if (idx !== -1)
        this._eventListeners[event].splice(idx, 1);
    }
    emit(event, detail) {
      const listeners = this._eventListeners[event];
      if (listeners) {
        const customEvent = new CustomEvent(event, { detail });
        listeners.forEach((fn) => fn(customEvent));
      }
    }
    get src() {
      return this.getAttribute("src");
    }
    set src(value) {
      if (value) {
        this.setAttribute("src", value);
        if (this.webviewId !== null)
          this.loadURL(value);
      } else {
        this.removeAttribute("src");
      }
    }
    get html() {
      return this.getAttribute("html");
    }
    set html(value) {
      if (value) {
        this.setAttribute("html", value);
        if (this.webviewId !== null)
          this.loadHTML(value);
      } else {
        this.removeAttribute("html");
      }
    }
    get preload() {
      return this.getAttribute("preload");
    }
    set preload(value) {
      if (value)
        this.setAttribute("preload", value);
      else
        this.removeAttribute("preload");
    }
    get renderer() {
      return this.getAttribute("renderer") || "native";
    }
    set renderer(value) {
      this.setAttribute("renderer", value);
    }
    get sandbox() {
      return this.sandboxed;
    }
  }
  function initWebviewTag() {
    if (!customElements.get("electrobun-webview")) {
      customElements.define("electrobun-webview", ElectrobunWebviewTag);
    }
    const injectStyles = () => {
      const style = document.createElement("style");
      style.textContent = \`
electrobun-webview {
	display: block;
	width: 800px;
	height: 300px;
	background: #fff;
	background-repeat: no-repeat !important;
	overflow: hidden;
}
\`;
      if (document.head?.firstChild) {
        document.head.insertBefore(style, document.head.firstChild);
      } else if (document.head) {
        document.head.appendChild(style);
      }
    };
    if (document.head) {
      injectStyles();
    } else {
      document.addEventListener("DOMContentLoaded", injectStyles);
    }
  }

  // src/bun/preload/events.ts
  function emitWebviewEvent(eventName, detail) {
    setTimeout(() => {
      const bridge = window.__electrobunEventBridge || window.__electrobunInternalBridge;
      bridge?.postMessage(JSON.stringify({
        id: "webviewEvent",
        type: "message",
        payload: {
          id: window.__electrobunWebviewId,
          eventName,
          detail
        }
      }));
    });
  }
  function initLifecycleEvents() {
    window.addEventListener("load", () => {
      if (window === window.top) {
        emitWebviewEvent("dom-ready", document.location.href);
      }
    });
    window.addEventListener("popstate", () => {
      emitWebviewEvent("did-navigate-in-page", window.location.href);
    });
    window.addEventListener("hashchange", () => {
      emitWebviewEvent("did-navigate-in-page", window.location.href);
    });
  }
  var cmdKeyHeld = false;
  var cmdKeyTimestamp = 0;
  var CMD_KEY_THRESHOLD_MS = 500;
  function isCmdHeld() {
    if (cmdKeyHeld)
      return true;
    return Date.now() - cmdKeyTimestamp < CMD_KEY_THRESHOLD_MS && cmdKeyTimestamp > 0;
  }
  function initCmdClickHandling() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Meta" || event.metaKey) {
        cmdKeyHeld = true;
        cmdKeyTimestamp = Date.now();
      }
    }, true);
    window.addEventListener("keyup", (event) => {
      if (event.key === "Meta") {
        cmdKeyHeld = false;
        cmdKeyTimestamp = Date.now();
      }
    }, true);
    window.addEventListener("blur", () => {
      cmdKeyHeld = false;
    });
    window.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) {
        const anchor = event.target?.closest?.("a");
        if (anchor && anchor.href) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          emitWebviewEvent("new-window-open", JSON.stringify({
            url: anchor.href,
            isCmdClick: true,
            isSPANavigation: false
          }));
        }
      }
    }, true);
  }
  function initSPANavigationInterception() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function(state, title, url) {
      if (isCmdHeld() && url) {
        const resolvedUrl = new URL(String(url), window.location.href).href;
        emitWebviewEvent("new-window-open", JSON.stringify({
          url: resolvedUrl,
          isCmdClick: true,
          isSPANavigation: true
        }));
        return;
      }
      return originalPushState.apply(this, [state, title, url]);
    };
    history.replaceState = function(state, title, url) {
      if (isCmdHeld() && url) {
        const resolvedUrl = new URL(String(url), window.location.href).href;
        emitWebviewEvent("new-window-open", JSON.stringify({
          url: resolvedUrl,
          isCmdClick: true,
          isSPANavigation: true
        }));
        return;
      }
      return originalReplaceState.apply(this, [state, title, url]);
    };
  }
  function initOverscrollPrevention() {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode("html, body { overscroll-behavior: none; }"));
      document.head.appendChild(style);
    });
  }

  // src/bun/preload/index.ts
  initEncryption().catch((err) => console.error("Failed to initialize encryption:", err));
  var internalMessageHandler = (msg) => {
    handleResponse(msg);
  };
  if (!window.__electrobun) {
    window.__electrobun = {
      receiveInternalMessageFromBun: internalMessageHandler,
      receiveMessageFromBun: (msg) => {
        console.log("receiveMessageFromBun (no handler):", msg);
      }
    };
  } else {
    window.__electrobun.receiveInternalMessageFromBun = internalMessageHandler;
    window.__electrobun.receiveMessageFromBun = (msg) => {
      console.log("receiveMessageFromBun (no handler):", msg);
    };
  }
  window.__electrobunSendToHost = (message) => {
    emitWebviewEvent("host-message", JSON.stringify(message));
  };
  initLifecycleEvents();
  initCmdClickHandling();
  initSPANavigationInterception();
  initOverscrollPrevention();
  initDragRegions();
  initWebviewTag();
})();
`, preloadScriptSandboxed = `(() => {
  // src/bun/preload/events.ts
  function emitWebviewEvent(eventName, detail) {
    setTimeout(() => {
      const bridge = window.__electrobunEventBridge || window.__electrobunInternalBridge;
      bridge?.postMessage(JSON.stringify({
        id: "webviewEvent",
        type: "message",
        payload: {
          id: window.__electrobunWebviewId,
          eventName,
          detail
        }
      }));
    });
  }
  function initLifecycleEvents() {
    window.addEventListener("load", () => {
      if (window === window.top) {
        emitWebviewEvent("dom-ready", document.location.href);
      }
    });
    window.addEventListener("popstate", () => {
      emitWebviewEvent("did-navigate-in-page", window.location.href);
    });
    window.addEventListener("hashchange", () => {
      emitWebviewEvent("did-navigate-in-page", window.location.href);
    });
  }
  var cmdKeyHeld = false;
  var cmdKeyTimestamp = 0;
  var CMD_KEY_THRESHOLD_MS = 500;
  function isCmdHeld() {
    if (cmdKeyHeld)
      return true;
    return Date.now() - cmdKeyTimestamp < CMD_KEY_THRESHOLD_MS && cmdKeyTimestamp > 0;
  }
  function initCmdClickHandling() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Meta" || event.metaKey) {
        cmdKeyHeld = true;
        cmdKeyTimestamp = Date.now();
      }
    }, true);
    window.addEventListener("keyup", (event) => {
      if (event.key === "Meta") {
        cmdKeyHeld = false;
        cmdKeyTimestamp = Date.now();
      }
    }, true);
    window.addEventListener("blur", () => {
      cmdKeyHeld = false;
    });
    window.addEventListener("click", (event) => {
      if (event.metaKey || event.ctrlKey) {
        const anchor = event.target?.closest?.("a");
        if (anchor && anchor.href) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          emitWebviewEvent("new-window-open", JSON.stringify({
            url: anchor.href,
            isCmdClick: true,
            isSPANavigation: false
          }));
        }
      }
    }, true);
  }
  function initSPANavigationInterception() {
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    history.pushState = function(state, title, url) {
      if (isCmdHeld() && url) {
        const resolvedUrl = new URL(String(url), window.location.href).href;
        emitWebviewEvent("new-window-open", JSON.stringify({
          url: resolvedUrl,
          isCmdClick: true,
          isSPANavigation: true
        }));
        return;
      }
      return originalPushState.apply(this, [state, title, url]);
    };
    history.replaceState = function(state, title, url) {
      if (isCmdHeld() && url) {
        const resolvedUrl = new URL(String(url), window.location.href).href;
        emitWebviewEvent("new-window-open", JSON.stringify({
          url: resolvedUrl,
          isCmdClick: true,
          isSPANavigation: true
        }));
        return;
      }
      return originalReplaceState.apply(this, [state, title, url]);
    };
  }
  function initOverscrollPrevention() {
    document.addEventListener("DOMContentLoaded", () => {
      const style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode("html, body { overscroll-behavior: none; }"));
      document.head.appendChild(style);
    });
  }

  // src/bun/preload/index-sandboxed.ts
  initLifecycleEvents();
  initCmdClickHandling();
  initSPANavigationInterception();
  initOverscrollPrevention();
})();
`;

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/proc/native.ts
import { join as join4 } from "path";
import {
  dlopen,
  suffix,
  JSCallback,
  CString,
  ptr,
  FFIType,
  toArrayBuffer
} from "bun:ffi";
function storeMenuData(data) {
  const id = `menuData_${++menuDataCounter}`;
  menuDataRegistry.set(id, data);
  return id;
}
function getMenuData(id) {
  return menuDataRegistry.get(id);
}
function clearMenuData(id) {
  menuDataRegistry.delete(id);
}
function serializeMenuAction(action, data) {
  const dataId = storeMenuData(data);
  return `${ELECTROBUN_DELIMITER}${dataId}|${action}`;
}
function deserializeMenuAction(encodedAction) {
  let actualAction = encodedAction;
  let data = undefined;
  if (encodedAction.startsWith(ELECTROBUN_DELIMITER)) {
    const parts = encodedAction.split("|");
    if (parts.length >= 4) {
      const dataId = parts[2];
      actualAction = parts.slice(3).join("|");
      data = getMenuData(dataId);
      clearMenuData(dataId);
    }
  }
  return { action: actualAction, data };
}

class SessionCookies {
  partitionId;
  constructor(partitionId) {
    this.partitionId = partitionId;
  }
  get(filter) {
    const filterJson = JSON.stringify(filter || {});
    const result = native.symbols.sessionGetCookies(toCString(this.partitionId), toCString(filterJson));
    if (!result)
      return [];
    try {
      return JSON.parse(result.toString());
    } catch {
      return [];
    }
  }
  set(cookie) {
    const cookieJson = JSON.stringify(cookie);
    return native.symbols.sessionSetCookie(toCString(this.partitionId), toCString(cookieJson));
  }
  remove(url, name) {
    return native.symbols.sessionRemoveCookie(toCString(this.partitionId), toCString(url), toCString(name));
  }
  clear() {
    native.symbols.sessionClearCookies(toCString(this.partitionId));
  }
}

class SessionInstance {
  partition;
  cookies;
  constructor(partition) {
    this.partition = partition;
    this.cookies = new SessionCookies(partition);
  }
  clearStorageData(types = "all") {
    const typesArray = types === "all" ? ["all"] : types;
    native.symbols.sessionClearStorageData(toCString(this.partition), toCString(JSON.stringify(typesArray)));
  }
}
function toCString(jsString, addNullTerminator = true) {
  let appendWith = "";
  if (addNullTerminator && !jsString.endsWith("\x00")) {
    appendWith = "\x00";
  }
  const buff = Buffer.from(jsString + appendWith, "utf8");
  return ptr(buff);
}
var menuDataRegistry, menuDataCounter = 0, ELECTROBUN_DELIMITER = "|EB|", native, ffi, windowCloseCallback, windowMoveCallback, windowResizeCallback, windowFocusCallback, getMimeType, getHTMLForWebviewSync, urlOpenCallback, quitRequestedCallback, globalShortcutHandlers, globalShortcutCallback, GlobalShortcut, Screen, sessionCache, Session, webviewDecideNavigation, webviewEventHandler = (id, eventName, detail) => {
  const webview = BrowserView.getById(id);
  if (!webview) {
    console.error("[webviewEventHandler] No webview found for id:", id);
    return;
  }
  if (webview.hostWebviewId) {
    const hostWebview = BrowserView.getById(webview.hostWebviewId);
    if (!hostWebview) {
      console.error("[webviewEventHandler] No webview found for id:", id);
      return;
    }
    let js;
    if (eventName === "new-window-open" || eventName === "host-message") {
      js = `document.querySelector('#electrobun-webview-${id}').emit(${JSON.stringify(eventName)}, ${detail});`;
    } else {
      js = `document.querySelector('#electrobun-webview-${id}').emit(${JSON.stringify(eventName)}, ${JSON.stringify(detail)});`;
    }
    native.symbols.evaluateJavaScriptWithNoCompletion(hostWebview.ptr, toCString(js));
  }
  const eventMap = {
    "will-navigate": "willNavigate",
    "did-navigate": "didNavigate",
    "did-navigate-in-page": "didNavigateInPage",
    "did-commit-navigation": "didCommitNavigation",
    "dom-ready": "domReady",
    "new-window-open": "newWindowOpen",
    "host-message": "hostMessage",
    "download-started": "downloadStarted",
    "download-progress": "downloadProgress",
    "download-completed": "downloadCompleted",
    "download-failed": "downloadFailed",
    "load-started": "loadStarted",
    "load-committed": "loadCommitted",
    "load-finished": "loadFinished"
  };
  const mappedName = eventMap[eventName];
  const handler = mappedName ? eventEmitter_default.events.webview[mappedName] : undefined;
  if (!handler) {
    return { success: false };
  }
  let parsedDetail = detail;
  if (eventName === "new-window-open" || eventName === "host-message" || eventName === "download-started" || eventName === "download-progress" || eventName === "download-completed" || eventName === "download-failed") {
    try {
      parsedDetail = JSON.parse(detail);
    } catch (e) {
      console.error("[webviewEventHandler] Failed to parse JSON:", e);
      parsedDetail = detail;
    }
  }
  const event = handler({
    detail: parsedDetail
  });
  eventEmitter_default.emitEvent(event);
  eventEmitter_default.emitEvent(event, id);
}, webviewEventJSCallback, bunBridgePostmessageHandler, eventBridgeHandler, internalBridgeHandler, trayItemHandler, applicationMenuHandler, contextMenuHandler, internalRpcHandlers;
var init_native = __esm(async () => {
  init_eventEmitter();
  await __promiseAll([
    init_BrowserView(),
    init_Tray(),
    init_BrowserWindow()
  ]);
  menuDataRegistry = new Map;
  native = (() => {
    try {
      const nativeWrapperPath = join4(process.cwd(), `libNativeWrapper.${suffix}`);
      return dlopen(nativeWrapperPath, {
        createWindowWithFrameAndStyleFromWorker: {
          args: [
            FFIType.u32,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.u32,
            FFIType.cstring,
            FFIType.bool,
            FFIType.function,
            FFIType.function,
            FFIType.function,
            FFIType.function
          ],
          returns: FFIType.ptr
        },
        setWindowTitle: {
          args: [
            FFIType.ptr,
            FFIType.cstring
          ],
          returns: FFIType.void
        },
        showWindow: {
          args: [
            FFIType.ptr
          ],
          returns: FFIType.void
        },
        closeWindow: {
          args: [
            FFIType.ptr
          ],
          returns: FFIType.void
        },
        minimizeWindow: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        restoreWindow: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        isWindowMinimized: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        maximizeWindow: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        unmaximizeWindow: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        isWindowMaximized: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        setWindowFullScreen: {
          args: [FFIType.ptr, FFIType.bool],
          returns: FFIType.void
        },
        isWindowFullScreen: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        setWindowAlwaysOnTop: {
          args: [FFIType.ptr, FFIType.bool],
          returns: FFIType.void
        },
        isWindowAlwaysOnTop: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        setWindowPosition: {
          args: [FFIType.ptr, FFIType.f64, FFIType.f64],
          returns: FFIType.void
        },
        setWindowSize: {
          args: [FFIType.ptr, FFIType.f64, FFIType.f64],
          returns: FFIType.void
        },
        setWindowFrame: {
          args: [FFIType.ptr, FFIType.f64, FFIType.f64, FFIType.f64, FFIType.f64],
          returns: FFIType.void
        },
        getWindowFrame: {
          args: [FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr, FFIType.ptr],
          returns: FFIType.void
        },
        initWebview: {
          args: [
            FFIType.u32,
            FFIType.ptr,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.bool,
            FFIType.cstring,
            FFIType.function,
            FFIType.function,
            FFIType.function,
            FFIType.function,
            FFIType.function,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.bool,
            FFIType.bool
          ],
          returns: FFIType.ptr
        },
        setNextWebviewFlags: {
          args: [
            FFIType.bool,
            FFIType.bool
          ],
          returns: FFIType.void
        },
        webviewCanGoBack: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        webviewCanGoForward: {
          args: [FFIType.ptr],
          returns: FFIType.bool
        },
        resizeWebview: {
          args: [
            FFIType.ptr,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.f64,
            FFIType.cstring
          ],
          returns: FFIType.void
        },
        loadURLInWebView: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        loadHTMLInWebView: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        updatePreloadScriptToWebView: {
          args: [
            FFIType.ptr,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.bool
          ],
          returns: FFIType.void
        },
        webviewGoBack: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        webviewGoForward: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        webviewReload: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        webviewRemove: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        setWebviewHTMLContent: {
          args: [FFIType.u32, FFIType.cstring],
          returns: FFIType.void
        },
        startWindowMove: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        stopWindowMove: {
          args: [],
          returns: FFIType.void
        },
        webviewSetTransparent: {
          args: [FFIType.ptr, FFIType.bool],
          returns: FFIType.void
        },
        webviewSetPassthrough: {
          args: [FFIType.ptr, FFIType.bool],
          returns: FFIType.void
        },
        webviewSetHidden: {
          args: [FFIType.ptr, FFIType.bool],
          returns: FFIType.void
        },
        setWebviewNavigationRules: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        webviewFindInPage: {
          args: [FFIType.ptr, FFIType.cstring, FFIType.bool, FFIType.bool],
          returns: FFIType.void
        },
        webviewStopFind: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        evaluateJavaScriptWithNoCompletion: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        webviewOpenDevTools: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        webviewCloseDevTools: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        webviewToggleDevTools: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        createTray: {
          args: [
            FFIType.u32,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.bool,
            FFIType.u32,
            FFIType.u32,
            FFIType.function
          ],
          returns: FFIType.ptr
        },
        setTrayTitle: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        setTrayImage: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        setTrayMenu: {
          args: [FFIType.ptr, FFIType.cstring],
          returns: FFIType.void
        },
        removeTray: {
          args: [FFIType.ptr],
          returns: FFIType.void
        },
        setApplicationMenu: {
          args: [FFIType.cstring, FFIType.function],
          returns: FFIType.void
        },
        showContextMenu: {
          args: [FFIType.cstring, FFIType.function],
          returns: FFIType.void
        },
        moveToTrash: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        showItemInFolder: {
          args: [FFIType.cstring],
          returns: FFIType.void
        },
        openExternal: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        openPath: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        showNotification: {
          args: [
            FFIType.cstring,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.bool
          ],
          returns: FFIType.void
        },
        setGlobalShortcutCallback: {
          args: [FFIType.function],
          returns: FFIType.void
        },
        registerGlobalShortcut: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        unregisterGlobalShortcut: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        unregisterAllGlobalShortcuts: {
          args: [],
          returns: FFIType.void
        },
        isGlobalShortcutRegistered: {
          args: [FFIType.cstring],
          returns: FFIType.bool
        },
        getAllDisplays: {
          args: [],
          returns: FFIType.cstring
        },
        getPrimaryDisplay: {
          args: [],
          returns: FFIType.cstring
        },
        getCursorScreenPoint: {
          args: [],
          returns: FFIType.cstring
        },
        openFileDialog: {
          args: [
            FFIType.cstring,
            FFIType.cstring,
            FFIType.int,
            FFIType.int,
            FFIType.int
          ],
          returns: FFIType.cstring
        },
        showMessageBox: {
          args: [
            FFIType.cstring,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.cstring,
            FFIType.int,
            FFIType.int
          ],
          returns: FFIType.int
        },
        clipboardReadText: {
          args: [],
          returns: FFIType.cstring
        },
        clipboardWriteText: {
          args: [FFIType.cstring],
          returns: FFIType.void
        },
        clipboardReadImage: {
          args: [FFIType.ptr],
          returns: FFIType.ptr
        },
        clipboardWriteImage: {
          args: [FFIType.ptr, FFIType.u64],
          returns: FFIType.void
        },
        clipboardClear: {
          args: [],
          returns: FFIType.void
        },
        clipboardAvailableFormats: {
          args: [],
          returns: FFIType.cstring
        },
        sessionGetCookies: {
          args: [FFIType.cstring, FFIType.cstring],
          returns: FFIType.cstring
        },
        sessionSetCookie: {
          args: [FFIType.cstring, FFIType.cstring],
          returns: FFIType.bool
        },
        sessionRemoveCookie: {
          args: [FFIType.cstring, FFIType.cstring, FFIType.cstring],
          returns: FFIType.bool
        },
        sessionClearCookies: {
          args: [FFIType.cstring],
          returns: FFIType.void
        },
        sessionClearStorageData: {
          args: [FFIType.cstring, FFIType.cstring],
          returns: FFIType.void
        },
        setURLOpenHandler: {
          args: [FFIType.function],
          returns: FFIType.void
        },
        getWindowStyle: {
          args: [
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool,
            FFIType.bool
          ],
          returns: FFIType.u32
        },
        setJSUtils: {
          args: [
            FFIType.function,
            FFIType.function
          ],
          returns: FFIType.void
        },
        setWindowIcon: {
          args: [
            FFIType.ptr,
            FFIType.cstring
          ],
          returns: FFIType.void
        },
        killApp: {
          args: [],
          returns: FFIType.void
        },
        stopEventLoop: {
          args: [],
          returns: FFIType.void
        },
        waitForShutdownComplete: {
          args: [FFIType.i32],
          returns: FFIType.void
        },
        forceExit: {
          args: [FFIType.i32],
          returns: FFIType.void
        },
        setQuitRequestedHandler: {
          args: [FFIType.function],
          returns: FFIType.void
        },
        testFFI2: {
          args: [FFIType.function],
          returns: FFIType.void
        }
      });
    } catch (err) {
      console.log("FATAL Error opening native FFI:", err.message);
      console.log("This may be due to:");
      console.log("  - Missing libNativeWrapper.dll/so/dylib");
      console.log("  - Architecture mismatch (ARM64 vs x64)");
      console.log("  - Missing WebView2 or CEF dependencies");
      if (suffix === "so") {
        console.log("  - Missing system libraries (try: ldd ./libNativeWrapper.so)");
      }
      console.log("Check that the build process completed successfully for your architecture.");
      process.exit();
    }
  })();
  ffi = {
    request: {
      createWindow: (params) => {
        const {
          id,
          url: _url,
          title,
          frame: { x, y, width, height },
          styleMask: {
            Borderless,
            Titled,
            Closable,
            Miniaturizable,
            Resizable,
            UnifiedTitleAndToolbar,
            FullScreen,
            FullSizeContentView,
            UtilityWindow,
            DocModalWindow,
            NonactivatingPanel,
            HUDWindow
          },
          titleBarStyle,
          transparent
        } = params;
        const styleMask = native.symbols.getWindowStyle(Borderless, Titled, Closable, Miniaturizable, Resizable, UnifiedTitleAndToolbar, FullScreen, FullSizeContentView, UtilityWindow, DocModalWindow, NonactivatingPanel, HUDWindow);
        const windowPtr = native.symbols.createWindowWithFrameAndStyleFromWorker(id, x, y, width, height, styleMask, toCString(titleBarStyle), transparent, windowCloseCallback, windowMoveCallback, windowResizeCallback, windowFocusCallback);
        if (!windowPtr) {
          throw "Failed to create window";
        }
        native.symbols.setWindowTitle(windowPtr, toCString(title));
        native.symbols.showWindow(windowPtr);
        return windowPtr;
      },
      setTitle: (params) => {
        const { winId, title } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't add webview to window. window no longer exists`;
        }
        native.symbols.setWindowTitle(windowPtr, toCString(title));
      },
      closeWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't close window. Window no longer exists`;
        }
        native.symbols.closeWindow(windowPtr);
      },
      focusWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't focus window. Window no longer exists`;
        }
        native.symbols.showWindow(windowPtr);
      },
      minimizeWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't minimize window. Window no longer exists`;
        }
        native.symbols.minimizeWindow(windowPtr);
      },
      restoreWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't restore window. Window no longer exists`;
        }
        native.symbols.restoreWindow(windowPtr);
      },
      isWindowMinimized: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          return false;
        }
        return native.symbols.isWindowMinimized(windowPtr);
      },
      maximizeWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't maximize window. Window no longer exists`;
        }
        native.symbols.maximizeWindow(windowPtr);
      },
      unmaximizeWindow: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't unmaximize window. Window no longer exists`;
        }
        native.symbols.unmaximizeWindow(windowPtr);
      },
      isWindowMaximized: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          return false;
        }
        return native.symbols.isWindowMaximized(windowPtr);
      },
      setWindowFullScreen: (params) => {
        const { winId, fullScreen } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't set fullscreen. Window no longer exists`;
        }
        native.symbols.setWindowFullScreen(windowPtr, fullScreen);
      },
      isWindowFullScreen: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          return false;
        }
        return native.symbols.isWindowFullScreen(windowPtr);
      },
      setWindowAlwaysOnTop: (params) => {
        const { winId, alwaysOnTop } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't set always on top. Window no longer exists`;
        }
        native.symbols.setWindowAlwaysOnTop(windowPtr, alwaysOnTop);
      },
      isWindowAlwaysOnTop: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          return false;
        }
        return native.symbols.isWindowAlwaysOnTop(windowPtr);
      },
      setWindowPosition: (params) => {
        const { winId, x, y } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't set window position. Window no longer exists`;
        }
        native.symbols.setWindowPosition(windowPtr, x, y);
      },
      setWindowSize: (params) => {
        const { winId, width, height } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't set window size. Window no longer exists`;
        }
        native.symbols.setWindowSize(windowPtr, width, height);
      },
      setWindowFrame: (params) => {
        const { winId, x, y, width, height } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          throw `Can't set window frame. Window no longer exists`;
        }
        native.symbols.setWindowFrame(windowPtr, x, y, width, height);
      },
      getWindowFrame: (params) => {
        const { winId } = params;
        const windowPtr = BrowserWindow.getById(winId)?.ptr;
        if (!windowPtr) {
          return { x: 0, y: 0, width: 0, height: 0 };
        }
        const xBuf = new Float64Array(1);
        const yBuf = new Float64Array(1);
        const widthBuf = new Float64Array(1);
        const heightBuf = new Float64Array(1);
        native.symbols.getWindowFrame(windowPtr, ptr(xBuf), ptr(yBuf), ptr(widthBuf), ptr(heightBuf));
        return {
          x: xBuf[0],
          y: yBuf[0],
          width: widthBuf[0],
          height: heightBuf[0]
        };
      },
      createWebview: (params) => {
        const {
          id,
          windowId,
          renderer,
          rpcPort: rpcPort2,
          secretKey,
          url,
          partition,
          preload,
          frame: { x, y, width, height },
          autoResize,
          sandbox,
          startTransparent,
          startPassthrough
        } = params;
        const parentWindow = BrowserWindow.getById(windowId);
        const windowPtr = parentWindow?.ptr;
        const transparent = parentWindow?.transparent ?? false;
        if (!windowPtr) {
          throw `Can't add webview to window. window no longer exists`;
        }
        let dynamicPreload;
        let selectedPreloadScript;
        if (sandbox) {
          dynamicPreload = `
window.__electrobunWebviewId = ${id};
window.__electrobunWindowId = ${windowId};
window.__electrobunEventBridge = window.__electrobunEventBridge || window.webkit?.messageHandlers?.eventBridge || window.eventBridge || window.chrome?.webview?.hostObjects?.eventBridge;
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.webkit?.messageHandlers?.internalBridge || window.internalBridge || window.chrome?.webview?.hostObjects?.internalBridge;
`;
          selectedPreloadScript = preloadScriptSandboxed;
        } else {
          dynamicPreload = `
window.__electrobunWebviewId = ${id};
window.__electrobunWindowId = ${windowId};
window.__electrobunRpcSocketPort = ${rpcPort2};
window.__electrobunSecretKeyBytes = [${secretKey}];
window.__electrobunEventBridge = window.__electrobunEventBridge || window.webkit?.messageHandlers?.eventBridge || window.eventBridge || window.chrome?.webview?.hostObjects?.eventBridge;
window.__electrobunInternalBridge = window.__electrobunInternalBridge || window.webkit?.messageHandlers?.internalBridge || window.internalBridge || window.chrome?.webview?.hostObjects?.internalBridge;
window.__electrobunBunBridge = window.__electrobunBunBridge || window.webkit?.messageHandlers?.bunBridge || window.bunBridge || window.chrome?.webview?.hostObjects?.bunBridge;
`;
          selectedPreloadScript = preloadScript;
        }
        const electrobunPreload = dynamicPreload + selectedPreloadScript;
        const customPreload = preload;
        native.symbols.setNextWebviewFlags(startTransparent, startPassthrough);
        const webviewPtr = native.symbols.initWebview(id, windowPtr, toCString(renderer), toCString(url || ""), x, y, width, height, autoResize, toCString(partition || "persist:default"), webviewDecideNavigation, webviewEventJSCallback, eventBridgeHandler, bunBridgePostmessageHandler, internalBridgeHandler, toCString(electrobunPreload), toCString(customPreload || ""), transparent, sandbox);
        if (!webviewPtr) {
          throw "Failed to create webview";
        }
        return webviewPtr;
      },
      evaluateJavascriptWithNoCompletion: (params) => {
        const { id, js } = params;
        const webview = BrowserView.getById(id);
        if (!webview?.ptr) {
          return;
        }
        native.symbols.evaluateJavaScriptWithNoCompletion(webview.ptr, toCString(js));
      },
      createTray: (params) => {
        const { id, title, image, template, width, height } = params;
        const trayPtr = native.symbols.createTray(id, toCString(title), toCString(image), template, width, height, trayItemHandler);
        if (!trayPtr) {
          throw "Failed to create tray";
        }
        return trayPtr;
      },
      setTrayTitle: (params) => {
        const { id, title } = params;
        const tray = Tray.getById(id);
        if (!tray)
          return;
        native.symbols.setTrayTitle(tray.ptr, toCString(title));
      },
      setTrayImage: (params) => {
        const { id, image } = params;
        const tray = Tray.getById(id);
        if (!tray)
          return;
        native.symbols.setTrayImage(tray.ptr, toCString(image));
      },
      setTrayMenu: (params) => {
        const { id, menuConfig } = params;
        const tray = Tray.getById(id);
        if (!tray)
          return;
        native.symbols.setTrayMenu(tray.ptr, toCString(menuConfig));
      },
      removeTray: (params) => {
        const { id } = params;
        const tray = Tray.getById(id);
        if (!tray) {
          throw `Can't remove tray. Tray no longer exists`;
        }
        native.symbols.removeTray(tray.ptr);
      },
      setApplicationMenu: (params) => {
        const { menuConfig } = params;
        native.symbols.setApplicationMenu(toCString(menuConfig), applicationMenuHandler);
      },
      showContextMenu: (params) => {
        const { menuConfig } = params;
        native.symbols.showContextMenu(toCString(menuConfig), contextMenuHandler);
      },
      moveToTrash: (params) => {
        const { path } = params;
        return native.symbols.moveToTrash(toCString(path));
      },
      showItemInFolder: (params) => {
        const { path } = params;
        native.symbols.showItemInFolder(toCString(path));
      },
      openExternal: (params) => {
        const { url } = params;
        return native.symbols.openExternal(toCString(url));
      },
      openPath: (params) => {
        const { path } = params;
        return native.symbols.openPath(toCString(path));
      },
      showNotification: (params) => {
        const { title, body = "", subtitle = "", silent = false } = params;
        native.symbols.showNotification(toCString(title), toCString(body), toCString(subtitle), silent);
      },
      openFileDialog: (params) => {
        const {
          startingFolder,
          allowedFileTypes,
          canChooseFiles,
          canChooseDirectory,
          allowsMultipleSelection
        } = params;
        const filePath = native.symbols.openFileDialog(toCString(startingFolder), toCString(allowedFileTypes), canChooseFiles ? 1 : 0, canChooseDirectory ? 1 : 0, allowsMultipleSelection ? 1 : 0);
        return filePath.toString();
      },
      showMessageBox: (params) => {
        const {
          type = "info",
          title = "",
          message = "",
          detail = "",
          buttons = ["OK"],
          defaultId = 0,
          cancelId = -1
        } = params;
        const buttonsStr = buttons.join(",");
        return native.symbols.showMessageBox(toCString(type), toCString(title), toCString(message), toCString(detail), toCString(buttonsStr), defaultId, cancelId);
      },
      clipboardReadText: () => {
        const result = native.symbols.clipboardReadText();
        if (!result)
          return null;
        return result.toString();
      },
      clipboardWriteText: (params) => {
        native.symbols.clipboardWriteText(toCString(params.text));
      },
      clipboardReadImage: () => {
        const sizeBuffer = new BigUint64Array(1);
        const dataPtr = native.symbols.clipboardReadImage(ptr(sizeBuffer));
        if (!dataPtr)
          return null;
        const size = Number(sizeBuffer[0]);
        if (size === 0)
          return null;
        const result = new Uint8Array(size);
        const sourceView = new Uint8Array(toArrayBuffer(dataPtr, 0, size));
        result.set(sourceView);
        return result;
      },
      clipboardWriteImage: (params) => {
        const { pngData } = params;
        native.symbols.clipboardWriteImage(ptr(pngData), BigInt(pngData.length));
      },
      clipboardClear: () => {
        native.symbols.clipboardClear();
      },
      clipboardAvailableFormats: () => {
        const result = native.symbols.clipboardAvailableFormats();
        if (!result)
          return [];
        const formatsStr = result.toString();
        if (!formatsStr)
          return [];
        return formatsStr.split(",").filter((f) => f.length > 0);
      }
    },
    internal: {
      storeMenuData,
      getMenuData,
      clearMenuData,
      serializeMenuAction,
      deserializeMenuAction
    }
  };
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception in worker:", err);
    native.symbols.stopEventLoop();
    native.symbols.waitForShutdownComplete(5000);
    native.symbols.forceExit(1);
  });
  process.on("unhandledRejection", (reason, _promise) => {
    console.error("Unhandled rejection in worker:", reason);
  });
  process.on("SIGINT", () => {
    console.log("[electrobun] Received SIGINT, running quit sequence...");
    const { quit: quit2 } = (init_Utils(), __toCommonJS(exports_Utils));
    quit2();
  });
  process.on("SIGTERM", () => {
    console.log("[electrobun] Received SIGTERM, running quit sequence...");
    const { quit: quit2 } = (init_Utils(), __toCommonJS(exports_Utils));
    quit2();
  });
  windowCloseCallback = new JSCallback((id) => {
    const handler = eventEmitter_default.events.window.close;
    const event = handler({
      id
    });
    eventEmitter_default.emitEvent(event, id);
    eventEmitter_default.emitEvent(event);
  }, {
    args: ["u32"],
    returns: "void",
    threadsafe: true
  });
  windowMoveCallback = new JSCallback((id, x, y) => {
    const handler = eventEmitter_default.events.window.move;
    const event = handler({
      id,
      x,
      y
    });
    eventEmitter_default.emitEvent(event);
    eventEmitter_default.emitEvent(event, id);
  }, {
    args: ["u32", "f64", "f64"],
    returns: "void",
    threadsafe: true
  });
  windowResizeCallback = new JSCallback((id, x, y, width, height) => {
    const handler = eventEmitter_default.events.window.resize;
    const event = handler({
      id,
      x,
      y,
      width,
      height
    });
    eventEmitter_default.emitEvent(event);
    eventEmitter_default.emitEvent(event, id);
  }, {
    args: ["u32", "f64", "f64", "f64", "f64"],
    returns: "void",
    threadsafe: true
  });
  windowFocusCallback = new JSCallback((id) => {
    const handler = eventEmitter_default.events.window.focus;
    const event = handler({
      id
    });
    eventEmitter_default.emitEvent(event);
    eventEmitter_default.emitEvent(event, id);
  }, {
    args: ["u32"],
    returns: "void",
    threadsafe: true
  });
  getMimeType = new JSCallback((filePath) => {
    const _filePath = new CString(filePath).toString();
    const mimeType = Bun.file(_filePath).type;
    return toCString(mimeType.split(";")[0]);
  }, {
    args: [FFIType.cstring],
    returns: FFIType.cstring
  });
  getHTMLForWebviewSync = new JSCallback((webviewId) => {
    const webview = BrowserView.getById(webviewId);
    return toCString(webview?.html || "");
  }, {
    args: [FFIType.u32],
    returns: FFIType.cstring
  });
  native.symbols.setJSUtils(getMimeType, getHTMLForWebviewSync);
  urlOpenCallback = new JSCallback((urlPtr) => {
    const url = new CString(urlPtr).toString();
    const handler = eventEmitter_default.events.app.openUrl;
    const event = handler({ url });
    eventEmitter_default.emitEvent(event);
  }, {
    args: [FFIType.cstring],
    returns: "void",
    threadsafe: true
  });
  if (process.platform === "darwin") {
    native.symbols.setURLOpenHandler(urlOpenCallback);
  }
  quitRequestedCallback = new JSCallback(() => {
    const { quit: quit2 } = (init_Utils(), __toCommonJS(exports_Utils));
    quit2();
  }, {
    args: [],
    returns: "void",
    threadsafe: true
  });
  native.symbols.setQuitRequestedHandler(quitRequestedCallback);
  globalShortcutHandlers = new Map;
  globalShortcutCallback = new JSCallback((acceleratorPtr) => {
    const accelerator = new CString(acceleratorPtr).toString();
    const handler = globalShortcutHandlers.get(accelerator);
    if (handler) {
      handler();
    }
  }, {
    args: [FFIType.cstring],
    returns: "void",
    threadsafe: true
  });
  native.symbols.setGlobalShortcutCallback(globalShortcutCallback);
  GlobalShortcut = {
    register: (accelerator, callback) => {
      if (globalShortcutHandlers.has(accelerator)) {
        return false;
      }
      const result = native.symbols.registerGlobalShortcut(toCString(accelerator));
      if (result) {
        globalShortcutHandlers.set(accelerator, callback);
      }
      return result;
    },
    unregister: (accelerator) => {
      const result = native.symbols.unregisterGlobalShortcut(toCString(accelerator));
      if (result) {
        globalShortcutHandlers.delete(accelerator);
      }
      return result;
    },
    unregisterAll: () => {
      native.symbols.unregisterAllGlobalShortcuts();
      globalShortcutHandlers.clear();
    },
    isRegistered: (accelerator) => {
      return native.symbols.isGlobalShortcutRegistered(toCString(accelerator));
    }
  };
  Screen = {
    getPrimaryDisplay: () => {
      const jsonStr = native.symbols.getPrimaryDisplay();
      if (!jsonStr) {
        return {
          id: 0,
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          workArea: { x: 0, y: 0, width: 0, height: 0 },
          scaleFactor: 1,
          isPrimary: true
        };
      }
      try {
        return JSON.parse(jsonStr.toString());
      } catch {
        return {
          id: 0,
          bounds: { x: 0, y: 0, width: 0, height: 0 },
          workArea: { x: 0, y: 0, width: 0, height: 0 },
          scaleFactor: 1,
          isPrimary: true
        };
      }
    },
    getAllDisplays: () => {
      const jsonStr = native.symbols.getAllDisplays();
      if (!jsonStr) {
        return [];
      }
      try {
        return JSON.parse(jsonStr.toString());
      } catch {
        return [];
      }
    },
    getCursorScreenPoint: () => {
      const jsonStr = native.symbols.getCursorScreenPoint();
      if (!jsonStr) {
        return { x: 0, y: 0 };
      }
      try {
        return JSON.parse(jsonStr.toString());
      } catch {
        return { x: 0, y: 0 };
      }
    }
  };
  sessionCache = new Map;
  Session = {
    fromPartition: (partition) => {
      let session = sessionCache.get(partition);
      if (!session) {
        session = new SessionInstance(partition);
        sessionCache.set(partition, session);
      }
      return session;
    },
    get defaultSession() {
      return Session.fromPartition("persist:default");
    }
  };
  webviewDecideNavigation = new JSCallback((_webviewId, _url) => {
    return true;
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.u32,
    threadsafe: true
  });
  webviewEventJSCallback = new JSCallback((id, _eventName, _detail) => {
    let eventName = "";
    let detail = "";
    try {
      eventName = new CString(_eventName).toString();
      detail = new CString(_detail).toString();
    } catch (err) {
      console.error("[webviewEventJSCallback] Error converting strings:", err);
      console.error("[webviewEventJSCallback] Raw values:", {
        _eventName,
        _detail
      });
      return;
    }
    webviewEventHandler(id, eventName, detail);
  }, {
    args: [FFIType.u32, FFIType.cstring, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  bunBridgePostmessageHandler = new JSCallback((id, msg) => {
    try {
      const msgStr = new CString(msg);
      if (!msgStr.length) {
        return;
      }
      const msgJson = JSON.parse(msgStr.toString());
      const webview = BrowserView.getById(id);
      if (!webview)
        return;
      webview.rpcHandler?.(msgJson);
    } catch (err) {
      console.error("error sending message to bun: ", err);
      console.error("msgString: ", new CString(msg));
    }
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  eventBridgeHandler = new JSCallback((_id, msg) => {
    try {
      const message = new CString(msg);
      const jsonMessage = JSON.parse(message.toString());
      if (jsonMessage.id === "webviewEvent") {
        const { payload } = jsonMessage;
        webviewEventHandler(payload.id, payload.eventName, payload.detail);
      }
    } catch (err) {
      console.error("error in eventBridgeHandler: ", err);
    }
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  internalBridgeHandler = new JSCallback((_id, msg) => {
    try {
      const batchMessage = new CString(msg);
      const jsonBatch = JSON.parse(batchMessage.toString());
      if (jsonBatch.id === "webviewEvent") {
        const { payload } = jsonBatch;
        webviewEventHandler(payload.id, payload.eventName, payload.detail);
        return;
      }
      jsonBatch.forEach((msgStr) => {
        const msgJson = JSON.parse(msgStr);
        if (msgJson.type === "message") {
          const handler = internalRpcHandlers.message[msgJson.id];
          handler?.(msgJson.payload);
        } else if (msgJson.type === "request") {
          const hostWebview = BrowserView.getById(msgJson.hostWebviewId);
          const handler = internalRpcHandlers.request[msgJson.method];
          const payload = handler?.(msgJson.params);
          const resultObj = {
            type: "response",
            id: msgJson.id,
            success: true,
            payload
          };
          if (!hostWebview) {
            console.log("--->>> internal request in bun: NO HOST WEBVIEW FOUND");
            return;
          }
          hostWebview.sendInternalMessageViaExecute(resultObj);
        }
      });
    } catch (err) {
      console.error("error in internalBridgeHandler: ", err);
    }
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  trayItemHandler = new JSCallback((id, action) => {
    const actionString = (new CString(action).toString() || "").trim();
    const { action: actualAction, data } = deserializeMenuAction(actionString);
    const event = eventEmitter_default.events.tray.trayClicked({
      id,
      action: actualAction,
      data
    });
    eventEmitter_default.emitEvent(event);
    eventEmitter_default.emitEvent(event, id);
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  applicationMenuHandler = new JSCallback((id, action) => {
    const actionString = new CString(action).toString();
    const { action: actualAction, data } = deserializeMenuAction(actionString);
    const event = eventEmitter_default.events.app.applicationMenuClicked({
      id,
      action: actualAction,
      data
    });
    eventEmitter_default.emitEvent(event);
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  contextMenuHandler = new JSCallback((_id, action) => {
    const actionString = new CString(action).toString();
    const { action: actualAction, data } = deserializeMenuAction(actionString);
    const event = eventEmitter_default.events.app.contextMenuClicked({
      action: actualAction,
      data
    });
    eventEmitter_default.emitEvent(event);
  }, {
    args: [FFIType.u32, FFIType.cstring],
    returns: FFIType.void,
    threadsafe: true
  });
  internalRpcHandlers = {
    request: {
      webviewTagInit: (params) => {
        const {
          hostWebviewId,
          windowId,
          renderer,
          html,
          preload,
          partition,
          frame,
          navigationRules,
          sandbox,
          transparent,
          passthrough
        } = params;
        const url = !params.url && !html ? "https://electrobun.dev" : params.url;
        const webviewForTag = new BrowserView({
          url,
          html,
          preload,
          partition,
          frame,
          hostWebviewId,
          autoResize: false,
          windowId,
          renderer,
          navigationRules,
          sandbox,
          startTransparent: transparent,
          startPassthrough: passthrough
        });
        return webviewForTag.id;
      },
      webviewTagCanGoBack: (params) => {
        const { id } = params;
        const webviewPtr = BrowserView.getById(id)?.ptr;
        if (!webviewPtr) {
          console.error("no webview ptr");
          return false;
        }
        return native.symbols.webviewCanGoBack(webviewPtr);
      },
      webviewTagCanGoForward: (params) => {
        const { id } = params;
        const webviewPtr = BrowserView.getById(id)?.ptr;
        if (!webviewPtr) {
          console.error("no webview ptr");
          return false;
        }
        return native.symbols.webviewCanGoForward(webviewPtr);
      }
    },
    message: {
      webviewTagResize: (params) => {
        const browserView = BrowserView.getById(params.id);
        const webviewPtr = browserView?.ptr;
        if (!webviewPtr) {
          console.log("[Bun] ERROR: webviewTagResize - no webview ptr found for id:", params.id);
          return;
        }
        const { x, y, width, height } = params.frame;
        native.symbols.resizeWebview(webviewPtr, x, y, width, height, toCString(params.masks));
      },
      webviewTagUpdateSrc: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagUpdateSrc: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.loadURLInWebView(webview.ptr, toCString(params.url));
      },
      webviewTagUpdateHtml: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagUpdateHtml: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.setWebviewHTMLContent(webview.id, toCString(params.html));
        webview.loadHTML(params.html);
        webview.html = params.html;
      },
      webviewTagUpdatePreload: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagUpdatePreload: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.updatePreloadScriptToWebView(webview.ptr, toCString("electrobun_custom_preload_script"), toCString(params.preload), true);
      },
      webviewTagGoBack: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagGoBack: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewGoBack(webview.ptr);
      },
      webviewTagGoForward: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagGoForward: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewGoForward(webview.ptr);
      },
      webviewTagReload: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagReload: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewReload(webview.ptr);
      },
      webviewTagRemove: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagRemove: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewRemove(webview.ptr);
      },
      startWindowMove: (params) => {
        const window = BrowserWindow.getById(params.id);
        if (!window)
          return;
        native.symbols.startWindowMove(window.ptr);
      },
      stopWindowMove: (_params) => {
        native.symbols.stopWindowMove();
      },
      webviewTagSetTransparent: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagSetTransparent: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewSetTransparent(webview.ptr, params.transparent);
      },
      webviewTagSetPassthrough: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagSetPassthrough: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewSetPassthrough(webview.ptr, params.enablePassthrough);
      },
      webviewTagSetHidden: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagSetHidden: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewSetHidden(webview.ptr, params.hidden);
      },
      webviewTagSetNavigationRules: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagSetNavigationRules: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        const rulesJson = JSON.stringify(params.rules);
        native.symbols.setWebviewNavigationRules(webview.ptr, toCString(rulesJson));
      },
      webviewTagFindInPage: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagFindInPage: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewFindInPage(webview.ptr, toCString(params.searchText), params.forward, params.matchCase);
      },
      webviewTagStopFind: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagStopFind: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewStopFind(webview.ptr);
      },
      webviewTagOpenDevTools: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagOpenDevTools: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewOpenDevTools(webview.ptr);
      },
      webviewTagCloseDevTools: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagCloseDevTools: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewCloseDevTools(webview.ptr);
      },
      webviewTagToggleDevTools: (params) => {
        const webview = BrowserView.getById(params.id);
        if (!webview || !webview.ptr) {
          console.error(`webviewTagToggleDevTools: BrowserView not found or has no ptr for id ${params.id}`);
          return;
        }
        native.symbols.webviewToggleDevTools(webview.ptr);
      },
      webviewEvent: (params) => {
        console.log("-----------------+webviewEvent", params);
      }
    }
  };
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/BrowserWindow.ts
class BrowserWindow {
  id = nextWindowId++;
  ptr;
  title = "Electrobun";
  state = "creating";
  url = null;
  html = null;
  preload = null;
  renderer = "native";
  transparent = false;
  navigationRules = null;
  sandbox = false;
  frame = {
    x: 0,
    y: 0,
    width: 800,
    height: 600
  };
  webviewId;
  constructor(options = defaultOptions2) {
    this.title = options.title || "New Window";
    this.frame = options.frame ? { ...defaultOptions2.frame, ...options.frame } : { ...defaultOptions2.frame };
    this.url = options.url || null;
    this.html = options.html || null;
    this.preload = options.preload || null;
    this.renderer = options.renderer || defaultOptions2.renderer;
    this.transparent = options.transparent ?? false;
    this.navigationRules = options.navigationRules || null;
    this.sandbox = options.sandbox ?? false;
    this.init(options);
  }
  init({
    rpc,
    styleMask,
    titleBarStyle,
    transparent
  }) {
    this.ptr = ffi.request.createWindow({
      id: this.id,
      title: this.title,
      url: this.url || "",
      frame: {
        width: this.frame.width,
        height: this.frame.height,
        x: this.frame.x,
        y: this.frame.y
      },
      styleMask: {
        Borderless: false,
        Titled: true,
        Closable: true,
        Miniaturizable: true,
        Resizable: true,
        UnifiedTitleAndToolbar: false,
        FullScreen: false,
        FullSizeContentView: false,
        UtilityWindow: false,
        DocModalWindow: false,
        NonactivatingPanel: false,
        HUDWindow: false,
        ...styleMask || {},
        ...titleBarStyle === "hiddenInset" ? {
          Titled: true,
          FullSizeContentView: true
        } : {},
        ...titleBarStyle === "hidden" ? {
          Titled: false,
          FullSizeContentView: true
        } : {}
      },
      titleBarStyle: titleBarStyle || "default",
      transparent: transparent ?? false
    });
    BrowserWindowMap[this.id] = this;
    const webview = new BrowserView({
      url: this.url,
      html: this.html,
      preload: this.preload,
      renderer: this.renderer,
      frame: {
        x: 0,
        y: 0,
        width: this.frame.width,
        height: this.frame.height
      },
      rpc,
      windowId: this.id,
      navigationRules: this.navigationRules,
      sandbox: this.sandbox
    });
    console.log("setting webviewId: ", webview.id);
    this.webviewId = webview.id;
  }
  get webview() {
    return BrowserView.getById(this.webviewId);
  }
  static getById(id) {
    return BrowserWindowMap[id];
  }
  setTitle(title) {
    this.title = title;
    return ffi.request.setTitle({ winId: this.id, title });
  }
  close() {
    return ffi.request.closeWindow({ winId: this.id });
  }
  focus() {
    return ffi.request.focusWindow({ winId: this.id });
  }
  show() {
    return ffi.request.focusWindow({ winId: this.id });
  }
  minimize() {
    return ffi.request.minimizeWindow({ winId: this.id });
  }
  unminimize() {
    return ffi.request.restoreWindow({ winId: this.id });
  }
  isMinimized() {
    return ffi.request.isWindowMinimized({ winId: this.id });
  }
  maximize() {
    return ffi.request.maximizeWindow({ winId: this.id });
  }
  unmaximize() {
    return ffi.request.unmaximizeWindow({ winId: this.id });
  }
  isMaximized() {
    return ffi.request.isWindowMaximized({ winId: this.id });
  }
  setFullScreen(fullScreen) {
    return ffi.request.setWindowFullScreen({ winId: this.id, fullScreen });
  }
  isFullScreen() {
    return ffi.request.isWindowFullScreen({ winId: this.id });
  }
  setAlwaysOnTop(alwaysOnTop) {
    return ffi.request.setWindowAlwaysOnTop({ winId: this.id, alwaysOnTop });
  }
  isAlwaysOnTop() {
    return ffi.request.isWindowAlwaysOnTop({ winId: this.id });
  }
  setPosition(x, y) {
    this.frame.x = x;
    this.frame.y = y;
    return ffi.request.setWindowPosition({ winId: this.id, x, y });
  }
  setSize(width, height) {
    this.frame.width = width;
    this.frame.height = height;
    return ffi.request.setWindowSize({ winId: this.id, width, height });
  }
  setFrame(x, y, width, height) {
    this.frame = { x, y, width, height };
    return ffi.request.setWindowFrame({ winId: this.id, x, y, width, height });
  }
  getFrame() {
    const frame = ffi.request.getWindowFrame({ winId: this.id });
    this.frame = frame;
    return frame;
  }
  getPosition() {
    const frame = this.getFrame();
    return { x: frame.x, y: frame.y };
  }
  getSize() {
    const frame = this.getFrame();
    return { width: frame.width, height: frame.height };
  }
  on(name, handler) {
    const specificName = `${name}-${this.id}`;
    eventEmitter_default.on(specificName, handler);
  }
}
var buildConfig3, nextWindowId = 1, defaultOptions2, BrowserWindowMap;
var init_BrowserWindow = __esm(async () => {
  init_eventEmitter();
  init_BuildConfig();
  await __promiseAll([
    init_native(),
    init_BrowserView(),
    init_Utils()
  ]);
  buildConfig3 = await BuildConfig.get();
  defaultOptions2 = {
    title: "Electrobun",
    frame: {
      x: 0,
      y: 0,
      width: 800,
      height: 600
    },
    url: "https://electrobun.dev",
    html: null,
    preload: null,
    renderer: buildConfig3.defaultRenderer,
    titleBarStyle: "default",
    transparent: false,
    navigationRules: null,
    sandbox: false
  };
  BrowserWindowMap = {};
  eventEmitter_default.on("close", (event) => {
    const windowId = event.data.id;
    delete BrowserWindowMap[windowId];
    for (const view of BrowserView.getAll()) {
      if (view.windowId === windowId) {
        view.remove();
      }
    }
    const exitOnLastWindowClosed = buildConfig3.runtime?.exitOnLastWindowClosed ?? true;
    if (exitOnLastWindowClosed && Object.keys(BrowserWindowMap).length === 0) {
      quit();
    }
  });
});

// src/native/agent.ts
var exports_agent = {};
__export(exports_agent, {
  getAgentManager: () => getAgentManager,
  AgentManager: () => AgentManager
});
import fs from "fs";
import os2 from "os";
import path from "path";
function getDiagnosticLogPath() {
  if (diagnosticLogPath !== null)
    return diagnosticLogPath;
  try {
    const configDir = path.join(os2.homedir(), ".config", "Milady");
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    diagnosticLogPath = path.join(configDir, "milady-startup.log");
  } catch {
    diagnosticLogPath = path.join(os2.tmpdir(), "milady-startup.log");
  }
  return diagnosticLogPath;
}
function diagnosticLog(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}
`;
  console.log(message);
  try {
    const logPath = getDiagnosticLogPath();
    fs.appendFileSync(logPath, line);
  } catch {}
}
function shortError(err, maxLen = 280) {
  const raw = err instanceof Error ? err.message || (err.stack ?? String(err)) : String(err);
  const oneLine = raw.replace(/\s+/g, " ").trim();
  if (oneLine.length <= maxLen)
    return oneLine;
  return `${oneLine.slice(0, maxLen)}...`;
}
function resolveMiladyDistPath() {
  const envPath = process.env.MILADY_DIST_PATH;
  if (envPath) {
    const resolved = path.resolve(envPath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
    diagnosticLog(`[Agent] MILADY_DIST_PATH set but does not exist: ${resolved}`);
  }
  let dir = import.meta.dir;
  const maxDepth = 15;
  for (let i = 0;i < maxDepth; i++) {
    const miladyDist = path.join(dir, "milady-dist");
    if (fs.existsSync(miladyDist)) {
      return miladyDist;
    }
    const devDist = path.join(dir, "dist");
    if (fs.existsSync(path.join(devDist, "eliza.js"))) {
      return devDist;
    }
    const parent = path.dirname(dir);
    if (parent === dir)
      break;
    dir = parent;
  }
  const fallback = path.resolve(import.meta.dir, "../../../milady-dist");
  diagnosticLog(`[Agent] Could not find milady-dist by walking up; using fallback: ${fallback}`);
  return fallback;
}
async function waitForHealthy(getPort, timeoutMs = HEALTH_POLL_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const port = getPort();
    const url = `http://localhost:${port}/api/health`;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(2000)
      });
      if (response.ok) {
        return true;
      }
    } catch {}
    await Bun.sleep(HEALTH_POLL_INTERVAL_MS);
  }
  return false;
}
async function watchStdoutForReady(stream, onLine, signal) {
  const decoder = new TextDecoder;
  let buffer = "";
  try {
    const reader = stream.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(`
`);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          onLine(line);
        }
      }
    }
    if (buffer.trim()) {
      onLine(buffer);
    }
    reader.releaseLock();
  } catch (err) {
    if (!signal.aborted) {
      diagnosticLog(`[Agent] stdout watcher error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
async function drainStderrToLog(stream, signal, onLine) {
  const decoder = new TextDecoder;
  let buffer = "";
  try {
    const reader = stream.getReader();
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done)
        break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(`
`);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) {
          diagnosticLog(`[Agent][stderr] ${line}`);
          onLine?.(line);
        }
      }
    }
    if (buffer.trim()) {
      diagnosticLog(`[Agent][stderr] ${buffer}`);
      onLine?.(buffer);
    }
    reader.releaseLock();
  } catch (err) {
    if (!signal.aborted) {
      diagnosticLog(`[Agent] stderr drain error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
function resolvePgliteDataDir() {
  return path.join(os2.homedir(), ".milady", "workspace", ".eliza", ".elizadb");
}
function deletePgliteDataDir() {
  const dir = resolvePgliteDataDir();
  try {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      diagnosticLog(`[Agent] Deleted corrupt PGLite data dir: ${dir}`);
    }
  } catch (err) {
    diagnosticLog(`[Agent] Failed to delete PGLite data dir: ${err instanceof Error ? err.message : String(err)}`);
  }
}

class AgentManager {
  sendToWebview = null;
  status = {
    state: "not_started",
    agentName: null,
    port: null,
    startedAt: null,
    error: null
  };
  childProcess = null;
  stdioAbortController = null;
  hasPgliteError = false;
  pgliteRecoveryDone = false;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async start() {
    diagnosticLog(`[Agent] start() called, current state: ${this.status.state}`);
    diagnosticLog(`[Agent] Diagnostic log file: ${getDiagnosticLogPath()}`);
    if (this.status.state === "running" || this.status.state === "starting") {
      return this.status;
    }
    this.pgliteRecoveryDone = false;
    if (this.childProcess) {
      await this.killChildProcess();
    }
    this.status = {
      state: "starting",
      agentName: null,
      port: null,
      startedAt: null,
      error: null
    };
    this.emitStatus();
    try {
      const miladyDistPath = resolveMiladyDistPath();
      diagnosticLog(`[Agent] Resolved milady dist: ${miladyDistPath}`);
      const elizaPath = path.join(miladyDistPath, "eliza.js");
      const serverEntryPath = elizaPath;
      if (!fs.existsSync(serverEntryPath)) {
        const distExists = fs.existsSync(miladyDistPath);
        let contents = "<directory missing>";
        if (distExists) {
          try {
            contents = fs.readdirSync(miladyDistPath).join(", ");
          } catch {
            contents = "<unreadable>";
          }
        }
        const errMsg = `eliza.js not found at ${serverEntryPath} (dist exists: ${distExists}, contents: ${contents})`;
        diagnosticLog(`[Agent] ${errMsg}`);
        this.status = {
          state: "error",
          agentName: null,
          port: null,
          startedAt: null,
          error: errMsg
        };
        this.emitStatus();
        return this.status;
      }
      diagnosticLog(`[Agent] eliza.js: exists (${serverEntryPath})`);
      let apiPort = Number(process.env.MILADY_PORT) || DEFAULT_PORT;
      diagnosticLog(`[Agent] Starting child process on port ${apiPort}...`);
      const nodePaths = [];
      const distModules = path.join(miladyDistPath, "node_modules");
      if (fs.existsSync(distModules)) {
        nodePaths.push(distModules);
      }
      let searchDir = miladyDistPath;
      while (searchDir !== path.dirname(searchDir)) {
        const candidate = path.join(searchDir, "node_modules");
        if (fs.existsSync(candidate) && candidate !== distModules) {
          nodePaths.push(candidate);
          break;
        }
        searchDir = path.dirname(searchDir);
      }
      const existingNodePath = process.env.NODE_PATH;
      if (existingNodePath) {
        nodePaths.push(existingNodePath);
      }
      const childEnv = {
        ...process.env,
        MILADY_PORT: String(apiPort),
        STREAM_MODE: "pipe"
      };
      if (nodePaths.length > 0) {
        childEnv.NODE_PATH = nodePaths.join(path.delimiter);
        diagnosticLog(`[Agent] Child NODE_PATH: ${childEnv.NODE_PATH}`);
      }
      const proc = Bun.spawn(["bun", "run", serverEntryPath], {
        cwd: miladyDistPath,
        env: childEnv,
        stdout: "pipe",
        stderr: "pipe"
      });
      this.childProcess = proc;
      this.stdioAbortController = new AbortController;
      const { signal } = this.stdioAbortController;
      this.status = {
        ...this.status,
        port: apiPort
      };
      this.emitStatus();
      let detectedListening = false;
      if (proc.stdout) {
        watchStdoutForReady(proc.stdout, (line) => {
          diagnosticLog(`[Agent][stdout] ${line}`);
          const lower = line.toLowerCase();
          const portMatch = line.match(/Listening on https?:\/\/[^:]+:(\d+)/i);
          if (portMatch) {
            const parsedPort = parseInt(portMatch[1], 10);
            if (!Number.isNaN(parsedPort) && parsedPort > 0) {
              if (parsedPort !== apiPort) {
                diagnosticLog(`[Agent] Server bound to dynamic port ${parsedPort} (requested ${apiPort})`);
                apiPort = parsedPort;
              }
              detectedListening = true;
            }
          } else if (lower.includes("listening on port") || lower.includes("server started") || lower.includes("ready on")) {
            detectedListening = true;
          }
          this.status = { ...this.status, port: apiPort };
          this.emitStatus();
        }, signal).catch(() => {});
      }
      this.hasPgliteError = false;
      if (proc.stderr) {
        drainStderrToLog(proc.stderr, signal, (line) => {
          if (PGLITE_MIGRATION_RE.test(line)) {
            this.hasPgliteError = true;
          }
        }).catch(() => {});
      }
      this.monitorChildExit(proc);
      diagnosticLog(`[Agent] Waiting for health endpoint at http://localhost:${apiPort}/api/health ...`);
      const healthy = await waitForHealthy(() => apiPort);
      if (!healthy) {
        if (proc.exitCode !== null) {
          const errMsg2 = `Child process exited with code ${proc.exitCode} before becoming healthy`;
          diagnosticLog(`[Agent] ${errMsg2}`);
          this.childProcess = null;
          this.status = {
            state: "error",
            agentName: null,
            port: apiPort,
            startedAt: null,
            error: errMsg2
          };
          this.emitStatus();
          return this.status;
        }
        const errMsg = detectedListening ? "Server reported listening but health check timed out" : `Health check timed out after ${HEALTH_POLL_TIMEOUT_MS}ms`;
        diagnosticLog(`[Agent] ${errMsg}`);
        this.status = {
          state: "error",
          agentName: null,
          port: apiPort,
          startedAt: null,
          error: errMsg
        };
        this.emitStatus();
        return this.status;
      }
      const agentName = await this.fetchAgentName(apiPort);
      this.status = {
        state: "running",
        agentName,
        port: apiPort,
        startedAt: Date.now(),
        error: null
      };
      this.emitStatus();
      diagnosticLog(`[Agent] Runtime started -- agent: ${agentName}, port: ${apiPort}, pid: ${proc.pid}`);
      return this.status;
    } catch (err) {
      const errMsg = err instanceof Error ? err.stack || err.message : String(err);
      diagnosticLog(`[Agent] Failed to start: ${errMsg}`);
      if (this.childProcess) {
        await this.killChildProcess();
      }
      this.status = {
        state: "error",
        agentName: null,
        port: this.status.port,
        startedAt: null,
        error: shortError(err)
      };
      this.emitStatus();
      return this.status;
    }
  }
  async stop() {
    if (this.status.state !== "running" && this.status.state !== "starting") {
      return;
    }
    diagnosticLog("[Agent] Stopping...");
    if (this.stdioAbortController) {
      this.stdioAbortController.abort();
      this.stdioAbortController = null;
    }
    await this.killChildProcess();
    this.status = {
      state: "stopped",
      agentName: this.status.agentName,
      port: null,
      startedAt: null,
      error: null
    };
    this.emitStatus();
    diagnosticLog("[Agent] Runtime stopped");
  }
  async restart() {
    diagnosticLog("[Agent] Restart requested -- stopping current runtime...");
    await this.stop();
    diagnosticLog("[Agent] Restarting...");
    return this.start();
  }
  getStatus() {
    return { ...this.status };
  }
  getPort() {
    return this.status.port;
  }
  dispose() {
    if (this.stdioAbortController) {
      this.stdioAbortController.abort();
      this.stdioAbortController = null;
    }
    this.killChildProcess().catch((err) => console.warn("[Agent] dispose error:", err instanceof Error ? err.message : err));
  }
  emitStatus() {
    if (this.sendToWebview) {
      this.sendToWebview("agentStatusUpdate", this.status);
    }
  }
  monitorChildExit(proc) {
    proc.exited.then((exitCode) => {
      if (this.childProcess !== proc)
        return;
      const wasRunning = this.status.state === "running";
      const wasStarting = this.status.state === "starting";
      if (wasRunning || wasStarting) {
        diagnosticLog(`[Agent] Child process exited unexpectedly with code ${exitCode} (pid: ${proc.pid})`);
        this.childProcess = null;
        if (this.hasPgliteError && !this.pgliteRecoveryDone) {
          this.pgliteRecoveryDone = true;
          diagnosticLog("[Agent] PGLite migration error detected \u2014 deleting DB and retrying with fresh process");
          deletePgliteDataDir();
          this.status = {
            state: "not_started",
            agentName: null,
            port: null,
            startedAt: null,
            error: null
          };
          setTimeout(() => void this.start(), 500);
          return;
        }
        this.status = {
          state: "error",
          agentName: this.status.agentName,
          port: this.status.port,
          startedAt: null,
          error: `Process exited unexpectedly with code ${exitCode}`
        };
        this.emitStatus();
      } else {
        this.childProcess = null;
      }
    }).catch((err) => {
      if (this.childProcess !== proc)
        return;
      diagnosticLog(`[Agent] Child process exited with error: ${err instanceof Error ? err.message : String(err)}`);
      this.childProcess = null;
      if (this.status.state === "running" || this.status.state === "starting") {
        this.status = {
          state: "error",
          agentName: this.status.agentName,
          port: this.status.port,
          startedAt: null,
          error: shortError(err)
        };
        this.emitStatus();
      }
    });
  }
  async killChildProcess() {
    const proc = this.childProcess;
    if (!proc)
      return;
    this.childProcess = null;
    if (proc.exitCode !== null)
      return;
    diagnosticLog(`[Agent] Sending SIGTERM to pid ${proc.pid}`);
    proc.kill("SIGTERM");
    const exited = await Promise.race([
      proc.exited.then(() => true),
      Bun.sleep(SIGTERM_GRACE_MS).then(() => false)
    ]);
    if (!exited) {
      diagnosticLog(`[Agent] Process did not exit within ${SIGTERM_GRACE_MS}ms, sending SIGKILL`);
      try {
        proc.kill("SIGKILL");
      } catch {}
      await Promise.race([proc.exited.catch(() => {}), Bun.sleep(1000)]);
    }
    diagnosticLog("[Agent] Child process terminated");
  }
  async fetchAgentName(port) {
    try {
      const response = await fetch(`http://localhost:${port}/api/agents`, {
        signal: AbortSignal.timeout(5000)
      });
      if (response.ok) {
        const data = await response.json();
        if (data.agents && data.agents.length > 0 && data.agents[0].name) {
          return data.agents[0].name;
        }
      }
    } catch {
      diagnosticLog("[Agent] Could not fetch agent name, using default");
    }
    return "Milady";
  }
}
function getAgentManager() {
  if (!agentManager) {
    agentManager = new AgentManager;
  }
  return agentManager;
}
var DEFAULT_PORT = 2138, HEALTH_POLL_INTERVAL_MS = 500, HEALTH_POLL_TIMEOUT_MS = 60000, SIGTERM_GRACE_MS = 5000, diagnosticLogPath = null, PGLITE_MIGRATION_RE, agentManager = null;
var init_agent = __esm(() => {
  PGLITE_MIGRATION_RE = /Failed query:|create schema if not exists/i;
});

// src/index.ts
import fs8 from "fs";
import { createServer as createNetServer } from "net";
import path8 from "path";

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/index.ts
init_eventEmitter();
await __promiseAll([
  init_BrowserWindow(),
  init_BrowserView(),
  init_Tray()
]);

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/ApplicationMenu.ts
init_eventEmitter();
await init_native();
var exports_ApplicationMenu = {};
__export(exports_ApplicationMenu, {
  setApplicationMenu: () => setApplicationMenu,
  on: () => on
});

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/menuRoles.ts
var roleLabelMap = {
  about: "About",
  quit: "Quit",
  hide: "Hide",
  hideOthers: "Hide Others",
  showAll: "Show All",
  minimize: "Minimize",
  zoom: "Zoom",
  close: "Close",
  bringAllToFront: "Bring All To Front",
  cycleThroughWindows: "Cycle Through Windows",
  enterFullScreen: "Enter Full Screen",
  exitFullScreen: "Exit Full Screen",
  toggleFullScreen: "Toggle Full Screen",
  undo: "Undo",
  redo: "Redo",
  cut: "Cut",
  copy: "Copy",
  paste: "Paste",
  pasteAndMatchStyle: "Paste and Match Style",
  delete: "Delete",
  selectAll: "Select All",
  startSpeaking: "Start Speaking",
  stopSpeaking: "Stop Speaking",
  showHelp: "Show Help",
  moveForward: "Move Forward",
  moveBackward: "Move Backward",
  moveLeft: "Move Left",
  moveRight: "Move Right",
  moveUp: "Move Up",
  moveDown: "Move Down",
  moveWordForward: "Move Word Forward",
  moveWordBackward: "Move Word Backward",
  moveWordLeft: "Move Word Left",
  moveWordRight: "Move Word Right",
  moveToBeginningOfLine: "Move to Beginning of Line",
  moveToEndOfLine: "Move to End of Line",
  moveToLeftEndOfLine: "Move to Left End of Line",
  moveToRightEndOfLine: "Move to Right End of Line",
  moveToBeginningOfParagraph: "Move to Beginning of Paragraph",
  moveToEndOfParagraph: "Move to End of Paragraph",
  moveParagraphForward: "Move Paragraph Forward",
  moveParagraphBackward: "Move Paragraph Backward",
  moveToBeginningOfDocument: "Move to Beginning of Document",
  moveToEndOfDocument: "Move to End of Document",
  moveForwardAndModifySelection: "Move Forward and Modify Selection",
  moveBackwardAndModifySelection: "Move Backward and Modify Selection",
  moveLeftAndModifySelection: "Move Left and Modify Selection",
  moveRightAndModifySelection: "Move Right and Modify Selection",
  moveUpAndModifySelection: "Move Up and Modify Selection",
  moveDownAndModifySelection: "Move Down and Modify Selection",
  moveWordForwardAndModifySelection: "Move Word Forward and Modify Selection",
  moveWordBackwardAndModifySelection: "Move Word Backward and Modify Selection",
  moveWordLeftAndModifySelection: "Move Word Left and Modify Selection",
  moveWordRightAndModifySelection: "Move Word Right and Modify Selection",
  moveToBeginningOfLineAndModifySelection: "Move to Beginning of Line and Modify Selection",
  moveToEndOfLineAndModifySelection: "Move to End of Line and Modify Selection",
  moveToLeftEndOfLineAndModifySelection: "Move to Left End of Line and Modify Selection",
  moveToRightEndOfLineAndModifySelection: "Move to Right End of Line and Modify Selection",
  moveToBeginningOfParagraphAndModifySelection: "Move to Beginning of Paragraph and Modify Selection",
  moveToEndOfParagraphAndModifySelection: "Move to End of Paragraph and Modify Selection",
  moveParagraphForwardAndModifySelection: "Move Paragraph Forward and Modify Selection",
  moveParagraphBackwardAndModifySelection: "Move Paragraph Backward and Modify Selection",
  moveToBeginningOfDocumentAndModifySelection: "Move to Beginning of Document and Modify Selection",
  moveToEndOfDocumentAndModifySelection: "Move to End of Document and Modify Selection",
  pageUp: "Page Up",
  pageDown: "Page Down",
  pageUpAndModifySelection: "Page Up and Modify Selection",
  pageDownAndModifySelection: "Page Down and Modify Selection",
  scrollLineUp: "Scroll Line Up",
  scrollLineDown: "Scroll Line Down",
  scrollPageUp: "Scroll Page Up",
  scrollPageDown: "Scroll Page Down",
  scrollToBeginningOfDocument: "Scroll to Beginning of Document",
  scrollToEndOfDocument: "Scroll to End of Document",
  centerSelectionInVisibleArea: "Center Selection in Visible Area",
  deleteBackward: "Delete Backward",
  deleteForward: "Delete Forward",
  deleteBackwardByDecomposingPreviousCharacter: "Delete Backward by Decomposing Previous Character",
  deleteWordBackward: "Delete Word Backward",
  deleteWordForward: "Delete Word Forward",
  deleteToBeginningOfLine: "Delete to Beginning of Line",
  deleteToEndOfLine: "Delete to End of Line",
  deleteToBeginningOfParagraph: "Delete to Beginning of Paragraph",
  deleteToEndOfParagraph: "Delete to End of Paragraph",
  selectWord: "Select Word",
  selectLine: "Select Line",
  selectParagraph: "Select Paragraph",
  selectToMark: "Select to Mark",
  setMark: "Set Mark",
  swapWithMark: "Swap with Mark",
  deleteToMark: "Delete to Mark",
  capitalizeWord: "Capitalize Word",
  uppercaseWord: "Uppercase Word",
  lowercaseWord: "Lowercase Word",
  transpose: "Transpose",
  transposeWords: "Transpose Words",
  insertNewline: "Insert Newline",
  insertLineBreak: "Insert Line Break",
  insertParagraphSeparator: "Insert Paragraph Separator",
  insertTab: "Insert Tab",
  insertBacktab: "Insert Backtab",
  insertTabIgnoringFieldEditor: "Insert Tab Ignoring Field Editor",
  insertNewlineIgnoringFieldEditor: "Insert Newline Ignoring Field Editor",
  yank: "Yank",
  yankAndSelect: "Yank and Select",
  complete: "Complete",
  cancelOperation: "Cancel Operation",
  indent: "Indent"
};

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/ApplicationMenu.ts
var setApplicationMenu = (menu) => {
  const menuWithDefaults = menuConfigWithDefaults2(menu);
  ffi.request.setApplicationMenu({
    menuConfig: JSON.stringify(menuWithDefaults)
  });
};
var on = (name, handler) => {
  const specificName = `${name}`;
  eventEmitter_default.on(specificName, handler);
};
var menuConfigWithDefaults2 = (menu) => {
  return menu.map((item) => {
    if (item.type === "divider" || item.type === "separator") {
      return { type: "divider" };
    } else {
      const menuItem = item;
      const actionWithDataId = ffi.internal.serializeMenuAction(menuItem.action || "", menuItem.data);
      return {
        label: menuItem.label || roleLabelMap[menuItem.role] || "",
        type: menuItem.type || "normal",
        ...menuItem.role ? { role: menuItem.role } : { action: actionWithDataId },
        enabled: menuItem.enabled === false ? false : true,
        checked: Boolean(menuItem.checked),
        hidden: Boolean(menuItem.hidden),
        tooltip: menuItem.tooltip || undefined,
        accelerator: menuItem.accelerator || undefined,
        ...menuItem.submenu ? { submenu: menuConfigWithDefaults2(menuItem.submenu) } : {}
      };
    }
  });
};

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/core/ContextMenu.ts
init_eventEmitter();
await init_native();
var exports_ContextMenu = {};
__export(exports_ContextMenu, {
  showContextMenu: () => showContextMenu,
  on: () => on2
});
var showContextMenu = (menu) => {
  const menuWithDefaults = menuConfigWithDefaults3(menu);
  ffi.request.showContextMenu({
    menuConfig: JSON.stringify(menuWithDefaults)
  });
};
var on2 = (name, handler) => {
  const specificName = `${name}`;
  eventEmitter_default.on(specificName, handler);
};
var menuConfigWithDefaults3 = (menu) => {
  return menu.map((item) => {
    if (item.type === "divider" || item.type === "separator") {
      return { type: "divider" };
    } else {
      const menuItem = item;
      const actionWithDataId = ffi.internal.serializeMenuAction(menuItem.action || "", menuItem.data);
      return {
        label: menuItem.label || roleLabelMap[menuItem.role] || "",
        type: menuItem.type || "normal",
        ...menuItem.role ? { role: menuItem.role } : { action: actionWithDataId },
        enabled: menuItem.enabled === false ? false : true,
        checked: Boolean(menuItem.checked),
        hidden: Boolean(menuItem.hidden),
        tooltip: menuItem.tooltip || undefined,
        ...menuItem.accelerator ? { accelerator: menuItem.accelerator } : {},
        ...menuItem.submenu ? { submenu: menuConfigWithDefaults3(menuItem.submenu) } : {}
      };
    }
  });
};

// ../../../node_modules/.bun/electrobun@1.14.4/node_modules/electrobun/dist/api/bun/index.ts
init_Paths();
init_BuildConfig();
await __promiseAll([
  init_Updater(),
  init_Utils(),
  init_Socket(),
  init_native()
]);
var Electrobun = {
  BrowserWindow,
  BrowserView,
  Tray,
  Updater,
  Utils: exports_Utils,
  ApplicationMenu: exports_ApplicationMenu,
  ContextMenu: exports_ContextMenu,
  GlobalShortcut,
  Screen,
  Session,
  BuildConfig,
  events: eventEmitter_default,
  PATHS: exports_Paths,
  Socket: exports_Socket
};
var bun_default = Electrobun;

// src/api-base.ts
var EXTERNAL_API_BASE_ENV_KEYS = [
  "MILADY_ELECTRON_TEST_API_BASE",
  "MILADY_ELECTRON_API_BASE",
  "MILADY_API_BASE_URL",
  "MILADY_API_BASE"
];
function normalizeApiBase(raw) {
  if (!raw)
    return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}
function resolveExternalApiBase(env) {
  const invalidSources = [];
  for (const key of EXTERNAL_API_BASE_ENV_KEYS) {
    const rawValue = env[key]?.trim();
    if (!rawValue)
      continue;
    const normalized = normalizeApiBase(rawValue);
    if (normalized) {
      return { base: normalized, source: key, invalidSources };
    }
    invalidSources.push(key);
  }
  return { base: null, source: null, invalidSources };
}
function pushApiBaseToRenderer(win, base, apiToken) {
  const trimmedToken = apiToken?.trim();
  const payload = { base, token: trimmedToken || undefined };
  try {
    const rpcSend = win.webview?.rpc?.send;
    rpcSend?.apiBaseUpdate?.(payload);
  } catch (err) {
    console.warn(`[ApiBase] Push failed:`, err);
  }
}

// src/index.ts
init_agent();

// src/native/desktop.ts
import fs3 from "fs";
import os3 from "os";
import path3 from "path";

// src/native/mac-window-effects.ts
import { dlopen as dlopen2, FFIType as FFIType2 } from "bun:ffi";
import { existsSync } from "fs";
import { join as join5 } from "path";
var _lib = undefined;
function loadLib() {
  const dylibPath = join5(import.meta.dir, "../libMacWindowEffects.dylib");
  if (!existsSync(dylibPath)) {
    console.warn(`[MacEffects] Dylib not found at ${dylibPath}. Run 'bun run build:native-effects'.`);
    return null;
  }
  try {
    return dlopen2(dylibPath, {
      enableWindowVibrancy: { args: [FFIType2.ptr], returns: FFIType2.bool },
      ensureWindowShadow: { args: [FFIType2.ptr], returns: FFIType2.bool },
      setWindowTrafficLightsPosition: {
        args: [FFIType2.ptr, FFIType2.f64, FFIType2.f64],
        returns: FFIType2.bool
      },
      setNativeWindowDragRegion: {
        args: [FFIType2.ptr, FFIType2.f64, FFIType2.f64],
        returns: FFIType2.bool
      },
      orderOutWindow: { args: [FFIType2.ptr], returns: FFIType2.bool },
      makeKeyAndOrderFrontWindow: {
        args: [FFIType2.ptr],
        returns: FFIType2.bool
      },
      isWindowKey: { args: [FFIType2.ptr], returns: FFIType2.bool }
    });
  } catch (err) {
    console.warn("[MacEffects] Failed to load dylib:", err);
    return null;
  }
}
function getLib() {
  if (process.platform !== "darwin")
    return null;
  if (_lib === undefined) {
    _lib = loadLib();
  }
  return _lib;
}
function enableVibrancy(ptr2) {
  return getLib()?.symbols.enableWindowVibrancy(ptr2) ?? false;
}
function ensureShadow(ptr2) {
  return getLib()?.symbols.ensureWindowShadow(ptr2) ?? false;
}
function setTrafficLightsPosition(ptr2, x, y) {
  return getLib()?.symbols.setWindowTrafficLightsPosition(ptr2, x, y) ?? false;
}
function setNativeDragRegion(ptr2, x, height) {
  return getLib()?.symbols.setNativeWindowDragRegion(ptr2, x, height) ?? false;
}
function orderOut(ptr2) {
  return getLib()?.symbols.orderOutWindow(ptr2) ?? false;
}
function makeKeyAndOrderFront(ptr2) {
  return getLib()?.symbols.makeKeyAndOrderFrontWindow(ptr2) ?? false;
}
function isKeyWindow(ptr2) {
  return getLib()?.symbols.isWindowKey(ptr2) ?? false;
}

// src/native/screencapture.ts
import fs2 from "fs";
import path2 from "path";
function isAllowedCaptureUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.protocol === "file:";
  } catch {
    return false;
  }
}
class ScreenCaptureManager {
  frameCaptureActive = false;
  frameCaptureTimer = null;
  frameCaptureWindow = null;
  mainWebview = null;
  mainWindow = null;
  captureTargetWebview = null;
  setSendToWebview(_fn) {}
  setMainWebview(webview) {
    this.mainWebview = webview;
  }
  setMainWindow(win) {
    this.mainWindow = win;
  }
  setCaptureTarget(webview) {
    this.captureTargetWebview = webview;
  }
  getActiveWebview() {
    return this.captureTargetWebview ?? this.mainWebview;
  }
  async getSources() {
    return {
      sources: [{ id: "screen:0", name: "Entire Screen", thumbnail: "" }],
      available: true
    };
  }
  async takeScreenshot() {
    return { available: false, reason: "Use startFrameCapture for streaming" };
  }
  async captureWindow(_options) {
    return { available: false, reason: "Use startFrameCapture for streaming" };
  }
  async startRecording() {
    return {
      available: false,
      reason: "Screen recording requires platform-specific integration"
    };
  }
  async stopRecording() {
    return { available: false };
  }
  async pauseRecording() {
    return { available: false };
  }
  async resumeRecording() {
    return { available: false };
  }
  async getRecordingState() {
    return { recording: false, duration: 0, paused: false };
  }
  async startFrameCapture(options) {
    if (this.frameCaptureActive)
      return { available: true };
    const fps = options?.fps ?? 10;
    const quality = options?.quality ?? 70;
    const apiBase = options?.apiBase ?? "http://localhost:2138";
    const endpointPath = options?.endpoint ?? "/api/stream/frame";
    const endpoint = `${apiBase}${endpointPath}`;
    const interval = Math.round(1000 / fps);
    this.frameCaptureActive = true;
    if (options?.gameUrl) {
      return this.startGameCapture(options.gameUrl, fps, quality, endpoint, interval);
    }
    return this.startWebviewCapture(fps, quality, endpoint, interval);
  }
  startWebviewCapture(_fps, quality, endpoint, interval) {
    const q = quality / 100;
    const captureScript = `(function(){
      return new Promise(function(resolve){
        var streamEl = document.querySelector('[data-stream-view]');
        if (!streamEl) { resolve(null); return; }
        var vrmCanvas = streamEl.querySelector('canvas');
        var bgStyle = window.getComputedStyle(streamEl).backgroundImage;
        var bgMatch = bgStyle.match(/url\\(["']?([^"')]+)["']?\\)/);
        var bgUrl = bgMatch ? bgMatch[1] : null;
        var out = document.createElement('canvas');
        out.width = 1280; out.height = 720;
        var ctx = out.getContext('2d');
        if (!ctx) { resolve(null); return; }
        function finish() {
          if (vrmCanvas) { try { ctx.drawImage(vrmCanvas, 0, 0, 1280, 720); } catch(e) {} }
          try { resolve(out.toDataURL('image/jpeg', ${q})); } catch(e) { resolve(null); }
        }
        if (bgUrl) {
          var img = new Image();
          img.onload = function(){ ctx.drawImage(img, 0, 0, 1280, 720); finish(); };
          img.onerror = function(){ ctx.fillStyle='#111'; ctx.fillRect(0,0,1280,720); finish(); };
          img.src = bgUrl;
        } else {
          ctx.fillStyle = '#111';
          ctx.fillRect(0, 0, 1280, 720);
          finish();
        }
      });
    })()`;
    let skipping = false;
    this.frameCaptureTimer = setInterval(async () => {
      if (!this.frameCaptureActive || skipping)
        return;
      skipping = true;
      try {
        const webview = this.getActiveWebview();
        const rpc = webview?.rpc?.requestProxy;
        const dataUrl = await rpc?.evaluateJavascriptWithResponse?.({ script: captureScript });
        if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image"))
          return;
        const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
        const body = Buffer.from(base64, "base64");
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "image/jpeg" },
          body
        }).catch(() => {});
      } catch {} finally {
        skipping = false;
      }
    }, interval);
    return { available: true };
  }
  async startGameCapture(gameUrl, _fps, quality, endpoint, interval) {
    if (!isAllowedCaptureUrl(gameUrl)) {
      return {
        available: false,
        reason: `gameUrl blocked: only localhost, 127.0.0.1, and file:// are permitted`
      };
    }
    try {
      const win = new BrowserWindow({
        title: "Milady Game Capture",
        url: gameUrl,
        frame: {
          x: -9999,
          y: -9999,
          width: 1280,
          height: 720
        }
      });
      this.frameCaptureWindow = win;
      const captureGameScript = `
        (function() {
          try {
            var el = document.querySelector('canvas') || document.querySelector('video');
            if (!el) return null;
            var c = document.createElement('canvas');
            c.width = ${1280};
            c.height = ${720};
            var ctx = c.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(el, 0, 0, c.width, c.height);
            return c.toDataURL('image/jpeg', ${quality / 100});
          } catch(e) { return null; }
        })()
      `;
      let skipping = false;
      this.frameCaptureTimer = setInterval(async () => {
        if (!this.frameCaptureActive || skipping)
          return;
        if (!this.frameCaptureWindow) {
          this.stopFrameCapture();
          return;
        }
        skipping = true;
        try {
          const captureRpc = this.frameCaptureWindow.webview.rpc;
          const dataUrl = await captureRpc?.requestProxy?.evaluateJavascriptWithResponse?.({
            script: captureGameScript
          });
          if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:"))
            return;
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, "");
          const body = Buffer.from(base64, "base64");
          fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "image/jpeg" },
            body
          }).catch(() => {});
        } catch {} finally {
          skipping = false;
        }
      }, interval);
      win.on("close", () => {
        this.frameCaptureActive = false;
        this.frameCaptureWindow = null;
        if (this.frameCaptureTimer) {
          clearInterval(this.frameCaptureTimer);
          this.frameCaptureTimer = null;
        }
      });
      return { available: true };
    } catch (err) {
      this.frameCaptureActive = false;
      return {
        available: false,
        reason: `Failed to create game capture window: ${String(err)}`
      };
    }
  }
  async stopFrameCapture() {
    this.frameCaptureActive = false;
    if (this.frameCaptureTimer) {
      clearInterval(this.frameCaptureTimer);
      this.frameCaptureTimer = null;
    }
    if (this.frameCaptureWindow) {
      try {
        this.frameCaptureWindow.close();
      } catch {}
      this.frameCaptureWindow = null;
    }
    return { available: true };
  }
  async isFrameCaptureActive() {
    return { active: this.frameCaptureActive };
  }
  async saveScreenshot(options) {
    const picturesDir = path2.join(os.homedir(), "Pictures");
    try {
      if (!fs2.existsSync(picturesDir)) {
        fs2.mkdirSync(picturesDir, { recursive: true });
      }
      const safeFilename = path2.basename(options.filename ?? "");
      const ext = path2.extname(safeFilename).toLowerCase();
      const allowedExts = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp"];
      const finalFilename = allowedExts.includes(ext) ? safeFilename : `screenshot-${Date.now()}.jpg`;
      const filePath = path2.join(picturesDir, finalFilename);
      const base64 = options.data.replace(/^data:[^;]+;base64,/, "");
      fs2.writeFileSync(filePath, Buffer.from(base64, "base64"));
      return { available: true, path: filePath };
    } catch {
      return { available: false };
    }
  }
  async switchSource(_options) {
    return { available: false };
  }
  dispose() {
    this.stopFrameCapture();
    this.mainWebview = null;
    this.mainWindow = null;
    this.captureTargetWebview = null;
  }
}
var screenCaptureManager = null;
function getScreenCaptureManager() {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager;
  }
  return screenCaptureManager;
}

// src/native/desktop.ts
var PATH_NAME_MAP = {
  home: exports_Utils.paths.home,
  appData: exports_Utils.paths.appData,
  userData: exports_Utils.paths.userData,
  userCache: exports_Utils.paths.userCache,
  userLogs: exports_Utils.paths.userLogs,
  temp: exports_Utils.paths.temp,
  cache: exports_Utils.paths.cache,
  logs: exports_Utils.paths.logs,
  config: exports_Utils.paths.config,
  documents: exports_Utils.paths.documents,
  downloads: exports_Utils.paths.downloads,
  desktop: exports_Utils.paths.desktop,
  pictures: exports_Utils.paths.pictures,
  music: exports_Utils.paths.music,
  videos: exports_Utils.paths.videos
};

class DesktopManager {
  mainWindow = null;
  tray = null;
  shortcuts = new Map;
  notificationCounter = 0;
  sendToWebview = null;
  _windowFocused = true;
  _windowHidden = false;
  _focusPoller = null;
  trayMenuItems = new Map;
  onBeforeQuit = null;
  _rendererUrl = null;
  _rendererPreload = null;
  _popoutWindow = null;
  setOnBeforeQuit(fn) {
    this.onBeforeQuit = fn;
  }
  setRendererConfig(url, preload) {
    this._rendererUrl = url;
    this._rendererPreload = preload;
  }
  setMainWindow(window) {
    this.mainWindow = window;
    this.setupWindowEvents();
  }
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  getWindow() {
    if (!this.mainWindow) {
      throw new Error("Main window not available");
    }
    return this.mainWindow;
  }
  send(message, payload) {
    if (this.sendToWebview) {
      this.sendToWebview(message, payload);
    }
  }
  async createTray(options) {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }
    const iconPath = this.resolveIconPath(options.icon);
    this.tray = new Tray({
      title: options.tooltip ?? options.title ?? "",
      image: iconPath
    });
    if (options.title && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }
    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }
    this.setupTrayEvents();
  }
  async updateTray(options) {
    if (!this.tray)
      return;
    if (options.icon) {
      const iconPath = this.resolveIconPath(options.icon);
      this.tray.setImage(iconPath);
    }
    if (options.title !== undefined && process.platform === "darwin") {
      this.tray.setTitle(options.title);
    }
    if (options.menu) {
      this.setTrayMenu({ menu: options.menu });
    }
  }
  async destroyTray() {
    if (this.tray) {
      this.tray.remove();
      this.tray = null;
    }
    this.trayMenuItems.clear();
  }
  setTrayMenu(options) {
    if (!this.tray)
      return;
    this.trayMenuItems.clear();
    this.indexMenuItems(options.menu);
    const template = this.buildMenuTemplate(options.menu);
    this.tray.setMenu(template);
  }
  indexMenuItems(items) {
    for (const item of items) {
      if (item.id) {
        this.trayMenuItems.set(item.id, item);
      }
      if (item.submenu) {
        this.indexMenuItems(item.submenu);
      }
    }
  }
  buildMenuTemplate(items) {
    return items.map((item) => {
      if (item.type === "separator") {
        return { type: "separator" };
      }
      const menuItem = {
        type: "normal",
        label: item.label ?? "",
        action: item.id
      };
      if (item.enabled === false) {
        menuItem.enabled = false;
      }
      if (item.submenu) {
        menuItem.submenu = this.buildMenuTemplate(item.submenu);
      }
      return menuItem;
    });
  }
  setupTrayEvents() {
    if (!this.tray)
      return;
    this.tray.on("tray-clicked", () => {
      this.send("desktopTrayClick", {
        x: 0,
        y: 0,
        button: "left",
        modifiers: { alt: false, shift: false, ctrl: false, meta: false }
      });
    });
    const triggerAgentRestart = () => {
      Promise.resolve().then(() => (init_agent(), exports_agent)).then(({ getAgentManager: getAgentManager2 }) => {
        getAgentManager2().restart().catch((err) => {
          console.error("[Desktop] Agent restart failed:", err);
        });
      });
    };
    bun_default.events.on("application-menu-clicked", (e) => {
      if (e?.data?.action === "restart-agent") {
        triggerAgentRestart();
      }
    });
    bun_default.events.on("context-menu-clicked", (action) => {
      if (action === "show") {
        this.mainWindow?.show();
        this.mainWindow?.focus();
      } else if (action === "restart-agent") {
        triggerAgentRestart();
      } else if (action === "quit") {
        this.onBeforeQuit?.();
        process.exit(0);
      }
      const menuItem = this.trayMenuItems.get(action);
      if (menuItem) {
        this.send("desktopTrayMenuClick", {
          itemId: menuItem.id,
          checked: menuItem.type === "checkbox" ? !menuItem.checked : menuItem.checked
        });
      }
    });
  }
  async registerShortcut(options) {
    if (this.shortcuts.has(options.id)) {
      const existing = this.shortcuts.get(options.id);
      if (existing) {
        GlobalShortcut.unregister(existing.accelerator);
      }
    }
    try {
      GlobalShortcut.register(options.accelerator, () => {
        this.send("desktopShortcutPressed", {
          id: options.id,
          accelerator: options.accelerator
        });
      });
      this.shortcuts.set(options.id, options);
      return { success: true };
    } catch {
      return { success: false };
    }
  }
  async unregisterShortcut(options) {
    const shortcut = this.shortcuts.get(options.id);
    if (shortcut) {
      GlobalShortcut.unregister(shortcut.accelerator);
      this.shortcuts.delete(options.id);
    }
  }
  async unregisterAllShortcuts() {
    GlobalShortcut.unregisterAll();
    this.shortcuts.clear();
  }
  async isShortcutRegistered(options) {
    return { registered: GlobalShortcut.isRegistered(options.accelerator) };
  }
  async setAutoLaunch(options) {
    const appPath = process.execPath;
    if (process.platform === "darwin") {
      await this.setAutoLaunchMac(options.enabled, appPath);
    } else if (process.platform === "linux") {
      this.setAutoLaunchLinux(options.enabled, appPath);
    } else if (process.platform === "win32") {
      await this.setAutoLaunchWin(options.enabled, appPath);
    } else {
      console.warn(`[DesktopManager] setAutoLaunch: unsupported platform ${process.platform}`);
    }
  }
  async getAutoLaunchStatus() {
    if (process.platform === "darwin") {
      const plistPath = this.getMacLaunchAgentPath();
      return { enabled: fs3.existsSync(plistPath), openAsHidden: false };
    }
    if (process.platform === "linux") {
      const desktopPath = this.getLinuxAutostartPath();
      return { enabled: fs3.existsSync(desktopPath), openAsHidden: false };
    }
    if (process.platform === "win32") {
      const enabled = await this.getAutoLaunchStatusWin();
      return { enabled, openAsHidden: false };
    }
    return { enabled: false, openAsHidden: false };
  }
  getMacLaunchAgentPath() {
    return path3.join(os3.homedir(), "Library", "LaunchAgents", "com.miladyai.milady.plist");
  }
  async setAutoLaunchMac(enabled, appPath) {
    const plistPath = this.getMacLaunchAgentPath();
    if (enabled) {
      const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.miladyai.milady</string>
  <key>ProgramArguments</key>
  <array>
    <string>${appPath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>
`;
      const dir = path3.dirname(plistPath);
      if (!fs3.existsSync(dir)) {
        fs3.mkdirSync(dir, { recursive: true });
      }
      fs3.writeFileSync(plistPath, plistContent, "utf8");
      const proc = Bun.spawn(["launchctl", "load", plistPath], {
        stdout: "pipe",
        stderr: "pipe"
      });
      await proc.exited;
    } else {
      if (fs3.existsSync(plistPath)) {
        const proc = Bun.spawn(["launchctl", "unload", plistPath], {
          stdout: "pipe",
          stderr: "pipe"
        });
        await proc.exited;
        fs3.unlinkSync(plistPath);
      }
    }
  }
  getLinuxAutostartPath() {
    return path3.join(os3.homedir(), ".config", "autostart", "milady.desktop");
  }
  setAutoLaunchLinux(enabled, appPath) {
    const desktopPath = this.getLinuxAutostartPath();
    if (enabled) {
      const desktopContent = `[Desktop Entry]
Type=Application
Name=Milady
Exec=${appPath}
X-GNOME-Autostart-enabled=true
`;
      const dir = path3.dirname(desktopPath);
      if (!fs3.existsSync(dir)) {
        fs3.mkdirSync(dir, { recursive: true });
      }
      fs3.writeFileSync(desktopPath, desktopContent, "utf8");
    } else {
      if (fs3.existsSync(desktopPath)) {
        fs3.unlinkSync(desktopPath);
      }
    }
  }
  WIN_REG_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run";
  async setAutoLaunchWin(enabled, appPath) {
    if (enabled) {
      const proc = Bun.spawn([
        "reg",
        "add",
        this.WIN_REG_KEY,
        "/v",
        "Milady",
        "/t",
        "REG_SZ",
        "/d",
        appPath,
        "/f"
      ], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
    } else {
      const proc = Bun.spawn(["reg", "delete", this.WIN_REG_KEY, "/v", "Milady", "/f"], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
    }
  }
  async getAutoLaunchStatusWin() {
    try {
      const proc = Bun.spawn(["reg", "query", this.WIN_REG_KEY, "/v", "Milady"], { stdout: "pipe", stderr: "pipe" });
      const [stdout] = await Promise.all([
        new Response(proc.stdout).text(),
        proc.exited
      ]);
      return stdout.includes("Milady");
    } catch {
      return false;
    }
  }
  async openStreamPopout(apiBase) {
    if (!this._rendererUrl) {
      console.warn("[Desktop] openStreamPopout: rendererUrl not set");
      return { ok: false };
    }
    if (this._popoutWindow) {
      try {
        this._popoutWindow.focus();
        return { ok: true };
      } catch {
        this._popoutWindow = null;
      }
    }
    const qs = apiBase ? `popout=stream&apiBase=${encodeURIComponent(apiBase)}` : "popout=stream";
    const popoutUrl = `${this._rendererUrl}/?${qs}`;
    const popoutWin = new BrowserWindow({
      title: "Milady Stream",
      url: popoutUrl,
      preload: this._rendererPreload,
      frame: { width: 1280, height: 720 }
    });
    this._popoutWindow = popoutWin;
    const popoutWebview = popoutWin.webview;
    if (popoutWebview) {
      getScreenCaptureManager().setCaptureTarget(popoutWebview);
    }
    const popoutRpc = popoutWin.webview?.rpc;
    const self = this;
    popoutRpc?.setRequestHandler?.({
      streamSetPopoutBounds: async (params) => {
        const bounds = params;
        self._popoutWindow?.setPosition(bounds.x, bounds.y);
        self._popoutWindow?.setSize(bounds.width, bounds.height);
      },
      desktopSetAlwaysOnTop: async (params) => {
        const { flag } = params;
        self._popoutWindow?.setAlwaysOnTop(flag);
      }
    });
    popoutWin.on("close", () => {
      this._popoutWindow = null;
      getScreenCaptureManager().setCaptureTarget(null);
    });
    return { ok: true };
  }
  async setPopoutBounds(options) {
    if (!this._popoutWindow)
      return;
    this._popoutWindow.setPosition(options.x, options.y);
    this._popoutWindow.setSize(options.width, options.height);
  }
  async setWindowOptions(options) {
    const win = this.getWindow();
    if (options.width !== undefined || options.height !== undefined) {
      const { width: currentW, height: currentH } = win.getSize();
      win.setSize(options.width ?? currentW, options.height ?? currentH);
    }
    if (options.x !== undefined || options.y !== undefined) {
      const { x: currentX, y: currentY } = win.getPosition();
      win.setPosition(options.x ?? currentX, options.y ?? currentY);
    }
    if (options.alwaysOnTop !== undefined) {
      win.setAlwaysOnTop(options.alwaysOnTop);
    }
    if (options.fullscreen !== undefined) {
      win.setFullScreen(options.fullscreen);
    }
    if (options.opacity !== undefined) {}
    if (options.title !== undefined) {
      win.setTitle(options.title);
    }
  }
  async getWindowBounds() {
    const win = this.getWindow();
    const { x, y } = win.getPosition();
    const { width, height } = win.getSize();
    return { x, y, width, height };
  }
  async setWindowBounds(options) {
    const win = this.getWindow();
    win.setPosition(options.x, options.y);
    win.setSize(options.width, options.height);
  }
  async minimizeWindow() {
    this.getWindow().minimize();
  }
  async maximizeWindow() {
    this.getWindow().maximize();
  }
  async unmaximizeWindow() {
    this.getWindow().unmaximize();
  }
  async closeWindow() {
    this.getWindow().close();
  }
  async showWindow() {
    const win = this.getWindow();
    const ptr2 = win.ptr;
    if (ptr2 && process.platform === "darwin") {
      makeKeyAndOrderFront(ptr2);
    } else {
      win.show();
      win.focus();
    }
    this._windowHidden = false;
  }
  async hideWindow() {
    const win = this.getWindow();
    const ptr2 = win.ptr;
    if (ptr2 && process.platform === "darwin") {
      orderOut(ptr2);
    } else {
      win.minimize();
    }
    this._windowHidden = true;
  }
  async focusWindow() {
    this.getWindow().focus();
  }
  async isWindowMaximized() {
    return { maximized: this.getWindow().isMaximized() };
  }
  async isWindowMinimized() {
    return { minimized: this.getWindow().isMinimized() };
  }
  async isWindowVisible() {
    if (this._windowHidden)
      return { visible: false };
    const win = this.getWindow();
    return { visible: !win.isMinimized() };
  }
  async isWindowFocused() {
    return { focused: this._windowFocused };
  }
  async setAlwaysOnTop(options) {
    this.getWindow().setAlwaysOnTop(options.flag);
  }
  async setFullscreen(options) {
    this.getWindow().setFullScreen(options.flag);
  }
  async setOpacity(_options) {}
  setupWindowEvents() {
    if (!this.mainWindow)
      return;
    this.mainWindow.on("focus", () => {
      this._windowFocused = true;
      this.send("desktopWindowFocus");
    });
    this.mainWindow.on("blur", () => {
      this._windowFocused = false;
      this.send("desktopWindowBlur");
    });
    this.mainWindow.on("close", () => {
      this.send("desktopWindowClose");
    });
    this.mainWindow.on("resize", () => {
      if (this.mainWindow?.isMaximized()) {
        this.send("desktopWindowMaximize");
      }
    });
    let wasMaximized = false;
    this.mainWindow.on("move", () => {
      const isMaximized = this.mainWindow?.isMaximized() ?? false;
      if (wasMaximized && !isMaximized) {
        this.send("desktopWindowUnmaximize");
      }
      wasMaximized = isMaximized;
    });
    if (process.platform === "darwin") {
      this._startFocusPoller();
    }
  }
  _startFocusPoller() {
    if (this._focusPoller)
      return;
    this._focusPoller = setInterval(() => {
      const win = this.mainWindow;
      if (!win)
        return;
      const ptr2 = win.ptr;
      if (!ptr2)
        return;
      const focused = isKeyWindow(ptr2);
      if (focused !== this._windowFocused) {
        this._windowFocused = focused;
        if (!focused) {
          this.send("desktopWindowBlur");
        }
      }
    }, 500);
  }
  async showNotification(options) {
    const id = `notification_${++this.notificationCounter}`;
    exports_Utils.showNotification({
      title: options.title,
      body: options.body,
      subtitle: undefined,
      silent: options.silent
    });
    return { id };
  }
  async closeNotification(_options) {}
  async getPowerState() {
    return {
      onBattery: false,
      idleState: "unknown",
      idleTime: 0
    };
  }
  async quit() {
    exports_Utils.quit();
  }
  async relaunch() {
    console.warn("[DesktopManager] relaunch is not natively supported \u2014 calling quit()");
    exports_Utils.quit();
  }
  async getVersion() {
    let version = "0.0.0";
    try {
      version = await Updater.localInfo.version();
    } catch {}
    return {
      version,
      name: "Milady",
      runtime: `electrobun/${Bun.version}`
    };
  }
  async isPackaged() {
    return {
      packaged: !process.env.ELECTROBUN_DEV
    };
  }
  async getPath(options) {
    const mapped = PATH_NAME_MAP[options.name];
    if (typeof mapped === "function") {
      return { path: mapped() };
    }
    if (typeof mapped === "string") {
      return { path: mapped };
    }
    console.warn(`[DesktopManager] Unknown path name "${options.name}", falling back to userData`);
    return { path: exports_Utils.paths.userData };
  }
  async writeToClipboard(options) {
    if (options.text) {
      exports_Utils.clipboardWriteText(options.text);
    } else if (options.image) {
      exports_Utils.clipboardWriteImage(options.image);
    }
  }
  async readFromClipboard() {
    const text = exports_Utils.clipboardReadText();
    let hasImage = false;
    try {
      const imgData = exports_Utils.clipboardReadImage();
      hasImage = !!imgData && imgData.length > 0;
    } catch {}
    return {
      text: text || undefined,
      hasImage
    };
  }
  async clearClipboard() {
    exports_Utils.clipboardClear();
  }
  async openExternal(options) {
    const url = typeof options.url === "string" ? options.url.trim() : "";
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error(`Blocked openExternal for non-http(s) URL: ${parsed.protocol}`);
      }
    } catch (err) {
      if (err instanceof TypeError) {
        throw new Error(`Invalid URL passed to openExternal: ${url}`);
      }
      throw err;
    }
    exports_Utils.openExternal(url);
  }
  async showItemInFolder(options) {
    const p = typeof options.path === "string" ? options.path.trim() : "";
    if (!p || !path3.isAbsolute(p)) {
      throw new Error("showItemInFolder requires an absolute path");
    }
    exports_Utils.showItemInFolder(p);
  }
  async beep() {}
  resolveIconPath(iconPath) {
    if (path3.isAbsolute(iconPath)) {
      return iconPath;
    }
    const assetsPath = path3.join(import.meta.dir, "../../assets", iconPath);
    if (fs3.existsSync(assetsPath)) {
      return assetsPath;
    }
    const cwdPath = path3.join(process.cwd(), iconPath);
    if (fs3.existsSync(cwdPath)) {
      return cwdPath;
    }
    return iconPath;
  }
  dispose() {
    if (this._focusPoller) {
      clearInterval(this._focusPoller);
      this._focusPoller = null;
    }
    this.unregisterAllShortcuts();
    this.destroyTray();
    this.trayMenuItems.clear();
    this.sendToWebview = null;
  }
}
var desktopManager = null;
function getDesktopManager() {
  if (!desktopManager) {
    desktopManager = new DesktopManager;
  }
  return desktopManager;
}

// src/native/permissions-darwin.ts
import { existsSync as existsSync2 } from "fs";
import os4 from "os";
import path4 from "path";
import { dlopen as dlopen3, FFIType as FFIType3 } from "bun:ffi";
var _nativeLib = null;
function getNativeLib() {
  if (_nativeLib)
    return _nativeLib;
  try {
    const dylibPath = path4.join(import.meta.dir, "../libMacWindowEffects.dylib");
    const { symbols } = dlopen3(dylibPath, {
      requestAccessibilityPermission: { args: [], returns: FFIType3.bool },
      checkAccessibilityPermission: { args: [], returns: FFIType3.bool },
      requestScreenRecordingPermission: { args: [], returns: FFIType3.bool },
      checkScreenRecordingPermission: { args: [], returns: FFIType3.bool },
      checkMicrophonePermission: { args: [], returns: FFIType3.i32 },
      checkCameraPermission: { args: [], returns: FFIType3.i32 },
      requestCameraPermission: { args: [], returns: FFIType3.void },
      requestMicrophonePermission: { args: [], returns: FFIType3.void }
    });
    _nativeLib = symbols;
    return _nativeLib;
  } catch (err) {
    console.warn("[Permissions] Failed to load native dylib:", err);
    return null;
  }
}
var APP_BUNDLE_ID = "com.miladyai.milady";
function checkMicrophonePermission() {
  const lib = getNativeLib();
  if (!lib)
    return "not-determined";
  const val = lib.checkMicrophonePermission();
  if (val === 2)
    return "granted";
  if (val === 1 || val === 3)
    return "denied";
  return "not-determined";
}
async function checkScreenRecordingPermission() {
  try {
    const tccDb = path4.join(os4.homedir(), "Library/Application Support/com.apple.TCC/TCC.db");
    if (!existsSync2(tccDb))
      return "not-determined";
    const proc = Bun.spawn([
      "sqlite3",
      tccDb,
      `SELECT auth_value FROM access WHERE service='kTCCServiceScreenCapture' AND client='${APP_BUNDLE_ID}'`
    ], { stdout: "pipe", stderr: "pipe" });
    const [stdout] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited
    ]);
    const val = stdout.trim();
    if (val === "2")
      return "granted";
    if (val === "0")
      return "denied";
    return "not-determined";
  } catch {
    return "not-determined";
  }
}
async function checkPermission(id) {
  switch (id) {
    case "accessibility": {
      const lib = getNativeLib();
      const granted = lib ? lib.checkAccessibilityPermission() : (() => {
        return false;
      })();
      return { status: granted ? "granted" : "not-determined", canRequest: true };
    }
    case "screen-recording": {
      const lib = getNativeLib();
      if (lib) {
        const granted = lib.checkScreenRecordingPermission();
        return { status: granted ? "granted" : "not-determined", canRequest: true };
      }
      const status = await checkScreenRecordingPermission();
      return { status, canRequest: true };
    }
    case "microphone": {
      const status = checkMicrophonePermission();
      return { status, canRequest: true };
    }
    case "camera": {
      const lib = getNativeLib();
      const val = lib?.checkCameraPermission() ?? 0;
      const status = val === 2 ? "granted" : val === 1 || val === 3 ? "denied" : "not-determined";
      return { status, canRequest: true };
    }
    case "shell": {
      return { status: "granted", canRequest: false };
    }
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
async function requestPermission(id) {
  switch (id) {
    case "accessibility": {
      const lib = getNativeLib();
      if (lib) {
        const trusted = lib.requestAccessibilityPermission();
        if (!trusted) {
          await openPrivacySettings(id);
        }
        return { status: trusted ? "granted" : "not-determined", canRequest: true };
      }
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "screen-recording": {
      const lib = getNativeLib();
      if (lib) {
        const granted = lib.requestScreenRecordingPermission();
        if (!granted)
          await openPrivacySettings(id);
        return { status: granted ? "granted" : "not-determined", canRequest: true };
      }
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "camera": {
      const lib = getNativeLib();
      lib?.requestCameraPermission();
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "microphone": {
      const lib = getNativeLib();
      lib?.requestMicrophonePermission();
      await openPrivacySettings(id);
      return checkPermission(id);
    }
    case "shell":
      return { status: "granted", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
async function openPrivacySettings(id) {
  const paneMap = {
    accessibility: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
    "screen-recording": "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    microphone: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
    camera: "x-apple.systempreferences:com.apple.preference.security?Privacy_Camera"
  };
  const url = paneMap[id];
  if (url) {
    const proc = Bun.spawn(["open", url], { stdout: "pipe", stderr: "pipe" });
    await proc.exited;
  }
}

// src/native/permissions-linux.ts
async function checkPermission2(id) {
  switch (id) {
    case "microphone":
    case "camera":
    case "shell":
      return { status: "granted", canRequest: false };
    case "accessibility":
    case "screen-recording":
      return { status: "not-applicable", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
async function requestPermission2(id) {
  return checkPermission2(id);
}
async function openPrivacySettings2(_id) {}

// src/native/permissions-shared.ts
var SYSTEM_PERMISSIONS = [
  {
    id: "accessibility",
    name: "Accessibility",
    description: "Control mouse, keyboard, and interact with other applications",
    icon: "cursor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "browser"]
  },
  {
    id: "screen-recording",
    name: "Screen Recording",
    description: "Capture screen content for screenshots and vision",
    icon: "monitor",
    platforms: ["darwin"],
    requiredForFeatures: ["computeruse", "vision"]
  },
  {
    id: "microphone",
    name: "Microphone",
    description: "Voice input for talk mode and speech recognition",
    icon: "mic",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["talkmode", "voice"]
  },
  {
    id: "camera",
    name: "Camera",
    description: "Video input for vision and video capture",
    icon: "camera",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["camera", "vision"]
  },
  {
    id: "shell",
    name: "Shell Access",
    description: "Execute terminal commands and scripts",
    icon: "terminal",
    platforms: ["darwin", "win32", "linux"],
    requiredForFeatures: ["shell"]
  }
];
var PERMISSION_MAP = new Map(SYSTEM_PERMISSIONS.map((p) => [p.id, p]));
function isPermissionApplicable(id, platform2) {
  const def = PERMISSION_MAP.get(id);
  return def ? def.platforms.includes(platform2) : false;
}

// src/native/permissions-win32.ts
async function checkPermission3(id) {
  switch (id) {
    case "microphone":
    case "camera":
      return { status: "granted", canRequest: true };
    case "shell":
      return { status: "granted", canRequest: false };
    case "accessibility":
    case "screen-recording":
      return { status: "not-applicable", canRequest: false };
    default:
      return { status: "not-applicable", canRequest: false };
  }
}
async function requestPermission3(id) {
  return checkPermission3(id);
}
async function openPrivacySettings3(id) {
  const settingsMap = {
    microphone: "ms-settings:privacy-microphone",
    camera: "ms-settings:privacy-webcam"
  };
  const uri = settingsMap[id];
  if (uri) {
    try {
      Bun.spawn(["cmd", "/c", "start", uri], {
        stdout: "ignore",
        stderr: "ignore"
      });
    } catch {}
  }
}

// src/native/permissions.ts
var platform2 = process.platform;
var DEFAULT_CACHE_TIMEOUT_MS = 30000;

class PermissionManager {
  sendToWebview = null;
  cache = new Map;
  cacheTimeoutMs = DEFAULT_CACHE_TIMEOUT_MS;
  shellEnabled = true;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  setShellEnabled(enabled) {
    this.shellEnabled = enabled;
    this.cache.delete("shell");
    this.sendToWebview?.("permissionsChanged", { id: "shell" });
  }
  isShellEnabled() {
    return this.shellEnabled;
  }
  getFromCache(id) {
    const cached = this.cache.get(id);
    if (!cached)
      return null;
    if (Date.now() - cached.lastChecked >= this.cacheTimeoutMs)
      return null;
    return cached;
  }
  clearCache() {
    this.cache.clear();
  }
  async checkPermission(id, forceRefresh = false) {
    if (!isPermissionApplicable(id, platform2)) {
      const state2 = {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false
      };
      this.cache.set(id, state2);
      return state2;
    }
    if (id === "shell" && !this.shellEnabled) {
      const state2 = {
        id,
        status: "denied",
        lastChecked: Date.now(),
        canRequest: false
      };
      this.cache.set(id, state2);
      return state2;
    }
    if (!forceRefresh) {
      const cached = this.getFromCache(id);
      if (cached)
        return cached;
    }
    let result;
    switch (platform2) {
      case "darwin":
        result = await checkPermission(id);
        break;
      case "win32":
        result = await checkPermission3(id);
        break;
      case "linux":
        result = await checkPermission2(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }
    const state = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest
    };
    this.cache.set(id, state);
    return state;
  }
  async checkAllPermissions(forceRefresh = false) {
    const results = await Promise.all(SYSTEM_PERMISSIONS.map((p) => this.checkPermission(p.id, forceRefresh)));
    return results.reduce((acc, state) => {
      acc[state.id] = state;
      return acc;
    }, {});
  }
  async requestPermission(id) {
    if (!isPermissionApplicable(id, platform2)) {
      return {
        id,
        status: "not-applicable",
        lastChecked: Date.now(),
        canRequest: false
      };
    }
    let result;
    switch (platform2) {
      case "darwin":
        result = await requestPermission(id);
        break;
      case "win32":
        result = await requestPermission3(id);
        break;
      case "linux":
        result = await requestPermission2(id);
        break;
      default:
        result = { status: "not-applicable", canRequest: false };
    }
    const state = {
      id,
      status: result.status,
      lastChecked: Date.now(),
      canRequest: result.canRequest
    };
    this.cache.set(id, state);
    this.sendToWebview?.("permissionsChanged", { id });
    return state;
  }
  async openSettings(id) {
    switch (platform2) {
      case "darwin":
        await openPrivacySettings(id);
        break;
      case "win32":
        await openPrivacySettings3(id);
        break;
      case "linux":
        await openPrivacySettings2(id);
        break;
    }
  }
  async checkFeaturePermissions(featureId) {
    const requiredPerms = SYSTEM_PERMISSIONS.filter((p) => p.requiredForFeatures.includes(featureId)).map((p) => p.id);
    const states = await Promise.all(requiredPerms.map((id) => this.checkPermission(id)));
    const missing = states.filter((s) => s.status !== "granted" && s.status !== "not-applicable").map((s) => s.id);
    return { granted: missing.length === 0, missing };
  }
  dispose() {
    this.cache.clear();
    this.sendToWebview = null;
  }
}
var permissionManager = null;
function getPermissionManager() {
  if (!permissionManager) {
    permissionManager = new PermissionManager;
  }
  return permissionManager;
}

// src/native/index.ts
init_agent();

// src/native/camera.ts
class CameraManager {
  sendToWebview = null;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async getDevices() {
    return { devices: [], available: true };
  }
  async startPreview(_options) {
    return { available: true };
  }
  async stopPreview() {}
  async switchCamera(_options) {
    return { available: true };
  }
  async capturePhoto() {
    return { available: true };
  }
  async startRecording() {
    return { available: true };
  }
  async stopRecording() {
    return { available: true };
  }
  async getRecordingState() {
    return { recording: false, duration: 0 };
  }
  async checkPermissions() {
    return { status: "prompt" };
  }
  async requestPermissions() {
    return { status: "prompt" };
  }
  dispose() {
    this.sendToWebview = null;
  }
}
var cameraManager = null;
function getCameraManager() {
  if (!cameraManager) {
    cameraManager = new CameraManager;
  }
  return cameraManager;
}

// src/native/canvas.ts
import * as fs4 from "fs";
import * as os5 from "os";
function isAllowedCanvasUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  } catch {
    return false;
  }
}
var canvasCounter = 0;

class CanvasManager {
  sendToWebview = null;
  windows = new Map;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async createWindow(options) {
    const id = `canvas_${++canvasCounter}`;
    const win = new BrowserWindow({
      title: options.title ?? "Milady Canvas",
      url: options.url ?? null,
      frame: {
        x: options.x ?? 100,
        y: options.y ?? 100,
        width: options.width ?? 800,
        height: options.height ?? 600
      },
      transparent: options.transparent ?? false,
      sandbox: true,
      partition: "canvas-isolated"
    });
    const canvas = {
      id,
      window: win,
      url: options.url ?? "",
      title: options.title ?? "Milady Canvas"
    };
    this.windows.set(id, canvas);
    win.on("close", () => {
      this.windows.delete(id);
      this.sendToWebview?.("canvasWindowEvent", {
        windowId: id,
        event: "closed"
      });
    });
    win.on("focus", () => {
      this.sendToWebview?.("canvasWindowEvent", {
        windowId: id,
        event: "focus"
      });
    });
    return { id };
  }
  async destroyWindow(options) {
    const canvas = this.windows.get(options.id);
    if (canvas) {
      canvas.window.close();
      this.windows.delete(options.id);
    }
  }
  async navigate(options) {
    const canvas = this.windows.get(options.id);
    if (!canvas)
      return { available: false };
    const url = options.url ?? "";
    let allowed = false;
    try {
      const parsed = new URL(url);
      allowed = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.protocol === "file:";
    } catch {
      allowed = false;
    }
    if (!allowed) {
      console.warn(`[Canvas] Blocked navigation to disallowed URL: ${url}`);
      return { available: false };
    }
    canvas.window.webview.loadURL(url);
    canvas.url = url;
    return { available: true };
  }
  async eval(options) {
    const canvas = this.windows.get(options.id);
    if (!canvas)
      return null;
    const currentUrl = canvas.window.webview?.url ?? "";
    const isInternal = isAllowedCanvasUrl(currentUrl) || currentUrl.startsWith("file://") || currentUrl === "" || currentUrl === "about:blank";
    if (!isInternal) {
      throw new Error(`canvas:eval blocked \u2014 canvas ${options.id} has external URL: ${currentUrl}`);
    }
    try {
      const evalRpc = canvas.window.webview.rpc;
      return await evalRpc?.requestProxy?.evaluateJavascriptWithResponse?.({
        script: options.script
      });
    } catch (err) {
      console.error(`[Canvas] eval error in ${options.id}:`, err);
      return null;
    }
  }
  async snapshot(options) {
    const canvas = this.windows.get(options.id);
    if (!canvas)
      return null;
    if (process.platform !== "darwin") {
      return null;
    }
    try {
      const pos = canvas.window.getPosition();
      const size = canvas.window.getSize();
      const x = pos.x ?? 0;
      const y = pos.y ?? 0;
      const w = size.width;
      const h = size.height;
      if (x < -1000 || y < -1000)
        return null;
      const tmpPath = `${os5.tmpdir()}/milady-canvas-snapshot-${Date.now()}.png`;
      const proc = Bun.spawn([
        "screencapture",
        "-x",
        "-R",
        `${x},${y},${w},${h}`,
        "-t",
        "png",
        tmpPath
      ], { stdout: "pipe", stderr: "pipe" });
      await proc.exited;
      if (!fs4.existsSync(tmpPath))
        return null;
      const buf = fs4.readFileSync(tmpPath);
      fs4.unlinkSync(tmpPath);
      if (buf.length < 100)
        return null;
      return { data: buf.toString("base64") };
    } catch {
      return null;
    }
  }
  async a2uiPush(options) {
    const canvas = this.windows.get(options.id);
    if (!canvas)
      return;
    const script = `
      if (window.miladyA2UI && typeof window.miladyA2UI.push === 'function') {
        window.miladyA2UI.push(${JSON.stringify(options.payload)});
      }
    `;
    try {
      const pushRpc = canvas.window.webview.rpc;
      await pushRpc?.requestProxy?.evaluateJavascriptWithResponse?.({ script });
    } catch {}
  }
  async a2uiReset(options) {
    const canvas = this.windows.get(options.id);
    if (!canvas)
      return;
    const script = `
      if (window.miladyA2UI && typeof window.miladyA2UI.reset === 'function') {
        window.miladyA2UI.reset();
      }
    `;
    try {
      const resetRpc = canvas.window.webview.rpc;
      await resetRpc?.requestProxy?.evaluateJavascriptWithResponse?.({
        script
      });
    } catch {}
  }
  async show(options) {
    this.windows.get(options.id)?.window.show();
  }
  async hide(options) {
    const win = this.windows.get(options.id)?.window;
    if (win) {
      win.setPosition(-99999, -99999);
    }
  }
  async resize(options) {
    this.windows.get(options.id)?.window.setSize(options.width, options.height);
  }
  async focus(options) {
    this.windows.get(options.id)?.window.focus();
  }
  async getBounds(options) {
    const win = this.windows.get(options.id)?.window;
    if (!win)
      return { x: 0, y: 0, width: 0, height: 0 };
    const pos = win.getPosition();
    const size = win.getSize();
    return { x: pos.x, y: pos.y, width: size.width, height: size.height };
  }
  async setBounds(options) {
    const win = this.windows.get(options.id)?.window;
    if (!win)
      return;
    win.setPosition(options.x, options.y);
    win.setSize(options.width, options.height);
  }
  async listWindows() {
    const result = [];
    for (const [id, canvas] of this.windows) {
      const pos = canvas.window.getPosition();
      const size = canvas.window.getSize();
      result.push({
        id,
        url: canvas.url,
        bounds: { x: pos.x, y: pos.y, width: size.width, height: size.height },
        title: canvas.title
      });
    }
    return { windows: result };
  }
  dispose() {
    for (const canvas of this.windows.values()) {
      try {
        canvas.window.close();
      } catch {}
    }
    this.windows.clear();
    this.sendToWebview = null;
  }
}
var canvasManager = null;
function getCanvasManager() {
  if (!canvasManager) {
    canvasManager = new CanvasManager;
  }
  return canvasManager;
}

// src/native/gateway.ts
import { EventEmitter as EventEmitter2 } from "events";
var bonjourModule = null;
async function loadDiscoveryModule() {
  const packages = ["bonjour-service", "bonjour", "mdns-js"];
  for (const pkg of packages) {
    try {
      bonjourModule = await import(pkg);
      console.log(`[Gateway] Loaded ${pkg} module`);
      return true;
    } catch {}
  }
  console.warn("[Gateway] No mDNS/Bonjour module available. Install bonjour-service for local discovery.");
  return false;
}

class GatewayDiscovery extends EventEmitter2 {
  discoveredGateways = new Map;
  browser = null;
  isDiscovering = false;
  moduleLoaded = false;
  sendToWebview = null;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async startDiscovery(options) {
    if (this.isDiscovering) {
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Already discovering"
      };
    }
    if (!this.moduleLoaded) {
      this.moduleLoaded = await loadDiscoveryModule();
    }
    if (!bonjourModule) {
      return {
        gateways: [],
        status: "Discovery unavailable (no mDNS module)"
      };
    }
    const serviceType = options?.serviceType ?? "_milady._tcp";
    this.discoveredGateways.clear();
    this.isDiscovering = true;
    try {
      const factory = typeof bonjourModule === "function" ? bonjourModule : bonjourModule.default;
      if (!factory) {
        return { gateways: [], status: "Discovery module not initialized" };
      }
      const bonjour = factory();
      const type = serviceType.replace(/^_/, "").replace(/\._tcp$/, "");
      this.browser = bonjour.find({ type });
      this.browser.on("up", (service) => {
        this.handleServiceFound(service);
      });
      this.browser.on("down", (service) => {
        this.handleServiceLost(service);
      });
      if (options?.timeout) {
        setTimeout(() => this.stopDiscovery(), options.timeout);
      }
      return {
        gateways: Array.from(this.discoveredGateways.values()),
        status: "Discovery started"
      };
    } catch (error) {
      this.isDiscovering = false;
      return {
        gateways: [],
        status: error instanceof Error ? error.message : "Discovery failed"
      };
    }
  }
  handleServiceFound(service) {
    const txt = service.txt ?? {};
    const stableId = txt.id ?? `${service.name}-${service.host}:${service.port}`;
    const tlsEnabled = txt.protocol === "wss" || txt.tlsEnabled === "true" || txt.tls === "true";
    const gatewayPort = this.parseNumber(txt.gatewayPort) ?? service.port;
    const canvasPort = this.parseNumber(txt.canvasPort);
    const endpoint = {
      stableId,
      name: service.name,
      host: service.addresses?.[0] ?? service.host,
      port: service.port,
      lanHost: service.host,
      tailnetDns: txt.tailnetDns,
      gatewayPort,
      canvasPort,
      tlsEnabled,
      tlsFingerprintSha256: txt.tlsFingerprintSha256,
      isLocal: true
    };
    const isUpdate = this.discoveredGateways.has(stableId);
    this.discoveredGateways.set(stableId, endpoint);
    this.emit(isUpdate ? "updated" : "discovered", endpoint);
    this.sendToWebview?.("gatewayDiscovery", {
      type: isUpdate ? "updated" : "found",
      gateway: endpoint
    });
  }
  handleServiceLost(service) {
    for (const [id, gateway] of this.discoveredGateways) {
      if (service.name && gateway.name === service.name || service.host && gateway.host === service.host || service.port && gateway.port === service.port) {
        this.discoveredGateways.delete(id);
        this.emit("lost", gateway);
        this.sendToWebview?.("gatewayDiscovery", {
          type: "lost",
          gateway
        });
        break;
      }
    }
  }
  async stopDiscovery() {
    if (!this.isDiscovering)
      return;
    this.browser?.stop();
    this.browser = null;
    this.isDiscovering = false;
  }
  getDiscoveredGateways() {
    return Array.from(this.discoveredGateways.values());
  }
  isDiscoveryActive() {
    return this.isDiscovering;
  }
  parseNumber(value) {
    if (!value)
      return;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  dispose() {
    this.stopDiscovery();
    this.discoveredGateways.clear();
    this.removeAllListeners();
    this.sendToWebview = null;
  }
}
var gatewayDiscovery = null;
function getGatewayDiscovery() {
  if (!gatewayDiscovery) {
    gatewayDiscovery = new GatewayDiscovery;
  }
  return gatewayDiscovery;
}

// src/native/location.ts
var IP_GEO_SERVICES = [
  "http://ip-api.com/json/?fields=lat,lon,status",
  "https://ipapi.co/json/"
];

class LocationManager {
  sendToWebview = null;
  lastKnown = null;
  watchIntervals = new Map;
  watchCounter = 0;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async getCurrentPosition() {
    for (const url of IP_GEO_SERVICES) {
      try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!resp.ok)
          continue;
        const data = await resp.json();
        const lat = data.lat ?? data.latitude;
        const lon = data.lon ?? data.longitude;
        if (typeof lat !== "number" || typeof lon !== "number")
          continue;
        const position = {
          latitude: lat,
          longitude: lon,
          accuracy: 5000,
          timestamp: Date.now()
        };
        this.lastKnown = position;
        return position;
      } catch {}
    }
    return null;
  }
  async watchPosition(options) {
    const watchId = `watch_${++this.watchCounter}`;
    const interval = options?.interval ?? 60000;
    const timer = setInterval(async () => {
      const pos = await this.getCurrentPosition();
      if (pos) {
        this.sendToWebview?.("locationUpdate", pos);
      }
    }, interval);
    this.watchIntervals.set(watchId, timer);
    return { watchId };
  }
  async clearWatch(options) {
    const timer = this.watchIntervals.get(options.watchId);
    if (timer) {
      clearInterval(timer);
      this.watchIntervals.delete(options.watchId);
    }
  }
  async getLastKnownLocation() {
    return this.lastKnown;
  }
  dispose() {
    for (const timer of this.watchIntervals.values()) {
      clearInterval(timer);
    }
    this.watchIntervals.clear();
    this.sendToWebview = null;
  }
}
var locationManager = null;
function getLocationManager() {
  if (!locationManager) {
    locationManager = new LocationManager;
  }
  return locationManager;
}

// src/native/swabble.ts
import fs6 from "fs";
import os6 from "os";
import path6 from "path";

// src/native/whisper.ts
import fs5 from "fs";
import path5 from "path";
function resolveWhisperPath(envVar, relativeFromMeta, relativeFromCwd) {
  const envValue = process.env[envVar];
  if (envValue && fs5.existsSync(envValue)) {
    return envValue;
  }
  const fromMeta = path5.resolve(import.meta.dir, relativeFromMeta);
  if (fs5.existsSync(fromMeta))
    return fromMeta;
  return path5.resolve(process.cwd(), relativeFromCwd);
}
var WHISPER_BIN = resolveWhisperPath("MILADY_WHISPER_BIN", "../../../../node_modules/whisper-node/lib/whisper.cpp/main", "node_modules/whisper-node/lib/whisper.cpp/main");
var WHISPER_MODEL = resolveWhisperPath("MILADY_WHISPER_MODEL", "../../../../node_modules/whisper-node/lib/whisper.cpp/models/ggml-base.en.bin", "node_modules/whisper-node/lib/whisper.cpp/models/ggml-base.en.bin");
function isWhisperBinaryAvailable() {
  return fs5.existsSync(WHISPER_BIN) && fs5.existsSync(WHISPER_MODEL);
}
function writeWavFile(filePath, pcmFloat32, sampleRate = 16000, channels = 1) {
  const numSamples = pcmFloat32.length;
  const bytesPerSample = 2;
  const dataSize = numSamples * bytesPerSample;
  const bufferSize = 44 + dataSize;
  const buffer = Buffer.allocUnsafe(bufferSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0;i < numSamples; i++) {
    const s = Math.max(-1, Math.min(1, pcmFloat32[i]));
    const int16 = s < 0 ? s * 32768 : s * 32767;
    buffer.writeInt16LE(Math.round(int16), 44 + i * 2);
  }
  fs5.writeFileSync(filePath, buffer);
}
function parseWhisperOutput(stdout) {
  const lines = stdout.split(`
`);
  const segments = [];
  const textParts = [];
  const linePattern = /\[\s*(\d+:\d+:\d+\.\d+)\s*-->\s*(\d+:\d+:\d+\.\d+)\s*\]\s*(.*)/;
  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match)
      continue;
    const start = parseTimestamp(match[1]);
    const end = parseTimestamp(match[2]);
    const text = match[3].trim();
    if (text) {
      segments.push({ text, start, end });
      textParts.push(text);
    }
  }
  return {
    text: textParts.join(" "),
    segments
  };
}
function parseTimestamp(ts) {
  const parts = ts.split(":");
  const hours = Number.parseInt(parts[0], 10);
  const minutes = Number.parseInt(parts[1], 10);
  const secs = Number.parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + secs;
}
async function transcribeBunSpawn(audioPath) {
  if (!isWhisperBinaryAvailable()) {
    return null;
  }
  try {
    const proc = Bun.spawn([WHISPER_BIN, "-m", WHISPER_MODEL, "-f", audioPath, "-l", "en"], {
      stdout: "pipe",
      stderr: "pipe",
      cwd: path5.dirname(WHISPER_BIN)
    });
    const [stdout] = await Promise.all([
      new Response(proc.stdout).text(),
      proc.exited
    ]);
    return parseWhisperOutput(stdout);
  } catch (err) {
    console.error("[Whisper] transcribeBunSpawn failed:", err);
    return null;
  }
}
var whisperAvailable = false;
var whisperModule = null;
async function tryLoadWhisper() {
  const packages = [
    "whisper-node",
    "@nicksellen/whisper-node",
    "whisper.cpp",
    "@nicksellen/whispercpp"
  ];
  for (const pkg of packages) {
    try {
      whisperModule = await import(pkg);
      console.log(`[Whisper] Loaded ${pkg}`);
      whisperAvailable = true;
      return true;
    } catch {}
  }
  console.warn("[Whisper] No whisper module available in Bun runtime. STT will fall back to Web Speech API in renderer.");
  return false;
}
tryLoadWhisper();
function isWhisperAvailable() {
  return whisperAvailable || isWhisperBinaryAvailable();
}

// src/native/swabble.ts
class WakeWordGate {
  triggers;
  minPostTriggerGap;
  minCommandLength;
  constructor(config) {
    this.triggers = config.triggers.map((t) => t.toLowerCase().trim());
    this.minPostTriggerGap = config.minPostTriggerGap;
    this.minCommandLength = config.minCommandLength;
  }
  updateConfig(config) {
    if (config.triggers) {
      this.triggers = config.triggers.map((t) => t.toLowerCase().trim());
    }
    if (config.minPostTriggerGap !== undefined) {
      this.minPostTriggerGap = config.minPostTriggerGap;
    }
    if (config.minCommandLength !== undefined) {
      this.minCommandLength = config.minCommandLength;
    }
  }
  match(result) {
    const segments = result.segments;
    if (segments.length === 0)
      return null;
    const words = [];
    for (const segment of segments) {
      if (segment.tokens) {
        for (const token of segment.tokens) {
          const text = token.text.trim().toLowerCase();
          if (text) {
            words.push({ text, start: token.start, end: token.end });
          }
        }
      } else {
        const segWords = segment.text.split(/\s+/).filter((w) => w.trim());
        const duration = segment.end - segment.start;
        const wordDuration = duration / Math.max(segWords.length, 1);
        for (let i = 0;i < segWords.length; i++) {
          words.push({
            text: segWords[i].toLowerCase(),
            start: segment.start + i * wordDuration,
            end: segment.start + (i + 1) * wordDuration
          });
        }
      }
    }
    for (const trigger of this.triggers) {
      const triggerWords = trigger.split(/\s+/);
      const triggerMatch = this.findTriggerMatch(words, triggerWords);
      if (!triggerMatch)
        continue;
      const { triggerEndIndex, triggerEndTime } = triggerMatch;
      const commandWords = words.slice(triggerEndIndex + 1);
      if (commandWords.length < this.minCommandLength)
        continue;
      const firstCommandTime = commandWords[0].start;
      const postGap = firstCommandTime - triggerEndTime;
      if (postGap < this.minPostTriggerGap)
        continue;
      const command = commandWords.map((w) => w.text).join(" ");
      return { trigger, command, transcript: result.text, postGap };
    }
    return null;
  }
  findTriggerMatch(words, triggerWords) {
    for (let i = 0;i <= words.length - triggerWords.length; i++) {
      let matches = true;
      for (let j = 0;j < triggerWords.length; j++) {
        if (!this.fuzzyMatch(words[i + j].text, triggerWords[j])) {
          matches = false;
          break;
        }
      }
      if (matches) {
        const endIndex = i + triggerWords.length - 1;
        return {
          triggerEndIndex: endIndex,
          triggerEndTime: words[endIndex].end
        };
      }
    }
    return null;
  }
  fuzzyMatch(word, target) {
    if (word === target)
      return true;
    const variations = {
      milady: ["melody", "milady", "my lady", "malady"],
      alexa: ["alexia", "alexis"],
      hey: ["hay", "hi"],
      ok: ["okay", "o.k."]
    };
    const targetVariations = variations[target] ?? [];
    return targetVariations.includes(word);
  }
}
var AUDIO_BUFFER_THRESHOLD_BYTES = 16000 * 3 * 4;

class SwabbleManager {
  sendToWebview = null;
  listening = false;
  config = {
    triggers: ["hey milady", "milady"],
    minPostTriggerGap: 0.45,
    minCommandLength: 1,
    enabled: true
  };
  wakeGate = new WakeWordGate(this.config);
  audioBuffer = [];
  audioBufferSize = 0;
  processing = false;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  async start(params) {
    if (!isWhisperBinaryAvailable()) {
      return {
        started: false,
        error: "whisper.cpp binary not found. Install whisper-node and compile the binary."
      };
    }
    if (params?.config) {
      this.config = { ...this.config, ...params.config };
      this.wakeGate.updateConfig(this.config);
    }
    this.listening = true;
    this.audioBuffer = [];
    this.audioBufferSize = 0;
    this.sendToWebview?.("swabble:stateChange", { state: "listening" });
    return { started: true };
  }
  async stop() {
    this.listening = false;
    this.audioBuffer = [];
    this.audioBufferSize = 0;
    this.sendToWebview?.("swabble:stateChange", { state: "idle" });
  }
  async isListening() {
    return { listening: this.listening };
  }
  async getConfig() {
    return { ...this.config };
  }
  async updateConfig(updates) {
    Object.assign(this.config, updates);
    this.wakeGate.updateConfig(this.config);
  }
  async isWhisperAvailableCheck() {
    return { available: isWhisperBinaryAvailable() };
  }
  async audioChunk(options) {
    if (!this.config.enabled)
      return;
    if (!this.listening)
      return;
    if (!isWhisperBinaryAvailable()) {
      this.sendToWebview?.("swabble:audioChunkPush", { data: options.data });
      return;
    }
    const chunkBuffer = Buffer.from(options.data, "base64");
    this.audioBuffer.push(chunkBuffer);
    this.audioBufferSize += chunkBuffer.length;
    if (this.audioBufferSize >= AUDIO_BUFFER_THRESHOLD_BYTES && !this.processing) {
      await this.processBuffer();
    }
  }
  async processBuffer() {
    if (this.processing || this.audioBuffer.length === 0)
      return;
    this.processing = true;
    const allBuffers = [...this.audioBuffer];
    const combined = Buffer.concat(allBuffers);
    const overlapBytes = Math.floor(combined.byteLength / 2);
    const overlapBuffer = combined.subarray(combined.byteLength - overlapBytes);
    this.audioBuffer = [Buffer.from(overlapBuffer)];
    this.audioBufferSize = overlapBytes;
    try {
      const numSamples = combined.byteLength >>> 2;
      const float32 = new Float32Array(numSamples);
      const dv = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);
      for (let i = 0;i < numSamples; i++) {
        float32[i] = dv.getFloat32(i * 4, true);
      }
      const tmpPath = path6.join(os6.tmpdir(), `milady-swabble-${Date.now()}.wav`);
      writeWavFile(tmpPath, float32, 16000, 1);
      const result = await transcribeBunSpawn(tmpPath);
      try {
        fs6.unlinkSync(tmpPath);
      } catch {}
      if (!result)
        return;
      const match = this.wakeGate.match(result);
      if (match) {
        this.sendToWebview?.("swabble:wakeWord", {
          wakeWord: match.trigger,
          command: match.command,
          transcript: match.transcript,
          postGap: match.postGap
        });
      }
    } catch (err) {
      console.error("[Swabble] processBuffer error:", err);
    } finally {
      this.processing = false;
    }
  }
  dispose() {
    this.listening = false;
    this.audioBuffer = [];
    this.audioBufferSize = 0;
    this.sendToWebview = null;
  }
}
var swabbleManager = null;
function getSwabbleManager() {
  if (!swabbleManager) {
    swabbleManager = new SwabbleManager;
  }
  return swabbleManager;
}

// src/native/talkmode.ts
import fs7 from "fs";
import os7 from "os";
import path7 from "path";
var TALKMODE_AUDIO_BUFFER_THRESHOLD = 16000 * 3 * 4;

class TalkModeManager {
  sendToWebview = null;
  state = "idle";
  speaking = false;
  config = {
    engine: isWhisperAvailable() ? "whisper" : "web",
    modelSize: "base",
    language: "en"
  };
  _audioBuffer = [];
  _audioBufferSize = 0;
  _processing = false;
  setSendToWebview(fn) {
    this.sendToWebview = fn;
  }
  setState(newState) {
    this.state = newState;
    this.sendToWebview?.("talkmodeStateChanged", { state: newState });
  }
  async start() {
    const whisperOk = isWhisperAvailable();
    if (!whisperOk && this.config.engine === "whisper") {
      this.config.engine = "web";
    }
    this.setState("listening");
    return {
      available: true,
      reason: whisperOk ? undefined : "Using Web Speech API (Whisper unavailable in Bun)"
    };
  }
  async stop() {
    this.setState("idle");
    this.speaking = false;
    this._audioBuffer = [];
    this._audioBufferSize = 0;
  }
  async speak(options) {
    const apiKey = process.env.ELEVEN_LABS_API_KEY?.trim();
    if (apiKey) {
      await this._speakElevenLabs(options, apiKey);
    } else {
      await this._speakSystem(options.text);
    }
  }
  async _speakSystem(text) {
    this.speaking = true;
    this.setState("speaking");
    try {
      let proc;
      if (process.platform === "darwin") {
        proc = Bun.spawn(["say", text], { stderr: "pipe" });
      } else if (process.platform === "linux") {
        proc = Bun.spawn(["espeak", text], { stderr: "pipe" });
      } else {
        proc = Bun.spawn([
          "powershell",
          "-NoProfile",
          "-Command",
          "Add-Type -AssemblyName System.Speech; $s = New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.Speak($env:MILADY_TTS_TEXT)"
        ], {
          stderr: "pipe",
          env: { ...process.env, MILADY_TTS_TEXT: text }
        });
      }
      await proc.exited;
      this.sendToWebview?.("talkmodeSpeakComplete");
    } catch (err) {
      console.error("[TalkMode] System TTS error:", err);
      this.setState("error");
    } finally {
      this.speaking = false;
      if (this.state !== "error") {
        this.setState("idle");
      }
    }
  }
  async _speakElevenLabs(options, apiKey) {
    this.speaking = true;
    this.setState("speaking");
    try {
      const voiceId = options.directive?.voiceId ?? this.config.voiceId ?? "21m00Tcm4TlvDq8ikWAM";
      const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          text: options.text,
          model_id: options.directive?.modelId ?? "eleven_v3",
          voice_settings: {
            stability: options.directive?.stability ?? 0.5,
            similarity_boost: options.directive?.similarity ?? 0.75
          }
        })
      });
      if (!resp.ok) {
        console.error(`[TalkMode] ElevenLabs API error: ${resp.status} ${resp.statusText}`);
        this.setState("error");
        return;
      }
      if (resp.body) {
        const reader = resp.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done)
            break;
          const base64 = Buffer.from(value).toString("base64");
          this.sendToWebview?.("talkmodeAudioChunkPush", { data: base64 });
        }
      }
      this.sendToWebview?.("talkmodeSpeakComplete");
    } catch (err) {
      console.error("[TalkMode] ElevenLabs TTS error:", err);
      this.setState("error");
    } finally {
      this.speaking = false;
      if (this.state !== "error") {
        this.setState("idle");
      }
    }
  }
  async stopSpeaking() {
    this.speaking = false;
    this.setState("idle");
  }
  async getState() {
    return { state: this.state };
  }
  async isEnabled() {
    return { enabled: true };
  }
  async isSpeaking() {
    return { speaking: this.speaking };
  }
  async getWhisperInfo() {
    return {
      available: isWhisperAvailable(),
      modelSize: this.config.modelSize
    };
  }
  async isWhisperAvailableCheck() {
    return { available: isWhisperAvailable() };
  }
  async updateConfig(config) {
    Object.assign(this.config, config);
  }
  async audioChunk(options) {
    if (this.state !== "listening" && this.state !== "speaking")
      return;
    const chunkBuffer = Buffer.from(options.data, "base64");
    this._audioBuffer.push(chunkBuffer);
    this._audioBufferSize += chunkBuffer.length;
    if (this._audioBufferSize >= TALKMODE_AUDIO_BUFFER_THRESHOLD && !this._processing) {
      await this._processBuffer();
    }
  }
  async _processBuffer() {
    if (this._processing || this._audioBuffer.length === 0)
      return;
    this._processing = true;
    const allBuffers = [...this._audioBuffer];
    const combined = Buffer.concat(allBuffers);
    this._audioBuffer = [];
    this._audioBufferSize = 0;
    try {
      const numSamples = combined.byteLength >>> 2;
      const float32 = new Float32Array(numSamples);
      const dv = new DataView(combined.buffer, combined.byteOffset, combined.byteLength);
      for (let i = 0;i < numSamples; i++) {
        float32[i] = dv.getFloat32(i * 4, true);
      }
      const tmpPath = path7.join(os7.tmpdir(), `milady-talkmode-${Date.now()}.wav`);
      writeWavFile(tmpPath, float32, 16000, 1);
      const result = await transcribeBunSpawn(tmpPath);
      try {
        fs7.unlinkSync(tmpPath);
      } catch {}
      if (!result || !result.text.trim())
        return;
      this.sendToWebview?.("talkmode:transcript", {
        text: result.text,
        segments: result.segments.map((s) => ({
          text: s.text,
          start: s.start,
          end: s.end
        }))
      });
    } catch (err) {
      console.error("[TalkMode] _processBuffer error:", err);
    } finally {
      this._processing = false;
    }
  }
  dispose() {
    this.speaking = false;
    this.state = "idle";
    this._audioBuffer = [];
    this._audioBufferSize = 0;
    this.sendToWebview = null;
  }
}
var talkModeManager = null;
function getTalkModeManager() {
  if (!talkModeManager) {
    talkModeManager = new TalkModeManager;
  }
  return talkModeManager;
}

// src/native/index.ts
function initializeNativeModules(mainWindow, sendToWebview) {
  const desktop = getDesktopManager();
  desktop.setMainWindow(mainWindow);
  desktop.setSendToWebview(sendToWebview);
  desktop.setOnBeforeQuit(disposeNativeModules);
  getAgentManager().setSendToWebview(sendToWebview);
  getCameraManager().setSendToWebview(sendToWebview);
  getCanvasManager().setSendToWebview(sendToWebview);
  getGatewayDiscovery().setSendToWebview(sendToWebview);
  getLocationManager().setSendToWebview(sendToWebview);
  getPermissionManager().setSendToWebview(sendToWebview);
  const screencapture = getScreenCaptureManager();
  screencapture.setSendToWebview(sendToWebview);
  screencapture.setMainWebview(mainWindow.webview);
  screencapture.setMainWindow(mainWindow);
  getSwabbleManager().setSendToWebview(sendToWebview);
  getTalkModeManager().setSendToWebview(sendToWebview);
}
function disposeNativeModules() {
  getAgentManager().dispose();
  getCameraManager().dispose();
  getCanvasManager().dispose();
  getDesktopManager().dispose();
  getGatewayDiscovery().dispose();
  getLocationManager().dispose();
  getPermissionManager().dispose();
  getScreenCaptureManager().dispose();
  getSwabbleManager().dispose();
  getTalkModeManager().dispose();
}

// src/rpc-handlers.ts
init_agent();
var pipState = { enabled: false };
async function syncPermissionsToRestApi() {
  const port = getAgentManager().getPort();
  if (!port)
    return;
  try {
    const permissions = await getPermissionManager().checkAllPermissions();
    await fetch(`http://localhost:${port}/api/permissions/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions })
    });
  } catch {}
}
function registerRpcHandlers(rpc, sendToWebview) {
  if (!rpc) {
    console.error("[RPC] No RPC instance provided");
    return;
  }
  const agent = getAgentManager();
  const camera = getCameraManager();
  const canvas = getCanvasManager();
  const desktop = getDesktopManager();
  const gateway = getGatewayDiscovery();
  const location = getLocationManager();
  const permissions = getPermissionManager();
  const screencapture = getScreenCaptureManager();
  const swabble = getSwabbleManager();
  const talkmode = getTalkModeManager();
  rpc?.setRequestHandler?.({
    agentStart: async () => agent.start(),
    agentStop: async () => {
      await agent.stop();
      return { ok: true };
    },
    agentRestart: async () => agent.restart(),
    agentStatus: async () => agent.getStatus(),
    desktopCreateTray: async (params) => desktop.createTray(params),
    desktopUpdateTray: async (params) => desktop.updateTray(params),
    desktopDestroyTray: async () => desktop.destroyTray(),
    desktopSetTrayMenu: async (params) => desktop.setTrayMenu(params),
    desktopRegisterShortcut: async (params) => desktop.registerShortcut(params),
    desktopUnregisterShortcut: async (params) => desktop.unregisterShortcut(params),
    desktopUnregisterAllShortcuts: async () => desktop.unregisterAllShortcuts(),
    desktopIsShortcutRegistered: async (params) => desktop.isShortcutRegistered(params),
    desktopSetAutoLaunch: async (params) => desktop.setAutoLaunch(params),
    desktopGetAutoLaunchStatus: async () => desktop.getAutoLaunchStatus(),
    desktopSetWindowOptions: async (params) => desktop.setWindowOptions(params),
    desktopGetWindowBounds: async () => desktop.getWindowBounds(),
    desktopSetWindowBounds: async (params) => desktop.setWindowBounds(params),
    desktopMinimizeWindow: async () => desktop.minimizeWindow(),
    desktopMaximizeWindow: async () => desktop.maximizeWindow(),
    desktopUnmaximizeWindow: async () => desktop.unmaximizeWindow(),
    desktopCloseWindow: async () => desktop.closeWindow(),
    desktopShowWindow: async () => desktop.showWindow(),
    desktopHideWindow: async () => desktop.hideWindow(),
    desktopFocusWindow: async () => desktop.focusWindow(),
    desktopIsWindowMaximized: async () => desktop.isWindowMaximized(),
    desktopIsWindowMinimized: async () => desktop.isWindowMinimized(),
    desktopIsWindowVisible: async () => desktop.isWindowVisible(),
    desktopIsWindowFocused: async () => desktop.isWindowFocused(),
    desktopSetAlwaysOnTop: async (params) => desktop.setAlwaysOnTop(params),
    desktopSetFullscreen: async (params) => desktop.setFullscreen(params),
    desktopSetOpacity: async (params) => desktop.setOpacity(params),
    desktopShowNotification: async (params) => desktop.showNotification(params),
    desktopCloseNotification: async (params) => desktop.closeNotification(params),
    desktopGetPowerState: async () => desktop.getPowerState(),
    desktopQuit: async () => desktop.quit(),
    desktopRelaunch: async () => desktop.relaunch(),
    desktopGetVersion: async () => desktop.getVersion(),
    desktopIsPackaged: async () => desktop.isPackaged(),
    desktopGetPath: async (params) => desktop.getPath(params),
    desktopBeep: async () => desktop.beep(),
    desktopWriteToClipboard: async (params) => desktop.writeToClipboard(params),
    desktopReadFromClipboard: async () => desktop.readFromClipboard(),
    desktopClearClipboard: async () => desktop.clearClipboard(),
    desktopOpenExternal: async (params) => desktop.openExternal(params),
    desktopShowItemInFolder: async (params) => desktop.showItemInFolder(params),
    gatewayStartDiscovery: async (params) => gateway.startDiscovery(params || undefined),
    gatewayStopDiscovery: async () => gateway.stopDiscovery(),
    gatewayIsDiscovering: async () => ({
      isDiscovering: gateway.isDiscoveryActive()
    }),
    gatewayGetDiscoveredGateways: async () => ({
      gateways: gateway.getDiscoveredGateways()
    }),
    permissionsCheck: async (params) => permissions.checkPermission(params.id, params.forceRefresh),
    permissionsCheckFeature: async (params) => permissions.checkFeaturePermissions(params.featureId),
    permissionsRequest: async (params) => {
      const result = await permissions.requestPermission(params.id);
      syncPermissionsToRestApi();
      return result;
    },
    permissionsGetAll: async (params) => {
      const result = await permissions.checkAllPermissions(params?.forceRefresh);
      syncPermissionsToRestApi();
      return result;
    },
    permissionsGetPlatform: async () => process.platform,
    permissionsIsShellEnabled: async () => permissions.isShellEnabled(),
    permissionsSetShellEnabled: async (params) => {
      permissions.setShellEnabled(params.enabled);
      return permissions.checkPermission("shell");
    },
    permissionsClearCache: async () => permissions.clearCache(),
    permissionsOpenSettings: async (params) => permissions.openSettings(params.id),
    locationGetCurrentPosition: async () => location.getCurrentPosition(),
    locationWatchPosition: async (params) => location.watchPosition(params),
    locationClearWatch: async (params) => location.clearWatch(params),
    locationGetLastKnownLocation: async () => location.getLastKnownLocation(),
    cameraGetDevices: async () => camera.getDevices(),
    cameraStartPreview: async (params) => camera.startPreview(params),
    cameraStopPreview: async () => camera.stopPreview(),
    cameraSwitchCamera: async (params) => camera.switchCamera(params),
    cameraCapturePhoto: async () => camera.capturePhoto(),
    cameraStartRecording: async () => camera.startRecording(),
    cameraStopRecording: async () => camera.stopRecording(),
    cameraGetRecordingState: async () => camera.getRecordingState(),
    cameraCheckPermissions: async () => camera.checkPermissions(),
    cameraRequestPermissions: async () => camera.requestPermissions(),
    canvasCreateWindow: async (params) => canvas.createWindow(params),
    canvasDestroyWindow: async (params) => canvas.destroyWindow(params),
    canvasNavigate: async (params) => canvas.navigate(params),
    canvasEval: async (params) => canvas.eval(params),
    canvasSnapshot: async (params) => canvas.snapshot(params),
    canvasA2uiPush: async (params) => canvas.a2uiPush(params),
    canvasA2uiReset: async (params) => canvas.a2uiReset(params),
    canvasShow: async (params) => canvas.show(params),
    canvasHide: async (params) => canvas.hide(params),
    canvasResize: async (params) => canvas.resize(params),
    canvasFocus: async (params) => canvas.focus(params),
    canvasGetBounds: async (params) => canvas.getBounds(params),
    canvasSetBounds: async (params) => canvas.setBounds(params),
    canvasListWindows: async () => canvas.listWindows(),
    screencaptureGetSources: async () => screencapture.getSources(),
    screencaptureTakeScreenshot: async () => screencapture.takeScreenshot(),
    screencaptureCaptureWindow: async (params) => screencapture.captureWindow(params),
    screencaptureStartRecording: async () => screencapture.startRecording(),
    screencaptureStopRecording: async () => screencapture.stopRecording(),
    screencapturePauseRecording: async () => screencapture.pauseRecording(),
    screencaptureResumeRecording: async () => screencapture.resumeRecording(),
    screencaptureGetRecordingState: async () => screencapture.getRecordingState(),
    screencaptureStartFrameCapture: async (params) => screencapture.startFrameCapture(params),
    screencaptureStopFrameCapture: async () => screencapture.stopFrameCapture(),
    screencaptureIsFrameCaptureActive: async () => screencapture.isFrameCaptureActive(),
    screencaptureSaveScreenshot: async (params) => screencapture.saveScreenshot(params),
    screencaptureSwitchSource: async (params) => screencapture.switchSource(params),
    screencaptureSetCaptureTarget: async (_params) => {
      screencapture.setCaptureTarget(null);
      return { available: true };
    },
    swabbleStart: async (params) => swabble.start(params),
    swabbleStop: async () => swabble.stop(),
    swabbleIsListening: async () => swabble.isListening(),
    swabbleGetConfig: async () => swabble.getConfig(),
    swabbleUpdateConfig: async (params) => swabble.updateConfig(params),
    swabbleIsWhisperAvailable: async () => swabble.isWhisperAvailableCheck(),
    swabbleAudioChunk: async (params) => swabble.audioChunk(params),
    talkmodeStart: async () => talkmode.start(),
    talkmodeStop: async () => talkmode.stop(),
    talkmodeSpeak: async (params) => talkmode.speak(params),
    talkmodeStopSpeaking: async () => talkmode.stopSpeaking(),
    talkmodeGetState: async () => talkmode.getState(),
    talkmodeIsEnabled: async () => talkmode.isEnabled(),
    talkmodeIsSpeaking: async () => talkmode.isSpeaking(),
    talkmodeGetWhisperInfo: async () => talkmode.getWhisperInfo(),
    talkmodeIsWhisperAvailable: async () => talkmode.isWhisperAvailableCheck(),
    talkmodeUpdateConfig: async (params) => talkmode.updateConfig(params),
    talkmodeAudioChunk: async (params) => talkmode.audioChunk(params),
    contextMenuAskAgent: async (params) => {
      sendToWebview("contextMenu:askAgent", { text: params.text });
    },
    contextMenuCreateSkill: async (params) => {
      sendToWebview("contextMenu:createSkill", { text: params.text });
    },
    contextMenuQuoteInChat: async (params) => {
      sendToWebview("contextMenu:quoteInChat", { text: params.text });
    },
    contextMenuSaveAsCommand: async (params) => {
      sendToWebview("contextMenu:saveAsCommand", { text: params.text });
    },
    lifoGetPipState: async () => pipState,
    lifoSetPip: async (params) => {
      pipState = params;
      if (params.enabled) {
        desktop.setAlwaysOnTop({ flag: true });
      } else {
        desktop.setAlwaysOnTop({ flag: false });
      }
    },
    streamOpenPopout: async (params) => desktop.openStreamPopout(params?.apiBase),
    streamSetPopoutBounds: async (params) => desktop.setPopoutBounds(params)
  });
  console.log("[RPC] All handlers registered");
}

// src/rpc-schema.ts
var PUSH_CHANNEL_TO_RPC_MESSAGE = {
  "agent:status": "agentStatusUpdate",
  "gateway:discovery": "gatewayDiscovery",
  "permissions:changed": "permissionsChanged",
  "desktop:trayMenuClick": "desktopTrayMenuClick",
  "desktop:trayClick": "desktopTrayClick",
  "desktop:trayDoubleClick": "desktopTrayDoubleClick",
  "desktop:trayRightClick": "desktopTrayRightClick",
  "desktop:shortcutPressed": "desktopShortcutPressed",
  "desktop:windowFocus": "desktopWindowFocus",
  "desktop:windowBlur": "desktopWindowBlur",
  "desktop:windowMaximize": "desktopWindowMaximize",
  "desktop:windowUnmaximize": "desktopWindowUnmaximize",
  "desktop:windowMinimize": "desktopWindowMinimize",
  "desktop:windowRestore": "desktopWindowRestore",
  "desktop:windowClose": "desktopWindowClose",
  "desktop:notificationClick": "desktopNotificationClick",
  "desktop:notificationAction": "desktopNotificationAction",
  "desktop:notificationReply": "desktopNotificationReply",
  "desktop:powerSuspend": "desktopPowerSuspend",
  "desktop:powerResume": "desktopPowerResume",
  "desktop:powerOnAC": "desktopPowerOnAC",
  "desktop:powerOnBattery": "desktopPowerOnBattery",
  "canvas:windowEvent": "canvasWindowEvent",
  "talkmode:audioChunkPush": "talkmodeAudioChunkPush",
  "talkmode:stateChanged": "talkmodeStateChanged",
  "talkmode:speakComplete": "talkmodeSpeakComplete",
  "talkmode:transcript": "talkmodeTranscript",
  "swabble:wakeWord": "swabbleWakeWord",
  "swabble:stateChange": "swabbleStateChanged",
  "swabble:audioChunkPush": "swabbleAudioChunkPush",
  "contextMenu:askAgent": "contextMenuAskAgent",
  "contextMenu:createSkill": "contextMenuCreateSkill",
  "contextMenu:quoteInChat": "contextMenuQuoteInChat",
  "contextMenu:saveAsCommand": "contextMenuSaveAsCommand",
  apiBaseUpdate: "apiBaseUpdate",
  shareTargetReceived: "shareTargetReceived",
  "location:update": "locationUpdate",
  "desktop:updateAvailable": "desktopUpdateAvailable",
  "desktop:updateReady": "desktopUpdateReady"
};
var RPC_MESSAGE_TO_PUSH_CHANNEL = Object.fromEntries(Object.entries(PUSH_CHANNEL_TO_RPC_MESSAGE).map(([k, v]) => [v, k]));

// src/index.ts
function setupApplicationMenu() {
  exports_ApplicationMenu.setApplicationMenu([
    {
      label: "Milady",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { label: "Restart Agent", action: "restart-agent" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" },
        { role: "redo" },
        { type: "separator" },
        { role: "cut" },
        { role: "copy" },
        { role: "paste" },
        { role: "selectAll" }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" }
      ]
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        { role: "zoom" },
        { type: "separator" },
        { role: "front" }
      ]
    }
  ]);
}
var MAC_TRAFFIC_LIGHTS_X = 14;
var MAC_TRAFFIC_LIGHTS_Y = 12;
var MAC_NATIVE_DRAG_REGION_X = 92;
var MAC_NATIVE_DRAG_REGION_HEIGHT = 40;
function applyMacOSWindowEffects(win) {
  if (process.platform !== "darwin")
    return;
  const ptr2 = win.ptr;
  if (!ptr2) {
    console.warn("[MacEffects] win.ptr unavailable \u2014 skipping native effects");
    return;
  }
  enableVibrancy(ptr2);
  ensureShadow(ptr2);
  const alignButtons = () => setTrafficLightsPosition(ptr2, MAC_TRAFFIC_LIGHTS_X, MAC_TRAFFIC_LIGHTS_Y);
  const alignDragRegion = () => setNativeDragRegion(ptr2, MAC_NATIVE_DRAG_REGION_X, MAC_NATIVE_DRAG_REGION_HEIGHT);
  alignButtons();
  alignDragRegion();
  setTimeout(() => {
    alignButtons();
    alignDragRegion();
  }, 120);
  win.on("resize", () => {
    alignButtons();
    alignDragRegion();
  });
  console.log("[MacEffects] Native macOS window effects applied");
}
var DEFAULT_WINDOW_STATE = {
  x: 100,
  y: 100,
  width: 1200,
  height: 800
};
function loadWindowState(statePath) {
  try {
    if (fs8.existsSync(statePath)) {
      const data = JSON.parse(fs8.readFileSync(statePath, "utf8"));
      if (typeof data.width === "number" && typeof data.height === "number") {
        return { ...DEFAULT_WINDOW_STATE, ...data };
      }
    }
  } catch {}
  return DEFAULT_WINDOW_STATE;
}
var saveTimer = null;
function scheduleStateSave(statePath, win) {
  if (saveTimer)
    clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const { x, y } = win.getPosition();
      const { width, height } = win.getSize();
      const dir = path8.dirname(statePath);
      if (!fs8.existsSync(dir))
        fs8.mkdirSync(dir, { recursive: true });
      fs8.writeFileSync(statePath, JSON.stringify({ x, y, width, height }), "utf8");
    } catch {}
  }, 500);
}
async function startRendererServer() {
  const rendererDir = path8.resolve(import.meta.dir, "../renderer");
  if (!fs8.existsSync(rendererDir)) {
    console.warn("[Renderer] renderer dir not found:", rendererDir);
    return "";
  }
  const getPort = (start) => new Promise((resolve3) => {
    const srv = createNetServer();
    srv.listen(start, "127.0.0.1", () => {
      const { port: port2 } = srv.address();
      srv.close(() => resolve3(port2));
    });
    srv.on("error", () => resolve3(getPort(start + 1)));
  });
  const port = await getPort(5174);
  const mimeTypes = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript",
    ".mjs": "application/javascript",
    ".css": "text/css",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
    ".json": "application/json",
    ".wasm": "application/wasm",
    ".glb": "model/gltf-binary",
    ".gltf": "model/gltf+json"
  };
  const agentPort = Number(process.env.MILADY_PORT) || 2138;
  const agentApiBase = `http://localhost:${agentPort}`;
  function injectApiBaseIntoHtml(html) {
    const script = `<script>window.__MILADY_API_BASE__=${JSON.stringify(agentApiBase)};</script>`;
    if (html.includes("</head>")) {
      return html.replace("</head>", `${script}</head>`);
    }
    if (html.includes("<body")) {
      return html.replace("<body", `${script}<body`);
    }
    return script + html;
  }
  Bun.serve({
    port,
    hostname: "127.0.0.1",
    fetch(req) {
      const urlPath = new URL(req.url).pathname.replace(/^\//, "") || "index.html";
      let filePath = path8.join(rendererDir, urlPath);
      if (!filePath.startsWith(rendererDir + path8.sep) && filePath !== rendererDir) {
        filePath = path8.join(rendererDir, "index.html");
      }
      if (!fs8.existsSync(filePath) || fs8.statSync(filePath).isDirectory()) {
        filePath = path8.join(rendererDir, "index.html");
      }
      try {
        const content = fs8.readFileSync(filePath);
        const ext = path8.extname(filePath);
        if (ext === ".html" || filePath.endsWith("index.html")) {
          const html = injectApiBaseIntoHtml(content.toString("utf8"));
          return new Response(html, {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
        return new Response(content, {
          headers: {
            "Content-Type": mimeTypes[ext] ?? "application/octet-stream",
            "Access-Control-Allow-Origin": "*"
          }
        });
      } catch {
        return new Response("Not found", { status: 404 });
      }
    }
  });
  console.log(`[Renderer] Static server on http://127.0.0.1:${port}`);
  return `http://127.0.0.1:${port}`;
}
async function createMainWindow() {
  let rendererUrl = process.env.MILADY_RENDERER_URL ?? process.env.VITE_DEV_SERVER_URL ?? "";
  if (!rendererUrl) {
    rendererUrl = await startRendererServer();
  }
  if (!rendererUrl) {
    rendererUrl = `file://${path8.resolve(import.meta.dir, "../renderer/index.html")}`;
    console.warn("[Main] Falling back to file:// renderer URL \u2014 CORS issues possible");
  }
  const statePath = path8.join(exports_Utils.paths.userData, "window-state.json");
  const state = loadWindowState(statePath);
  const preloadPath = path8.join(import.meta.dir, "preload.js");
  const preload = fs8.existsSync(preloadPath) ? fs8.readFileSync(preloadPath, "utf8") : null;
  if (!preload) {
    console.warn("[Main] preload.js not found \u2014 run `bun run build:preload` first. window.electron will be unavailable.");
  }
  const win = new BrowserWindow({
    title: "Milady",
    url: rendererUrl,
    preload,
    frame: {
      width: state.width,
      height: state.height,
      x: state.x,
      y: state.y
    },
    titleBarStyle: "hiddenInset",
    transparent: true
  });
  applyMacOSWindowEffects(win);
  win.on("resize", () => scheduleStateSave(statePath, win));
  win.on("move", () => scheduleStateSave(statePath, win));
  getDesktopManager().setRendererConfig(rendererUrl, preload);
  return win;
}
function wireRpcAndModules(win) {
  const rpc = win.webview.rpc;
  const sendToWebview = (message, payload) => {
    const rpcMessage = PUSH_CHANNEL_TO_RPC_MESSAGE[message] ?? message;
    if (rpc?.send) {
      const sender = rpc?.send?.[rpcMessage];
      if (sender) {
        sender(payload ?? null);
        return;
      }
    }
    console.warn(`[sendToWebview] No RPC method for message: ${message}`);
  };
  initializeNativeModules(win, sendToWebview);
  registerRpcHandlers(rpc, sendToWebview);
  return sendToWebview;
}
function injectApiBase(win) {
  const resolution = resolveExternalApiBase(process.env);
  if (resolution.invalidSources.length > 0) {
    console.warn(`[Main] Invalid API base env vars: ${resolution.invalidSources.join(", ")}`);
  }
  if (resolution.base) {
    pushApiBaseToRenderer(win, resolution.base, process.env.MILADY_API_TOKEN);
    return;
  }
  const agent = getAgentManager();
  const port = agent.getPort();
  if (port) {
    pushApiBaseToRenderer(win, `http://localhost:${port}`);
  }
}
async function syncPermissionsToRestApi2(port, startup = false) {
  try {
    const permissions = await getPermissionManager().checkAllPermissions();
    await fetch(`http://localhost:${port}/api/permissions/state`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions, startup })
    });
  } catch (err) {
    console.warn("[Main] Permission sync failed:", err);
  }
}
async function startAgent(win) {
  const agent = getAgentManager();
  try {
    const status = await agent.start();
    if (status.state === "running" && status.port) {
      const resolution = resolveExternalApiBase(process.env);
      if (!resolution.base) {
        pushApiBaseToRenderer(win, `http://localhost:${status.port}`);
      }
      syncPermissionsToRestApi2(status.port, true);
    }
  } catch (err) {
    console.error("[Main] Agent start failed:", err);
  }
}
async function setupUpdater(sendToWebview) {
  try {
    Updater.onStatusChange((entry) => {
      if (entry.status === "update-available") {
        const info = Updater.updateInfo();
        sendToWebview("desktopUpdateAvailable", { version: info.version });
      } else if (entry.status === "download-complete") {
        const info = Updater.updateInfo();
        sendToWebview("desktopUpdateReady", { version: info.version });
        exports_Utils.showNotification({
          title: "Milady Update Ready",
          body: `Version ${info.version} is ready. Restart to apply.`
        });
      }
    });
    const updateResult = await Updater.checkForUpdate();
    if (updateResult?.updateAvailable) {
      Updater.downloadUpdate().catch((err) => {
        console.warn("[Updater] Download failed:", err);
      });
    }
  } catch (err) {
    console.warn("[Updater] Update check failed:", err);
  }
}
function setupDeepLinks(_win, sendToWebview) {
  bun_default.events.on("open-url", (url) => {
    sendToWebview("shareTargetReceived", { url });
  });
}
function setupShutdown(apiBaseInterval) {
  bun_default.events.on("before-quit", () => {
    console.log("[Main] App quitting, disposing native modules...");
    clearInterval(apiBaseInterval);
    disposeNativeModules();
  });
}
async function main() {
  console.log("[Main] Starting Milady (Electrobun)...");
  setupApplicationMenu();
  const win = await createMainWindow();
  const sendToWebview = wireRpcAndModules(win);
  setupDeepLinks(win, sendToWebview);
  win.webview.on("dom-ready", () => {
    injectApiBase(win);
  });
  const apiBaseInterval = setInterval(() => {
    injectApiBase(win);
  }, 5000);
  const desktop = getDesktopManager();
  try {
    await desktop.createTray({
      icon: path8.join(import.meta.dir, "../assets/appIcon.png"),
      tooltip: "Milady",
      title: "Milady",
      menu: [
        { id: "show", label: "Show Milady", type: "normal" },
        { id: "sep1", type: "separator" },
        { id: "restart-agent", label: "Restart Agent", type: "normal" },
        { id: "sep2", type: "separator" },
        { id: "quit", label: "Quit", type: "normal" }
      ]
    });
  } catch (err) {
    console.warn("[Main] Tray creation failed:", err);
  }
  startAgent(win);
  setupUpdater(sendToWebview);
  setupShutdown(apiBaseInterval);
  console.log("[Main] Milady started successfully");
}
main().catch((err) => {
  console.error("[Main] Fatal error during startup:", err);
  process.exit(1);
});
