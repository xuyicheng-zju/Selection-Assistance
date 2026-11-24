/**
 * 内嵌后端进程管理。
 *
 * 生产模式：app.whenReady() 后 spawn `uv run uvicorn app.main:app --port N`，
 * 轮询 /api/health 就绪后 resolve；退出时 tree-kill。
 * 开发模式：后端由开发者独立启动（uv run uvicorn），本模块跳过 spawn。
 */
import { spawn, ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";
import http from "node:http";
import treeKill from "tree-kill";
import { app } from "electron";

/** 解析后端项目目录（backend，与本前端同级，即 selection-assistant/backend） */
export function resolveBackendDir(): string {
  // dist-electron/ 编译输出在 frontend/dist-electron/，回退两级到 selection-assistant/
  // 再进 backend/。兼容多种运行方式（开发 / 打包 / 手动 cwd）。
  const candidates = [
    path.join(app.getPath("userData"), "backend"),
    path.resolve(__dirname, "..", "..", "backend"),
    path.resolve(__dirname, "..", "backend"),
    path.resolve(app.getAppPath(), "..", "backend"),
    path.resolve(process.cwd(), "..", "backend"),
    path.resolve(process.cwd(), "backend"),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, "pyproject.toml"))) return c;
  }
  return candidates[0];
}

/** 简单的 GET 健康探测（避免引入额外依赖） */
function probeHealth(base: string): Promise<boolean> {
  return new Promise((resolve) => {
    const url = new URL("/api/health", base);
    const req = http.get(
      { hostname: url.hostname, port: url.port, path: url.pathname, timeout: 1500 },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            resolve(res.statusCode === 200 && JSON.parse(data).ok === true);
          } catch {
            resolve(false);
          }
        });
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

export class BackendProcess {
  private child: ChildProcess | null = null;
  public port = 8000;
  public base = "http://127.0.0.1:8000";
  public token = "";

  /** 启动后端，返回实际监听地址。开发/生产都自动 spawn（除非已检测到 8000 在跑）。 */
  async start(): Promise<string> {
    // 若已有后端在 8000 跑（用户手动起的），直接复用
    if (process.env.NODE_ENV === "development" && await probeHealth("http://127.0.0.1:8000")) {
      this.base = "http://127.0.0.1:8000";
      this.port = 8000;
      return this.base;
    }

    const port = await this.findFreePort(8000);
    this.port = port;
    this.base = `http://127.0.0.1:${port}`;
    this.token = randomBytes(24).toString("hex");

    const backendDir = resolveBackendDir();
    const venvPython = path.join(backendDir, ".venv", "bin", "python");
    // 优先用 venv 里的 python -m uvicorn（最稳，规避 uv run uvicorn 的 spawn 问题）
    const hasVenv = existsSync(venvPython);
    const cmd = hasVenv ? venvPython : "uv";
    const uvicorn = ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(port), "--no-access-log"];
    const args = hasVenv ? uvicorn : ["run", "python", ...uvicorn];
    console.log(`[backend] spawning: ${cmd} ${args.join(" ")} (cwd=${backendDir})`);
    this.child = spawn(cmd, args, {
      cwd: backendDir,
      env: { ...process.env, SELECTION_LOCAL_TOKEN: this.token },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout?.on("data", (d) =>
      process.stdout.write(`[backend] ${d}`)
    );
    this.child.stderr?.on("data", (d) =>
      process.stderr.write(`[backend] ${d}`)
    );
    this.child.on("error", (error) => console.error("[backend]", error.message));
    this.child.on("exit", (code) => {
      console.log(`[backend] exited with code ${code}`);
    });

    await this.waitReady(port);
    return this.base;
  }

  /** 轮询直到健康检查通过，最多 ~20s */
  async waitReady(port: number, maxTries = 40): Promise<void> {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < maxTries; i++) {
      if (await probeHealth(base)) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(
      `后端在 ${base} 启动超时，请检查 backend 是否可独立运行（uv run uvicorn app.main:app --port ${port}）`
    );
  }

  /** 释放端口探测（从 startPort 开始找可用端口） */
  private async findFreePort(startPort: number): Promise<number> {
    for (let p = startPort; p < startPort + 10; p++) {
      const ok = await isPortFree(p);
      if (ok) return p;
    }
    return startPort;
  }

  /** 停止后端进程 */
  async stop(): Promise<void> {
    if (!this.child) return;
    const pid = this.child.pid;
    this.child = null;
    if (pid) {
      await new Promise<void>((resolve) =>
        treeKill(pid, "SIGTERM", () => resolve())
      );
    }
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = http.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, "127.0.0.1");
  });
}
