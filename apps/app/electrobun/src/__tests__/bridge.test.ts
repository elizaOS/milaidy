import { describe, expect, it } from "vitest";
import {
  CHANNEL_TO_RPC_METHOD,
  PUSH_CHANNEL_TO_RPC_MESSAGE,
  RPC_MESSAGE_TO_PUSH_CHANNEL,
} from "../rpc-schema";

describe("CHANNEL_TO_RPC_METHOD mapping", () => {
  it("maps all agent channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["agent:start"]).toBe("agentStart");
    expect(CHANNEL_TO_RPC_METHOD["agent:stop"]).toBe("agentStop");
    expect(CHANNEL_TO_RPC_METHOD["agent:restart"]).toBe("agentRestart");
    expect(CHANNEL_TO_RPC_METHOD["agent:status"]).toBe("agentStatus");
  });

  it("maps all desktop tray channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["desktop:createTray"]).toBe(
      "desktopCreateTray",
    );
    expect(CHANNEL_TO_RPC_METHOD["desktop:updateTray"]).toBe(
      "desktopUpdateTray",
    );
    expect(CHANNEL_TO_RPC_METHOD["desktop:destroyTray"]).toBe(
      "desktopDestroyTray",
    );
    expect(CHANNEL_TO_RPC_METHOD["desktop:setTrayMenu"]).toBe(
      "desktopSetTrayMenu",
    );
  });

  it("maps all gateway channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["gateway:startDiscovery"]).toBe(
      "gatewayStartDiscovery",
    );
    expect(CHANNEL_TO_RPC_METHOD["gateway:stopDiscovery"]).toBe(
      "gatewayStopDiscovery",
    );
    expect(CHANNEL_TO_RPC_METHOD["gateway:isDiscovering"]).toBe(
      "gatewayIsDiscovering",
    );
    expect(CHANNEL_TO_RPC_METHOD["gateway:getDiscoveredGateways"]).toBe(
      "gatewayGetDiscoveredGateways",
    );
  });

  it("maps all permission channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["permissions:check"]).toBe("permissionsCheck");
    expect(CHANNEL_TO_RPC_METHOD["permissions:request"]).toBe(
      "permissionsRequest",
    );
    expect(CHANNEL_TO_RPC_METHOD["permissions:getAll"]).toBe(
      "permissionsGetAll",
    );
    expect(CHANNEL_TO_RPC_METHOD["permissions:openSettings"]).toBe(
      "permissionsOpenSettings",
    );
  });

  it("maps canvas:eval to canvasEval", () => {
    expect(CHANNEL_TO_RPC_METHOD["canvas:eval"]).toBe("canvasEval");
  });

  it("maps all canvas channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["canvas:createWindow"]).toBe(
      "canvasCreateWindow",
    );
    expect(CHANNEL_TO_RPC_METHOD["canvas:destroyWindow"]).toBe(
      "canvasDestroyWindow",
    );
    expect(CHANNEL_TO_RPC_METHOD["canvas:navigate"]).toBe("canvasNavigate");
    expect(CHANNEL_TO_RPC_METHOD["canvas:snapshot"]).toBe("canvasSnapshot");
    expect(CHANNEL_TO_RPC_METHOD["canvas:show"]).toBe("canvasShow");
    expect(CHANNEL_TO_RPC_METHOD["canvas:hide"]).toBe("canvasHide");
    expect(CHANNEL_TO_RPC_METHOD["canvas:resize"]).toBe("canvasResize");
    expect(CHANNEL_TO_RPC_METHOD["canvas:focus"]).toBe("canvasFocus");
    expect(CHANNEL_TO_RPC_METHOD["canvas:listWindows"]).toBe(
      "canvasListWindows",
    );
  });

  it("maps all talkmode channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["talkmode:start"]).toBe("talkmodeStart");
    expect(CHANNEL_TO_RPC_METHOD["talkmode:stop"]).toBe("talkmodeStop");
    expect(CHANNEL_TO_RPC_METHOD["talkmode:speak"]).toBe("talkmodeSpeak");
    expect(CHANNEL_TO_RPC_METHOD["talkmode:getState"]).toBe("talkmodeGetState");
  });

  it("maps all LIFO channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["lifo:getPipState"]).toBe("lifoGetPipState");
    expect(CHANNEL_TO_RPC_METHOD["lifo:setPip"]).toBe("lifoSetPip");
  });

  it("maps all GPU window channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:create"]).toBe("gpuWindowCreate");
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:destroy"]).toBe("gpuWindowDestroy");
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:show"]).toBe("gpuWindowShow");
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:hide"]).toBe("gpuWindowHide");
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:setBounds"]).toBe(
      "gpuWindowSetBounds",
    );
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:getInfo"]).toBe("gpuWindowGetInfo");
    expect(CHANNEL_TO_RPC_METHOD["gpuWindow:list"]).toBe("gpuWindowList");
  });

  it("maps all GPU view channels correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["gpuView:create"]).toBe("gpuViewCreate");
    expect(CHANNEL_TO_RPC_METHOD["gpuView:destroy"]).toBe("gpuViewDestroy");
    expect(CHANNEL_TO_RPC_METHOD["gpuView:setFrame"]).toBe("gpuViewSetFrame");
    expect(CHANNEL_TO_RPC_METHOD["gpuView:setTransparent"]).toBe(
      "gpuViewSetTransparent",
    );
    expect(CHANNEL_TO_RPC_METHOD["gpuView:setHidden"]).toBe("gpuViewSetHidden");
    expect(CHANNEL_TO_RPC_METHOD["gpuView:getNativeHandle"]).toBe(
      "gpuViewGetNativeHandle",
    );
    expect(CHANNEL_TO_RPC_METHOD["gpuView:list"]).toBe("gpuViewList");
  });

  it("maps game window channel correctly", () => {
    expect(CHANNEL_TO_RPC_METHOD["game:openWindow"]).toBe("gameOpenWindow");
  });
  it("returns undefined for unknown channels", () => {
    expect(CHANNEL_TO_RPC_METHOD["unknown:channel"]).toBeUndefined();
    expect(CHANNEL_TO_RPC_METHOD[""]).toBeUndefined();
  });

  it("has consistent camelCase naming convention", () => {
    for (const [channel, rpcMethod] of Object.entries(CHANNEL_TO_RPC_METHOD)) {
      // Channel uses colon separator: "namespace:methodName" (method may contain digits)
      expect(channel).toMatch(/^[a-zA-Z]+:[a-zA-Z0-9]+$/);

      // RPC method is camelCase without colons
      expect(rpcMethod).not.toContain(":");
      expect(rpcMethod).toMatch(/^[a-z][a-zA-Z0-9]*$/);

      // The RPC method name should be derivable from the channel:
      // "agent:start" -> "agentStart", "desktop:createTray" -> "desktopCreateTray"
      const [namespace, method] = channel.split(":");
      const expectedRpc =
        namespace + method.charAt(0).toUpperCase() + method.slice(1);
      expect(rpcMethod).toBe(expectedRpc);
    }
  });
});

