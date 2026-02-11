/** Cross-platform sandbox engine: Docker, Apple Container, auto-detect. */

import { execSync, spawn } from "node:child_process";
import { arch, platform } from "node:os";

export type SandboxEngineType = "docker" | "apple-container" | "auto";

export interface ContainerRunOptions {
  image: string;
  name: string;
  detach: boolean;
  mounts: Array<{ host: string; container: string; readonly: boolean }>;
  env: Record<string, string>;
  network: string;
  user: string;
  capDrop: string[];
  memory?: string;
  cpus?: number;
  pidsLimit?: number;
  readOnlyRoot?: boolean;
  ports?: Array<{ host: number; container: number }>;
  dns?: string[];
}

export interface ContainerExecOptions {
  containerId: string;
  command: string;
  workdir?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  stdin?: string;
}

export interface ContainerExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface EngineInfo {
  type: SandboxEngineType;
  available: boolean;
  version: string;
  platform: string;
  arch: string;
  details: string;
}

export interface ISandboxEngine {
  readonly engineType: SandboxEngineType;
  isAvailable(): boolean;
  getInfo(): EngineInfo;
  runContainer(opts: ContainerRunOptions): Promise<string>; // returns container ID
  execInContainer(opts: ContainerExecOptions): Promise<ContainerExecResult>;
  stopContainer(id: string): Promise<void>;
  removeContainer(id: string): Promise<void>;
  isContainerRunning(id: string): boolean;
  imageExists(image: string): boolean;
  pullImage(image: string): Promise<void>;
  listContainers(prefix: string): string[];
  healthCheck(id: string): Promise<boolean>;
}

export class DockerEngine implements ISandboxEngine {
  readonly engineType: SandboxEngineType = "docker";

