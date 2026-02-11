/** Sandbox capability API routes: status, exec, browser, screen, audio, computer use. */

import { execSync } from "node:child_process";
import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { platform, tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxManager } from "../services/sandbox-manager.js";
import type { RemoteSigningService } from "../services/remote-signing-service.js";

interface SandboxRouteState {
  sandboxManager: SandboxManager | null;
  signingService?: RemoteSigningService | null;
}

// ── Route handler ────────────────────────────────────────────────────────────

/** Returns `true` if handled, `false` to fall through. */
export async function handleSandboxRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: SandboxRouteState,
): Promise<boolean> {
  if (!pathname.startsWith("/api/sandbox")) {
    return false;
  }

  const mgr = state.sandboxManager;

  // Platform info doesn't require a running manager
  if (method === "GET" && pathname === "/api/sandbox/platform") {
    sendJson(res, 200, getPlatformInfo());
    return true;
  }

  // ── POST /api/sandbox/docker/start ────────────────────────────────
  // Attempt to start Docker Desktop (works on macOS/Windows Electron)
  if (method === "POST" && pathname === "/api/sandbox/docker/start") {
    try {
      const result = attemptDockerStart();
      sendJson(res, 200, result);
    } catch (err) {
      sendJson(res, 500, {
        success: false,
        error: `Failed to start Docker: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  if (!mgr) {
    sendJson(res, 503, {
      error: "Sandbox manager not initialized",
    });
    return true;
  }

  // ── GET /api/sandbox/status ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/status") {
    sendJson(res, 200, mgr.getStatus());
    return true;
  }

  // ── GET /api/sandbox/events ─────────────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/events") {
    const events = mgr.getEventLog();
    sendJson(res, 200, { events: events.slice(-100) });
    return true;
  }

  // ── POST /api/sandbox/start ─────────────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/start") {
    try {
      await mgr.start();
      sendJson(res, 200, mgr.getStatus());
    } catch (err) {
      sendJson(res, 500, {
        error: `Failed to start sandbox: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/stop ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/stop") {
    try {
      await mgr.stop();
      sendJson(res, 200, mgr.getStatus());
    } catch (err) {
      sendJson(res, 500, {
        error: `Failed to stop sandbox: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/recover ───────────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/recover") {
    try {
      await mgr.recover();
      sendJson(res, 200, mgr.getStatus());
    } catch (err) {
      sendJson(res, 500, {
        error: `Recovery failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/exec ──────────────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/exec") {
    const body = await readBody(req);
    if (!body) {
      sendJson(res, 400, { error: "Missing request body" });
      return true;
    }

    let parsed: { command?: string; workdir?: string; timeoutMs?: number };
    try {
      parsed = JSON.parse(body);
    } catch {
      sendJson(res, 400, { error: "Invalid JSON body" });
      return true;
    }

    if (!parsed.command || typeof parsed.command !== "string") {
      sendJson(res, 400, { error: "Missing 'command' field" });
      return true;
    }

    const result = await mgr.exec({
      command: parsed.command,
      workdir: parsed.workdir,
      timeoutMs: parsed.timeoutMs,
    });

    sendJson(res, result.exitCode === 0 ? 200 : 422, result);
    return true;
  }

  // ── GET /api/sandbox/browser ────────────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/browser") {
    sendJson(res, 200, {
      cdpEndpoint: mgr.getBrowserCdpEndpoint(),
      wsEndpoint: mgr.getBrowserWsEndpoint(),
    });
    return true;
  }

  // ── Capability bridges ──────────────────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/screen/screenshot") {
    try {
      const screenshot = captureScreenshot();
      res.writeHead(200, {
        "Content-Type": "image/png",
        "Content-Length": screenshot.length,
      });
      res.end(screenshot);
    } catch (err) {
      sendJson(res, 500, {
        error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/screen/screenshot ─────────────────────────────
  // Returns base64-encoded screenshot for easy consumption by agents
  if (method === "POST" && pathname === "/api/sandbox/screen/screenshot") {
    const body = await readBody(req);
    let region:
      | { x?: number; y?: number; width?: number; height?: number }
      | undefined;
    if (body) {
      try {
        region = JSON.parse(body);
      } catch {
        /* use full screen */
      }
    }
    try {
      const screenshot = captureScreenshot(region);
      const base64 = screenshot.toString("base64");
      sendJson(res, 200, {
        format: "png",
        encoding: "base64",
        width: null, // platform-dependent
        height: null,
        data: base64,
      });
    } catch (err) {
      sendJson(res, 500, {
        error: `Screenshot failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── GET /api/sandbox/screen/windows ─────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/screen/windows") {
    try {
      const windows = listWindows();
      sendJson(res, 200, { windows });
    } catch (err) {
      sendJson(res, 200, { windows: [], error: String(err) });
    }
    return true;
  }

  // ── POST /api/sandbox/audio/record ──────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/audio/record") {
    const body = await readBody(req);
    let durationMs = 5000;
    if (body) {
      try {
        const parsed = JSON.parse(body);
        if (typeof parsed.durationMs === "number")
          durationMs = parsed.durationMs;
      } catch {
        /* use default */
      }
    }
    try {
      const audio = await recordAudio(durationMs);
      sendJson(res, 200, {
        format: "wav",
        encoding: "base64",
        durationMs,
        data: audio.toString("base64"),
      });
    } catch (err) {
      sendJson(res, 500, {
        error: `Audio recording failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/audio/play ────────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/audio/play") {
    const body = await readBody(req);
    if (!body) {
      sendJson(res, 400, { error: "Missing request body" });
      return true;
    }
    try {
      const parsed = JSON.parse(body) as { data: string; format?: string };
      if (!parsed.data) {
        sendJson(res, 400, { error: "Missing 'data' field (base64 audio)" });
        return true;
      }
      await playAudio(
        Buffer.from(parsed.data, "base64"),
        parsed.format ?? "wav",
      );
      sendJson(res, 200, { success: true });
    } catch (err) {
      sendJson(res, 500, {
        error: `Audio playback failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/computer/click ────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/computer/click") {
    const body = await readBody(req);
    if (!body) {
      sendJson(res, 400, { error: "Missing request body" });
      return true;
    }
    try {
      const { x, y, button } = JSON.parse(body) as {
        x: number;
        y: number;
        button?: string;
      };
      performClick(x, y, button ?? "left");
      sendJson(res, 200, { success: true, x, y, button: button ?? "left" });
    } catch (err) {
      sendJson(res, 500, {
        error: `Click failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/computer/type ─────────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/computer/type") {
    const body = await readBody(req);
    if (!body) {
      sendJson(res, 400, { error: "Missing request body" });
      return true;
    }
    try {
      const { text } = JSON.parse(body) as { text: string };
      performType(text);
      sendJson(res, 200, { success: true, length: text.length });
    } catch (err) {
      sendJson(res, 500, {
        error: `Type failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── POST /api/sandbox/computer/keypress ─────────────────────────────
  if (method === "POST" && pathname === "/api/sandbox/computer/keypress") {
    const body = await readBody(req);
    if (!body) {
      sendJson(res, 400, { error: "Missing request body" });
      return true;
    }
    try {
      const { keys } = JSON.parse(body) as { keys: string };
      performKeypress(keys);
      sendJson(res, 200, { success: true, keys });
    } catch (err) {
      sendJson(res, 500, {
        error: `Keypress failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
    return true;
  }

  // ── Signing routes ─────────────────────────────────────────────────

  if (method === "POST" && pathname === "/api/sandbox/sign") {
    const signer = state.signingService;
    if (!signer) {
      sendJson(res, 503, { error: "Signing service not configured" });
      return true;
    }
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { error: "Missing body" }); return true; }
    try {
      const request = JSON.parse(body);
      const result = await signer.submitSigningRequest(request);
      sendJson(res, result.success ? 200 : 403, result);
    } catch (err) {
      sendJson(res, 400, { error: `Invalid request: ${err instanceof Error ? err.message : String(err)}` });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/sandbox/sign/approve") {
    const signer = state.signingService;
    if (!signer) { sendJson(res, 503, { error: "Signing service not configured" }); return true; }
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { error: "Missing body" }); return true; }
    try {
      const { requestId } = JSON.parse(body) as { requestId: string };
      const result = await signer.approveRequest(requestId);
      sendJson(res, result.success ? 200 : 403, result);
    } catch (err) {
      sendJson(res, 400, { error: String(err) });
    }
    return true;
  }

  if (method === "POST" && pathname === "/api/sandbox/sign/reject") {
    const signer = state.signingService;
    if (!signer) { sendJson(res, 503, { error: "Signing service not configured" }); return true; }
    const body = await readBody(req);
    if (!body) { sendJson(res, 400, { error: "Missing body" }); return true; }
    try {
      const { requestId } = JSON.parse(body) as { requestId: string };
      const rejected = signer.rejectRequest(requestId);
      sendJson(res, 200, { rejected });
    } catch (err) {
      sendJson(res, 400, { error: String(err) });
    }
    return true;
  }

  if (method === "GET" && pathname === "/api/sandbox/sign/pending") {
    const signer = state.signingService;
    if (!signer) { sendJson(res, 503, { error: "Signing service not configured" }); return true; }
    sendJson(res, 200, { pending: signer.getPendingApprovals() });
    return true;
  }

  if (method === "GET" && pathname === "/api/sandbox/sign/address") {
    const signer = state.signingService;
    if (!signer) { sendJson(res, 503, { error: "Signing service not configured" }); return true; }
    try {
      const address = await signer.getAddress();
      sendJson(res, 200, { address });
    } catch (err) {
      sendJson(res, 500, { error: String(err) });
    }
    return true;
  }

  // ── GET /api/sandbox/capabilities ───────────────────────────────────
  if (method === "GET" && pathname === "/api/sandbox/capabilities") {
    sendJson(res, 200, detectCapabilities());
    return true;
  }

  // ── Fallthrough ─────────────────────────────────────────────────────
  sendJson(res, 404, { error: `Unknown sandbox route: ${method} ${pathname}` });
  return true;
}

function captureScreenshot(region?: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}): Buffer {
  const os = platform();
  const tmpFile = join(tmpdir(), `sandbox-screenshot-${Date.now()}.png`);

  try {
    if (os === "darwin") {
      if (
        region &&
        region.x !== undefined &&
        region.y !== undefined &&
        region.width &&
        region.height
      ) {
        execSync(
          `screencapture -R${region.x},${region.y},${region.width},${region.height} -x ${tmpFile}`,
          { timeout: 10000 },
        );
      } else {
        execSync(`screencapture -x ${tmpFile}`, { timeout: 10000 });
      }
    } else if (os === "linux") {
      // Try tools in preference order
      if (commandExists("import")) {
        if (
          region &&
          region.x !== undefined &&
          region.y !== undefined &&
          region.width &&
          region.height
        ) {
          execSync(
            `import -window root -crop ${region.width}x${region.height}+${region.x}+${region.y} ${tmpFile}`,
            { timeout: 10000 },
          );
        } else {
          execSync(`import -window root ${tmpFile}`, { timeout: 10000 });
        }
      } else if (commandExists("scrot")) {
        execSync(`scrot ${tmpFile}`, { timeout: 10000 });
      } else if (commandExists("gnome-screenshot")) {
        execSync(`gnome-screenshot -f ${tmpFile}`, { timeout: 10000 });
      } else {
        throw new Error(
          "No screenshot tool available. Install ImageMagick, scrot, or gnome-screenshot.",
        );
      }
    } else if (os === "win32") {
      // PowerShell screenshot
      const psCmd = [
        `Add-Type -AssemblyName System.Windows.Forms`,
        `$screen = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds`,
        `$bitmap = New-Object System.Drawing.Bitmap($screen.Width, $screen.Height)`,
        `$graphics = [System.Drawing.Graphics]::FromImage($bitmap)`,
        `$graphics.CopyFromScreen($screen.Location, [System.Drawing.Point]::Empty, $screen.Size)`,
        `$bitmap.Save('${tmpFile.replace(/\//g, "\\")}')`,
        `$graphics.Dispose()`,
        `$bitmap.Dispose()`,
      ].join("; ");
      execSync(`powershell -Command "${psCmd}"`, { timeout: 15000 });
    } else {
      throw new Error(`Screenshot not supported on platform: ${os}`);
    }

    const data = readFileSync(tmpFile);
    try {
      unlinkSync(tmpFile);
    } catch {
      /* cleanup best effort */
    }
    return data;
  } catch (err) {
    // Clean up temp file on error
    try {
      unlinkSync(tmpFile);
    } catch {
      /* ignore */
    }
    throw err;
  }
}

function listWindows(): Array<{ id: string; title: string; app: string }> {
  const os = platform();

  if (os === "darwin") {
    try {
      const script = `
        tell application "System Events"
          set windowList to {}
          repeat with proc in (every process whose visible is true)
            try
              repeat with w in (every window of proc)
                set end of windowList to (name of proc) & "|||" & (name of w) & "|||" & (id of w as text)
              end repeat
            end try
          end repeat
          return windowList as text
        end tell`;
      const output = execSync(`osascript -e '${script}'`, {
        encoding: "utf-8",
        timeout: 10000,
      });
      return output
        .split(", ")
        .filter(Boolean)
        .map((entry) => {
          const parts = entry.split("|||");
          return {
            app: parts[0] ?? "unknown",
            title: parts[1] ?? "unknown",
            id: parts[2] ?? "0",
          };
        });
    } catch {
      return [];
    }
  }

  if (os === "linux") {
    try {
      const output = execSync(
        'wmctrl -l 2>/dev/null || xdotool search --name "" getwindowname 2>/dev/null',
        {
          encoding: "utf-8",
          timeout: 5000,
        },
      );
      return output
        .split("\n")
        .filter(Boolean)
        .map((line, i) => ({
          id: String(i),
          title: line.trim(),
          app: "unknown",
        }));
    } catch {
      return [];
    }
  }

  if (os === "win32") {
    try {
      const output = execSync(
        `powershell -Command "Get-Process | Where-Object {$_.MainWindowTitle} | Select-Object Id, MainWindowTitle | ConvertTo-Json"`,
        { encoding: "utf-8", timeout: 10000 },
      );
      const processes = JSON.parse(output);
      const list = Array.isArray(processes) ? processes : [processes];
      return list.map((p: { Id: number; MainWindowTitle: string }) => ({
        id: String(p.Id),
        title: p.MainWindowTitle,
        app: "unknown",
      }));
    } catch {
      return [];
    }
  }

  return [];
}

async function recordAudio(durationMs: number): Promise<Buffer> {
  const os = platform();
  const durationSec = Math.ceil(durationMs / 1000);
  const tmpFile = join(tmpdir(), `sandbox-audio-${Date.now()}.wav`);

  if (os === "darwin") {
    // Use sox (rec) on macOS
    if (commandExists("rec")) {
      execSync(`rec -q ${tmpFile} trim 0 ${durationSec}`, {
        timeout: durationMs + 5000,
      });
    } else if (commandExists("ffmpeg")) {
      execSync(
        `ffmpeg -f avfoundation -i ":0" -t ${durationSec} -y ${tmpFile} 2>/dev/null`,
        { timeout: durationMs + 10000 },
      );
    } else {
      throw new Error(
        "No audio recording tool available. Install sox or ffmpeg.",
      );
    }
  } else if (os === "linux") {
    if (commandExists("arecord")) {
      execSync(`arecord -d ${durationSec} -f cd ${tmpFile}`, {
        timeout: durationMs + 5000,
      });
    } else if (commandExists("ffmpeg")) {
      execSync(
        `ffmpeg -f pulse -i default -t ${durationSec} -y ${tmpFile} 2>/dev/null`,
        { timeout: durationMs + 10000 },
      );
    } else {
      throw new Error(
        "No audio recording tool available. Install alsa-utils or ffmpeg.",
      );
    }
  } else if (os === "win32") {
    // Use ffmpeg on Windows (most portable)
    if (commandExists("ffmpeg")) {
      execSync(
        `ffmpeg -f dshow -i audio="Microphone" -t ${durationSec} -y "${tmpFile.replace(/\//g, "\\")}" 2>NUL`,
        { timeout: durationMs + 10000 },
      );
    } else {
      throw new Error("No audio recording tool available. Install ffmpeg.");
    }
  } else {
    throw new Error(`Audio recording not supported on platform: ${os}`);
  }

  const data = readFileSync(tmpFile);
  try {
    unlinkSync(tmpFile);
  } catch {
    /* cleanup */
  }
  return data;
}

async function playAudio(data: Buffer, format: string): Promise<void> {
  const os = platform();
  const tmpFile = join(tmpdir(), `sandbox-play-${Date.now()}.${format}`);
  writeFileSync(tmpFile, data);

  try {
    if (os === "darwin") {
      execSync(`afplay ${tmpFile}`, { timeout: 60000 });
    } else if (os === "linux") {
      if (commandExists("aplay")) {
        execSync(`aplay ${tmpFile}`, { timeout: 60000 });
      } else if (commandExists("paplay")) {
        execSync(`paplay ${tmpFile}`, { timeout: 60000 });
      } else if (commandExists("ffplay")) {
        execSync(`ffplay -autoexit -nodisp ${tmpFile} 2>/dev/null`, {
          timeout: 60000,
        });
      } else {
        throw new Error("No audio playback tool available.");
      }
    } else if (os === "win32") {
      execSync(
        `powershell -Command "(New-Object Media.SoundPlayer '${tmpFile.replace(/\//g, "\\")}').PlaySync()"`,
        { timeout: 60000 },
      );
    }
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      /* cleanup */
    }
  }
}

function performClick(x: number, y: number, button: string): void {
  const os = platform();

  if (os === "darwin") {
    // Use cliclick on macOS (brew install cliclick)
    if (commandExists("cliclick")) {
      const btn = button === "right" ? "rc" : "c";
      execSync(`cliclick ${btn}:${x},${y}`, { timeout: 5000 });
    } else {
      // AppleScript fallback
      execSync(
        `osascript -e 'tell application "System Events" to click at {${x}, ${y}}'`,
        { timeout: 5000 },
      );
    }
  } else if (os === "linux") {
    if (commandExists("xdotool")) {
      const btn = button === "right" ? "3" : "1";
      execSync(`xdotool mousemove ${x} ${y} click ${btn}`, { timeout: 5000 });
    } else {
      throw new Error("xdotool required for mouse control on Linux.");
    }
  } else if (os === "win32") {
    // Use Win32 API via PowerShell to perform an actual mouse click
    const psScript = [
      `Add-Type -AssemblyName System.Windows.Forms`,
      `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x},${y})`,
      `Add-Type -MemberDefinition '[DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);' -Name Win32Mouse -Namespace Win32`,
      button === "right"
        ? `[Win32.Win32Mouse]::mouse_event(0x0008, 0, 0, 0, 0); [Win32.Win32Mouse]::mouse_event(0x0010, 0, 0, 0, 0)` // right down + up
        : `[Win32.Win32Mouse]::mouse_event(0x0002, 0, 0, 0, 0); [Win32.Win32Mouse]::mouse_event(0x0004, 0, 0, 0, 0)`, // left down + up
    ].join("; ");
    execSync(`powershell -Command "${psScript}"`, { timeout: 5000 });
  }
}

function performType(text: string): void {
  const os = platform();

  if (os === "darwin") {
    if (commandExists("cliclick")) {
      // Escape special chars for cliclick
      const escaped = text.replace(/"/g, '\\"');
      execSync(`cliclick t:"${escaped}"`, { timeout: 10000 });
    } else {
      const escaped = text.replace(/"/g, '\\"').replace(/'/g, "'\\''");
      execSync(
        `osascript -e 'tell application "System Events" to keystroke "${escaped}"'`,
        {
          timeout: 10000,
        },
      );
    }
  } else if (os === "linux") {
    if (commandExists("xdotool")) {
      execSync(`xdotool type -- "${text.replace(/"/g, '\\"')}"`, {
        timeout: 10000,
      });
    } else {
      throw new Error("xdotool required for keyboard input on Linux.");
    }
  } else if (os === "win32") {
    const escaped = text.replace(/'/g, "''");
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')"`,
      { timeout: 10000 },
    );
  }
}

function performKeypress(keys: string): void {
  const os = platform();

  if (os === "darwin") {
    if (commandExists("cliclick")) {
      execSync(`cliclick kp:${keys}`, { timeout: 5000 });
    } else {
      execSync(
        `osascript -e 'tell application "System Events" to key code ${keys}'`,
        {
          timeout: 5000,
        },
      );
    }
  } else if (os === "linux") {
    if (commandExists("xdotool")) {
      execSync(`xdotool key ${keys}`, { timeout: 5000 });
    } else {
      throw new Error("xdotool required for key input on Linux.");
    }
  } else if (os === "win32") {
    execSync(
      `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${keys}')"`,
      { timeout: 5000 },
    );
  }
}

function detectCapabilities(): Record<
  string,
  { available: boolean; tool: string }
> {
  const os = platform();
  const caps: Record<string, { available: boolean; tool: string }> = {};

  // Screenshot
  if (os === "darwin") {
    caps.screenshot = { available: true, tool: "screencapture (built-in)" };
  } else if (os === "linux") {
    if (commandExists("import"))
      caps.screenshot = { available: true, tool: "ImageMagick import" };
    else if (commandExists("scrot"))
      caps.screenshot = { available: true, tool: "scrot" };
    else if (commandExists("gnome-screenshot"))
      caps.screenshot = { available: true, tool: "gnome-screenshot" };
    else
      caps.screenshot = {
        available: false,
        tool: "none (install ImageMagick, scrot, or gnome-screenshot)",
      };
  } else if (os === "win32") {
    caps.screenshot = { available: true, tool: "PowerShell System.Drawing" };
  } else {
    caps.screenshot = { available: false, tool: "unsupported platform" };
  }

  // Audio record
  if (os === "darwin") {
    if (commandExists("rec"))
      caps.audioRecord = { available: true, tool: "sox rec" };
    else if (commandExists("ffmpeg"))
      caps.audioRecord = { available: true, tool: "ffmpeg" };
    else
      caps.audioRecord = {
        available: false,
        tool: "none (install sox or ffmpeg)",
      };
  } else if (os === "linux") {
    if (commandExists("arecord"))
      caps.audioRecord = { available: true, tool: "arecord" };
    else if (commandExists("ffmpeg"))
      caps.audioRecord = { available: true, tool: "ffmpeg" };
    else
      caps.audioRecord = {
        available: false,
        tool: "none (install alsa-utils or ffmpeg)",
      };
  } else if (os === "win32") {
    if (commandExists("ffmpeg"))
      caps.audioRecord = { available: true, tool: "ffmpeg" };
    else caps.audioRecord = { available: false, tool: "none (install ffmpeg)" };
  } else {
    caps.audioRecord = { available: false, tool: "unsupported" };
  }

  // Audio play
  if (os === "darwin")
    caps.audioPlay = { available: true, tool: "afplay (built-in)" };
  else if (os === "linux") {
    if (commandExists("aplay"))
      caps.audioPlay = { available: true, tool: "aplay" };
    else if (commandExists("paplay"))
      caps.audioPlay = { available: true, tool: "paplay" };
    else if (commandExists("ffplay"))
      caps.audioPlay = { available: true, tool: "ffplay" };
    else caps.audioPlay = { available: false, tool: "none" };
  } else if (os === "win32") {
    caps.audioPlay = { available: true, tool: "PowerShell SoundPlayer" };
  } else {
    caps.audioPlay = { available: false, tool: "unsupported" };
  }

  // Mouse/keyboard control
  if (os === "darwin") {
    if (commandExists("cliclick"))
      caps.computerUse = { available: true, tool: "cliclick" };
    else caps.computerUse = { available: true, tool: "AppleScript (limited)" };
  } else if (os === "linux") {
    if (commandExists("xdotool"))
      caps.computerUse = { available: true, tool: "xdotool" };
    else
      caps.computerUse = { available: false, tool: "none (install xdotool)" };
  } else if (os === "win32") {
    caps.computerUse = { available: true, tool: "PowerShell SendKeys" };
  } else {
    caps.computerUse = { available: false, tool: "unsupported" };
  }

  // Window listing
  if (os === "darwin")
    caps.windowList = { available: true, tool: "AppleScript" };
  else if (os === "linux") {
    if (commandExists("wmctrl"))
      caps.windowList = { available: true, tool: "wmctrl" };
    else if (commandExists("xdotool"))
      caps.windowList = { available: true, tool: "xdotool" };
    else
      caps.windowList = {
        available: false,
        tool: "none (install wmctrl or xdotool)",
      };
  } else if (os === "win32") {
    caps.windowList = { available: true, tool: "PowerShell Get-Process" };
  } else {
    caps.windowList = { available: false, tool: "unsupported" };
  }

  // Browser
  caps.browser = { available: true, tool: "CDP via sandbox browser container" };

  // Shell
  caps.shell = { available: true, tool: "docker exec" };

  return caps;
}

function getPlatformInfo(): Record<string, string | boolean> {
  const os = platform();
  let dockerInstalled = false;
  let dockerRunning = false;
  let appleContainerAvailable = false;

  // Check if docker binary exists (installed)
  try {
    const which = os === "win32" ? "where" : "which";
    execSync(`${which} docker`, { stdio: "ignore", timeout: 3000 });
    dockerInstalled = true;
  } catch {
    /* not installed */
  }

  // Check if docker daemon is running (docker info succeeds only when daemon is up)
  if (dockerInstalled) {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 5000 });
      dockerRunning = true;
    } catch {
      /* installed but not running */
    }
  }

  if (os === "darwin") {
    try {
      execSync("which container", { stdio: "ignore", timeout: 3000 });
      appleContainerAvailable = true;
    } catch {
      /* */
    }
  }

  return {
    platform: os,
    arch: require("node:os").arch(),
    dockerInstalled,
    dockerRunning,
    // Legacy compat: dockerAvailable = running (old clients check this)
    dockerAvailable: dockerRunning,
    appleContainerAvailable,
    wsl2: os === "win32" ? isWsl2Available() : false,
    recommended:
      os === "darwin" && appleContainerAvailable ? "apple-container" : "docker",
  };
}

function isWsl2Available(): boolean {
  try {
    execSync("wsl --status", { stdio: "ignore", timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

function attemptDockerStart(): {
  success: boolean;
  message: string;
  waitMs: number;
} {
  const os = platform();

  try {
    if (os === "darwin") {
      execSync('open -a "Docker"', { timeout: 5000, stdio: "ignore" });
      return {
        success: true,
        message: "Docker Desktop is starting on macOS. Give it a moment~",
        waitMs: 15000,
      };
    }

    if (os === "win32") {
      // Try common install locations
      const paths = [
        '"C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe"',
        '"C:\\Program Files (x86)\\Docker\\Docker\\Docker Desktop.exe"',
      ];
      let started = false;
      for (const p of paths) {
        try {
          execSync(`start "" ${p}`, {
            timeout: 5000,
            stdio: "ignore",
            shell: "cmd.exe",
          });
          started = true;
          break;
        } catch {
          /* try next path */
        }
      }
      if (!started) {
        // Try via start menu
        execSync('start "" "Docker Desktop"', {
          timeout: 5000,
          stdio: "ignore",
          shell: "cmd.exe",
        });
      }
      return {
        success: true,
        message:
          "Docker Desktop is starting on Windows. This may take 30 seconds~",
        waitMs: 30000,
      };
    }

    if (os === "linux") {
      // Try systemctl first (most common)
      try {
        execSync("sudo systemctl start docker", {
          timeout: 10000,
          stdio: "ignore",
        });
        return {
          success: true,
          message: "Docker daemon started via systemctl",
          waitMs: 5000,
        };
      } catch {
        /* systemctl may not be available */
      }

      // Try service command
      try {
        execSync("sudo service docker start", {
          timeout: 10000,
          stdio: "ignore",
        });
        return {
          success: true,
          message: "Docker daemon started via service",
          waitMs: 5000,
        };
      } catch {
        /* */
      }

      return {
        success: false,
        message:
          "Could not auto-start Docker on Linux. Run: sudo systemctl start docker",
        waitMs: 0,
      };
    }

    return {
      success: false,
      message: `Auto-start not supported on ${os}`,
      waitMs: 0,
    };
  } catch (err) {
    return {
      success: false,
      message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      waitMs: 0,
    };
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function commandExists(cmd: string): boolean {
  try {
    const which = platform() === "win32" ? "where" : "which";
    execSync(`${which} ${cmd}`, { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

function sendJson(res: ServerResponse, status: number, data: object): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data));
}

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    const MAX_BODY = 10 * 1024 * 1024; // 10 MB for audio data

    req.on("data", (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BODY) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      resolve(Buffer.concat(chunks).toString("utf-8"));
    });

    req.on("error", () => {
      resolve(null);
    });
  });
}
