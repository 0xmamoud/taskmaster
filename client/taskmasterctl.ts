import type { Command, Response } from "@/server/types";
import * as readline from "readline";

const PORT = parseInt(process.env.PORT || "3333");

const COMMANDS = [
  "status",
  "start",
  "stop",
  "restart",
  "reload",
  "exit",
  "help",
  "quit",
];
const SERVICES: string[] = []; // Will be populated after first status call

function connectToServer(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:${port}`);

    ws.onopen = () => {
      resolve(ws);
    };

    ws.onerror = (err) => {
      reject(new Error(`Connection failed: ${err}`));
    };
  });
}

function parseCommand(input: string): Command | null {
  const parts = input.trim().split(/\s+/);
  const cmd = parts[0]?.toLowerCase();
  const arg = parts[1];

  switch (cmd) {
    case "status":
      return { type: "status" };
    case "start":
      if (!arg) return null;
      return { type: "start", service: arg };
    case "stop":
      if (!arg) return null;
      return { type: "stop", service: arg };
    case "restart":
      if (!arg) return null;
      return { type: "restart", service: arg };
    case "reload":
      return { type: "reload" };
    case "exit":
      return { type: "exit" };
    default:
      return null;
  }
}

function formatResponse(response: Response): string {
  if (!response.success) {
    return `Error: ${response.error}`;
  }

  switch (response.type) {
    case "status":
      return response.data;
    case "start":
    case "restart":
      return `Service '${response.data.name}' (${response.data.instances} instance(s))`;
    case "stop":
      return `Service '${response.data}' stopped`;
    case "reload": {
      const { removed, modified, added } = response.data;
      const lines: string[] = [];
      if (removed.length) lines.push(`Removed: ${removed.join(", ")}`);
      if (modified.length) lines.push(`Modified: ${modified.join(", ")}`);
      if (added.length) lines.push(`Added: ${added.join(", ")}`);
      return lines.length ? lines.join("\n") : "No changes";
    }
    case "exit":
      return response.data;
  }
}

function printHelp(): void {
  console.log(`Available commands:
  status              - Show status of all services
  start <service>     - Start a service
  stop <service>      - Stop a service
  restart <service>   - Restart a service
  reload              - Reload configuration
  exit                - Shutdown the server
  help                - Show this help
  quit                - Exit the client`);
}

async function sendCommand(ws: WebSocket, cmd: Command): Promise<Response> {
  return new Promise((resolve) => {
    const handler = (event: MessageEvent) => {
      ws.removeEventListener("message", handler);
      resolve(JSON.parse(event.data));
    };

    ws.addEventListener("message", handler);
    ws.send(JSON.stringify(cmd));
  });
}

async function startREPL(ws: WebSocket): Promise<void> {
  // Fetch services for completion
  const statusResponse = await sendCommand(ws, { type: "status" });
  if (statusResponse.success && statusResponse.type === "status") {
    const lines = statusResponse.data.split("\n").filter(Boolean);
    const serviceNames = lines
      .map((line: string) => line.split("#")[0])
      .filter((name): name is string => name !== undefined);
    SERVICES.push(...new Set(serviceNames));
  }

  const completer = (line: string): [string[], string] => {
    const parts = line.split(/\s+/);
    const currentWord = parts[parts.length - 1] ?? "";

    if (parts.length <= 1) {
      // Complete command
      const hits = COMMANDS.filter((c) => c.startsWith(currentWord));
      return [hits.length ? hits : COMMANDS, currentWord];
    }

    const command = parts[0] ?? "";
    if (parts.length === 2 && ["start", "stop", "restart"].includes(command)) {
      const hits = SERVICES.filter((s) => s.startsWith(currentWord));
      return [hits.length ? hits : SERVICES, currentWord];
    }

    return [[], line];
  };

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: "taskmaster> ",
    historySize: 100,
    completer,
    terminal: true,
  });

  rl.prompt();

  rl.on("line", async (line) => {
    const input = line.trim();

    if (input === "quit") {
      console.log("Goodbye!");
      ws.close();
      rl.close();
      process.exit(0);
    }

    if (input === "help") {
      printHelp();
      rl.prompt();
      return;
    }

    if (!input) {
      rl.prompt();
      return;
    }

    const cmd = parseCommand(input);

    if (!cmd) {
      console.log(
        `Unknown command: ${input}. Type 'help' for available commands.`
      );
      rl.prompt();
      return;
    }

    const response = await sendCommand(ws, cmd);
    console.log(formatResponse(response));

    if (cmd.type === "exit") {
      ws.close();
      rl.close();
      process.exit(0);
    }

    rl.prompt();
  });

  rl.on("close", () => {
    console.log("\nGoodbye!");
    ws.close();
    process.exit(0);
  });
}

async function main(): Promise<void> {
  try {
    console.log(`Connecting to taskmasterd on port ${PORT}...`);
    const ws = await connectToServer(PORT);
    console.log("Connected!");

    ws.onclose = () => {
      console.log("\nConnection closed");
      process.exit(0);
    };

    await startREPL(ws);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
