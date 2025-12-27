import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TEST_DIR = join(tmpdir(), "taskmaster-ws-test");
const TEST_WORKDIR = join(TEST_DIR, "workdir");
const TEST_LOGS_DIR = join(TEST_DIR, "logs");
const TEST_PORT = 3334;
const CONFIG_PATH = join(TEST_DIR, "conf.json");

let ws: WebSocket | null = null;

function createTestConfig() {
  const config = {
    services: {
      testservice: {
        cmd: "while true; do sleep 1; done",
        numprocs: 1,
        autostart: false,
        autorestart: "never",
        exitcodes: [0],
        startretries: 1,
        starttime: 1,
        stopsignal: "SIGTERM",
        stoptime: 2,
        stdout: join(TEST_LOGS_DIR, "test-stdout.log"),
        stderr: join(TEST_LOGS_DIR, "test-stderr.log"),
        env: {},
        workingdir: TEST_WORKDIR,
        umask: "022",
      },
    },
  };
  writeFileSync(CONFIG_PATH, JSON.stringify(config));
}

async function sendCommand(
  ws: WebSocket,
  cmd: object
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timeout")), 5000);

    const handler = (event: MessageEvent) => {
      clearTimeout(timeout);
      ws.removeEventListener("message", handler);
      resolve(JSON.parse(event.data));
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(cmd));
  });
}

async function connectWebSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const timeout = setTimeout(
      () => reject(new Error("Connection timeout")),
      5000
    );

    socket.onopen = () => {
      clearTimeout(timeout);
      resolve(socket);
    };

    socket.onerror = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

async function waitForServer(maxAttempts = 10): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const testWs = await connectWebSocket();
      testWs.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  throw new Error("Server did not start");
}

beforeAll(async () => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_WORKDIR, { recursive: true });
  mkdirSync(TEST_LOGS_DIR, { recursive: true });

  createTestConfig();

  process.env.PORT = String(TEST_PORT);
  process.env.CONFIG_PATH = CONFIG_PATH;

  await import("@/server/taskmasterd");

  await waitForServer();
  ws = await connectWebSocket();
});

afterAll(async () => {
  if (ws) {
    ws.close();
  }

  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("taskmasterd WebSocket communication", () => {
  test("status command returns service states", async () => {
    const response = await sendCommand(ws!, { type: "status" });

    expect(response.success).toBe(true);
    expect(typeof response.data).toBe("string");
  });

  test("start command starts a service", async () => {
    const response = await sendCommand(ws!, {
      type: "start",
      service: "testservice",
    });

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty("name");
    expect(response.data).toHaveProperty("instances");
  });

  test("start command returns error for unknown service", async () => {
    const response = await sendCommand(ws!, {
      type: "start",
      service: "nonexistent",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("not found");
  });

  test("stop command stops a service", async () => {
    const response = await sendCommand(ws!, {
      type: "stop",
      service: "testservice",
    });

    expect(response.success).toBe(true);
  });

  test("stop command returns error for unknown service", async () => {
    const response = await sendCommand(ws!, {
      type: "stop",
      service: "nonexistent",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("not found");
  });

  test("restart command restarts a service", async () => {
    const response = await sendCommand(ws!, {
      type: "restart",
      service: "testservice",
    });

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty("name");
    expect(response.data).toHaveProperty("instances");
  });

  test("restart command returns error for unknown service", async () => {
    const response = await sendCommand(ws!, {
      type: "restart",
      service: "nonexistent",
    });

    expect(response.success).toBe(false);
    expect(response.error).toContain("not found");
  });

  test("reload command reloads config", async () => {
    const response = await sendCommand(ws!, { type: "reload" });

    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty("removed");
    expect(response.data).toHaveProperty("modified");
    expect(response.data).toHaveProperty("added");
  });

  test("reload command returns error on invalid config", async () => {
    const invalidConfig = {
      services: {
        badservice: {
          cmd: "", // invalid: empty cmd
          numprocs: 0, // invalid: must be >= 1
          autostart: true,
          autorestart: "invalid", // invalid: must be always|never|unexpected
          exitcodes: [],
          startretries: 1,
          starttime: 1,
          stopsignal: "SIGTERM",
          stoptime: 2,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(invalidConfig));

    const response = await sendCommand(ws!, { type: "reload" });

    expect(response.success).toBe(false);
    expect(response.error).toContain("Config reload failed");

    // Restore valid config
    createTestConfig();
  });

  test("unknown command returns error", async () => {
    const response = await sendCommand(ws!, { type: "unknown" } as any);

    expect(response.success).toBe(false);
    expect(response.error).toContain("Unknown command");
  });

  test("invalid JSON returns error", async () => {
    return new Promise<void>((resolve) => {
      const handler = (event: MessageEvent) => {
        ws!.removeEventListener("message", handler);
        const response = JSON.parse(event.data);
        expect(response.success).toBe(false);
        expect(response.error).toContain("Command processing failed");
        resolve();
      };

      ws!.addEventListener("message", handler);
      ws!.send("{ invalid json }");
    });
  });
});