describe("PUSH_CHANNEL_TO_RPC_MESSAGE mapping", () => {
  it("maps agent push events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["agent:status"]).toBe(
      "agentStatusUpdate",
    );
  });

  it("maps gateway push events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["gateway:discovery"]).toBe(
      "gatewayDiscovery",
    );
  });

  it("maps desktop window events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["desktop:windowFocus"]).toBe(
      "desktopWindowFocus",
    );
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["desktop:windowBlur"]).toBe(
      "desktopWindowBlur",
    );
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["desktop:windowClose"]).toBe(
      "desktopWindowClose",
    );
  });

  it("maps talkmode push events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["talkmode:stateChanged"]).toBe(
      "talkmodeStateChanged",
    );
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["talkmode:speakComplete"]).toBe(
      "talkmodeSpeakComplete",
    );
  });

  it("maps swabble push events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["swabble:wakeWord"]).toBe(
      "swabbleWakeWord",
    );
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["swabble:stateChange"]).toBe(
      "swabbleStateChanged",
    );
  });

  it("maps GPU window push events", () => {
    expect(PUSH_CHANNEL_TO_RPC_MESSAGE["gpuWindow:closed"]).toBe(
      "gpuWindowClosed",
    );
  });
});

describe("RPC_MESSAGE_TO_PUSH_CHANNEL (reverse mapping)", () => {
  it("is the exact inverse of PUSH_CHANNEL_TO_RPC_MESSAGE", () => {
    for (const [channel, rpcMessage] of Object.entries(
      PUSH_CHANNEL_TO_RPC_MESSAGE,
    )) {
      expect(RPC_MESSAGE_TO_PUSH_CHANNEL[rpcMessage]).toBe(channel);
    }
  });

  it("has the same number of entries as the forward mapping", () => {
    expect(Object.keys(RPC_MESSAGE_TO_PUSH_CHANNEL).length).toBe(
      Object.keys(PUSH_CHANNEL_TO_RPC_MESSAGE).length,
    );
  });

  it("resolves specific reverse lookups", () => {
    expect(RPC_MESSAGE_TO_PUSH_CHANNEL.agentStatusUpdate).toBe("agent:status");
    expect(RPC_MESSAGE_TO_PUSH_CHANNEL.gatewayDiscovery).toBe(
      "gateway:discovery",
    );
    expect(RPC_MESSAGE_TO_PUSH_CHANNEL.canvasWindowEvent).toBe(
      "canvas:windowEvent",
    );
  });
});

describe("params extraction logic (bridge invoke)", () => {
  // This tests the logic: args.length === 0 ? undefined : args.length === 1 ? args[0] : args
  // The bridge translates Electron-style invoke args to RPC params.

  function extractParams(...args: unknown[]): unknown {
    return args.length === 0 ? undefined : args.length === 1 ? args[0] : args;
  }

  it("returns undefined for zero args", () => {
    expect(extractParams()).toBeUndefined();
  });

  it("returns the single arg unwrapped for one arg", () => {
    const opts = { id: "test" };
    expect(extractParams(opts)).toBe(opts);
  });

  it("returns the full args array for multiple args", () => {
    const result = extractParams("arg1", "arg2", "arg3");
    expect(result).toEqual(["arg1", "arg2", "arg3"]);
  });

  it("returns the single arg even if it is an array", () => {
    const arr = [1, 2, 3];
    expect(extractParams(arr)).toBe(arr);
  });

  it("handles null as a single arg", () => {
    expect(extractParams(null)).toBeNull();
  });

  it("handles two args correctly (the fixed bug case)", () => {
    const result = extractParams("first", "second");
    expect(result).toEqual(["first", "second"]);
    // Before the fix, this would incorrectly return just "first"
    expect(result).not.toBe("first");
  });
});
