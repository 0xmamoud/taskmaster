import { parseConfig } from "./parsing";
import type { Command } from "./types";
import { Supervisor } from "./supervisor";
import type { ServerWebSocket } from "bun";

const CONFIG_PATH = process.env.CONFIG_PATH || "./conf.json";

function sendSuccess(ws: ServerWebSocket<unknown>, data: unknown): void {
  ws.send(JSON.stringify({ success: true, data }));
}

function sendError(ws: ServerWebSocket<unknown>, error: string): void {
  ws.send(JSON.stringify({ success: false, error }));
}

(async () => {
  try {
    const config = parseConfig(CONFIG_PATH);
    const supervisor = new Supervisor(config);

    await supervisor.start();

    const server = Bun.serve({
      port: parseInt(process.env.PORT || "3333"),
      fetch(request, server) {
        if (server.upgrade(request)) {
          return;
        }
        return new Response("Hello from Taskmasterd!");
      },
      websocket: {
        async message(ws, message) {
          try {
            const cmd: Command = JSON.parse(message.toString());

            switch (cmd.type) {
              case "status": {
                const states = supervisor.getStates();
                sendSuccess(ws, states);
                break;
              }

              case "start": {
                const result = await supervisor.startService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, result);
                break;
              }

              case "stop": {
                const result = await supervisor.stopService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, result);
                break;
              }

              case "restart": {
                const result = await supervisor.restartService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, result);
                break;
              }

              case "reload": {
                try {
                  const newConfig = parseConfig(CONFIG_PATH);
                  const changes = await supervisor.reloadConfig(newConfig);
                  sendSuccess(ws, changes);
                } catch (error) {
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  sendError(ws, `Config reload failed: ${errorMessage}`);
                }
                break;
              }

              case "exit": {
                await supervisor.exit();
                sendSuccess(ws, "Server shutting down");
                ws.close();
                process.exit(0);
              }

              default: {
                sendError(ws, `Unknown command type`);
              }
            }
          } catch (error) {
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            sendError(ws, `Command processing failed: ${errorMessage}`);
          }
        },
        open() {
          console.log("[WebSocket] New connection opened");
        },
        close(_, code, message) {
          console.log(`[WebSocket] Connection closed: ${code} - ${message}`);
        },
      },
    });

    console.log(`Taskmasterd is running on port ${server.port}`);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();