  isAvailable(): boolean {
    try {
      execSync("docker info", { stdio: "ignore", timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }

  getInfo(): EngineInfo {
    let version = "unknown";
    try {
      version = execSync("docker --version", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
    } catch {
      // ignore
    }

    return {
      type: "docker",
      available: this.isAvailable(),
      version,
      platform: platform(),
      arch: arch(),
      details: this.getDockerContext(),
    };
  }

  async runContainer(opts: ContainerRunOptions): Promise<string> {
    const args = ["run"];
    if (opts.detach) args.push("-d");
    args.push("--name", opts.name);

    if (opts.network) args.push("--network", opts.network);
    if (opts.user) args.push("--user", opts.user);
    if (opts.memory) args.push("--memory", opts.memory);
    if (opts.cpus) args.push("--cpus", String(opts.cpus));
    if (opts.pidsLimit) args.push("--pids-limit", String(opts.pidsLimit));
    if (opts.readOnlyRoot) args.push("--read-only");

    for (const cap of opts.capDrop) {
      args.push("--cap-drop", cap);
    }
    for (const mount of opts.mounts) {
      if (mount.readonly) {
        args.push(
          "--mount",
          `type=bind,source=${mount.host},target=${mount.container},readonly`,
        );
      } else {
        args.push("-v", `${mount.host}:${mount.container}`);
      }
    }
    for (const [key, value] of Object.entries(opts.env)) {
      args.push("-e", `${key}=${value}`);
    }
    if (opts.ports) {
      for (const p of opts.ports) {
        args.push("-p", `${p.host}:${p.container}`);
      }
    }
    if (opts.dns) {
      for (const d of opts.dns) {
        args.push("--dns", d);
      }
    }

    args.push(opts.image);

    const output = execSync(`docker ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 60000,
    }).trim();

    return output.substring(0, 12);
  }

  async execInContainer(
    opts: ContainerExecOptions,
  ): Promise<ContainerExecResult> {
    const start = Date.now();
    const args = ["exec"];
    if (opts.workdir) args.push("-w", opts.workdir);
    if (opts.env) {
      for (const [key, value] of Object.entries(opts.env)) {
        args.push("-e", `${key}=${value}`);
      }
    }
    args.push(opts.containerId, "sh", "-c", opts.command);

    return new Promise<ContainerExecResult>((resolve) => {
      const proc = spawn("docker", args, { stdio: ["pipe", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";
      const timeoutMs = opts.timeoutMs ?? 30000;
      const timeout = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      if (opts.stdin) {
        proc.stdin.write(opts.stdin);
        proc.stdin.end();
      }

      proc.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout,
          stderr: `Exec error: ${err.message}`,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  async stopContainer(id: string): Promise<void> {
    try {
      execSync(`docker stop ${id}`, { timeout: 15000, stdio: "ignore" });
    } catch {
      /* best effort */
    }
  }

  async removeContainer(id: string): Promise<void> {
    try {
      execSync(`docker rm -f ${id}`, { timeout: 10000, stdio: "ignore" });
    } catch {
      /* best effort */
    }
  }

  isContainerRunning(id: string): boolean {
    try {
      const result = execSync(`docker inspect -f "{{.State.Running}}" ${id}`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return result === "true";
    } catch {
      return false;
    }
  }

  imageExists(image: string): boolean {
    try {
      execSync(`docker image inspect ${image}`, {
        stdio: "ignore",
        timeout: 10000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string): Promise<void> {
    execSync(`docker pull ${image}`, { stdio: "inherit", timeout: 300000 });
  }

  listContainers(prefix: string): string[] {
    try {
      const output = execSync(
        `docker ps -a --filter name=${prefix} --format "{{.ID}}"`,
        { encoding: "utf-8", timeout: 10000 },
      );
      return output
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async healthCheck(id: string): Promise<boolean> {
    try {
      const result = execSync(`docker exec ${id} echo "healthy"`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return result === "healthy";
    } catch {
      return false;
    }
  }

  private getDockerContext(): string {
    try {
      return execSync("docker context show", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
    } catch {
      return "default";
    }
  }
}

export class AppleContainerEngine implements ISandboxEngine {
  readonly engineType: SandboxEngineType = "apple-container";

  isAvailable(): boolean {
    if (platform() !== "darwin") return false;
    try {
      execSync("which container", { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  getInfo(): EngineInfo {
    let version = "unknown";
    try {
      version = execSync("container --version 2>&1 || echo unknown", {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
    } catch {
      // ignore
    }

    return {
      type: "apple-container",
      available: this.isAvailable(),
      version,
      platform: "darwin",
      arch: arch(),
      details: `Apple Silicon: ${arch() === "arm64" ? "yes" : "no"}`,
    };
  }

  async runContainer(opts: ContainerRunOptions): Promise<string> {
    // Apple Container uses `container run` with different syntax than Docker.
    // It doesn't have a `-d` detach flag — instead, we spawn it as a background
    // process with stdin piped so it doesn't block.
    const args = ["run", "--name", opts.name];

    // Apple Container: --mount for readonly, -v for read-write
    for (const mount of opts.mounts) {
      if (mount.readonly) {
        args.push(
          "--mount",
          `type=bind,source=${mount.host},target=${mount.container},readonly`,
        );
      } else {
        args.push("-v", `${mount.host}:${mount.container}`);
      }
    }

    for (const [key, value] of Object.entries(opts.env)) {
      args.push("-e", `${key}=${value}`);
    }

    args.push(opts.image);

    // Spawn as a background process (non-blocking) instead of execSync.
    // Apple Container doesn't support `-d`; we use spawn with detached + unref.
    return new Promise<string>((resolve, reject) => {
      const proc = spawn("container", args, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: true,
      });

      // Collect initial output for error detection
      let stderr = "";
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      // Give it a moment to start, then check if it's still running
      const checkTimer = setTimeout(() => {
        if (proc.exitCode !== null) {
          reject(new Error(`Apple Container exited immediately: ${stderr}`));
        } else {
          // Container is running in background
          proc.unref(); // Allow Node process to exit independently
          resolve(opts.name);
        }
      }, 2000);

      proc.on("error", (err) => {
        clearTimeout(checkTimer);
        reject(new Error(`Apple Container spawn failed: ${err.message}`));
      });

      proc.on("exit", (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(checkTimer);
          reject(
            new Error(`Apple Container exited with code ${code}: ${stderr}`),
          );
        }
      });
    });
  }

  async execInContainer(
    opts: ContainerExecOptions,
  ): Promise<ContainerExecResult> {
    const start = Date.now();
    const args = ["exec"];
    if (opts.workdir) args.push("-w", opts.workdir);
    args.push(opts.containerId, "sh", "-c", opts.command);

    return new Promise<ContainerExecResult>((resolve) => {
      const proc = spawn("container", args, {
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      const timeoutMs = opts.timeoutMs ?? 30000;
      const timeout = setTimeout(() => proc.kill("SIGKILL"), timeoutMs);

      proc.stdout.on("data", (data: Buffer) => {
        stdout += data.toString();
      });
      proc.stderr.on("data", (data: Buffer) => {
        stderr += data.toString();
      });

      if (opts.stdin) {
        proc.stdin.write(opts.stdin);
        proc.stdin.end();
      }

      proc.on("close", (code) => {
        clearTimeout(timeout);
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr,
          durationMs: Date.now() - start,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timeout);
        resolve({
          exitCode: 1,
          stdout,
          stderr: `Exec error: ${err.message}`,
          durationMs: Date.now() - start,
        });
      });
    });
  }

  async stopContainer(id: string): Promise<void> {
    try {
      execSync(`container stop ${id}`, { timeout: 15000, stdio: "ignore" });
    } catch {
      /* best effort */
    }
  }

  async removeContainer(id: string): Promise<void> {
    // Apple Container uses --rm by default; explicit remove for safety
    try {
      execSync(`container rm ${id}`, { timeout: 10000, stdio: "ignore" });
    } catch {
      /* best effort */
    }
  }

  isContainerRunning(id: string): boolean {
    try {
      execSync(`container inspect ${id}`, { stdio: "ignore", timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }

  imageExists(image: string): boolean {
    try {
      execSync(`container image inspect ${image}`, {
        stdio: "ignore",
        timeout: 10000,
      });
      return true;
    } catch {
      return false;
    }
  }

  async pullImage(image: string): Promise<void> {
    execSync(`container pull ${image}`, { stdio: "inherit", timeout: 300000 });
  }

  listContainers(prefix: string): string[] {
    try {
      const output = execSync(
        `container ps -a --filter name=${prefix} --format "{{.ID}}"`,
        { encoding: "utf-8", timeout: 10000 },
      );
      return output
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async healthCheck(id: string): Promise<boolean> {
    try {
      const result = execSync(`container exec ${id} echo "healthy"`, {
        encoding: "utf-8",
        timeout: 5000,
      }).trim();
      return result === "healthy";
    } catch {
      return false;
    }
  }
}

/** Auto-detect: prefer Apple Container on ARM Mac, else Docker. */
export function detectBestEngine(): ISandboxEngine {
  const os = platform();

  if (os === "darwin" && arch() === "arm64") {
    const apple = new AppleContainerEngine();
    if (apple.isAvailable()) {
      return apple;
    }
  }

  const docker = new DockerEngine();
  return docker; // Falls through to Docker (fails at runtime if not available)
}

export function createEngine(type: SandboxEngineType): ISandboxEngine {
  switch (type) {
    case "apple-container":
      return new AppleContainerEngine();
    case "docker":
      return new DockerEngine();
    case "auto":
      return detectBestEngine();
    default:
      return new DockerEngine();
  }
}

export function getAllEngineInfo(): EngineInfo[] {
  const engines: ISandboxEngine[] = [
    new DockerEngine(),
    new AppleContainerEngine(),
  ];
  return engines.map((e) => e.getInfo());
}

export function getPlatformSetupNotes(): string {
  const os = platform();
  const a = arch();

  switch (os) {
    case "darwin":
      if (a === "arm64") {
        return [
          "macOS Apple Silicon detected.",
          "Preferred: Apple Container (install via: brew install apple/apple/container-tools)",
          "Fallback: Docker Desktop for Mac",
          "Apple Container provides per-container VM isolation (strongest).",
        ].join("\n");
      }
      return [
        "macOS Intel detected.",
        "Use: Docker Desktop for Mac",
        "Apple Container is not available on Intel Macs.",
      ].join("\n");

    case "linux":
      return [
        "Linux detected.",
        "Use: Docker (install via your package manager)",
        "Docker provides namespace-based isolation.",
        "For stronger isolation, consider gVisor runtime (--runtime=runsc).",
      ].join("\n");

    case "win32":
      return [
        "Windows detected.",
        "Use: Docker Desktop with WSL2 backend",
        "Ensure WSL2 is enabled: wsl --install",
        "Docker Desktop must be configured to use WSL2 engine.",
        "Containers run inside a lightweight Linux VM via Hyper-V.",
      ].join("\n");

    default:
      return `Unsupported platform: ${os}. Docker may work if installed.`;
  }
}
