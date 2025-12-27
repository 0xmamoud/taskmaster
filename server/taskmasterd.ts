import { parseConfig } from "./parsing";
import type { Command } from "./types";
import { Supervisor } from "./supervisor";
import type { ServerWebSocket } from "bun";
import { logger } from "./logger";

const CONFIG_PATH = process.env.CONFIG_PATH || "./conf.json";

function sendSuccess(
  ws: ServerWebSocket<unknown>,
  type: Command["type"],
  data: unknown
): void {
  ws.send(JSON.stringify({ success: true, type, data }));
}

function sendError(ws: ServerWebSocket<unknown>, error: string): void {
  ws.send(JSON.stringify({ success: false, error }));
}

(async () => {
  try {
    const config = parseConfig(CONFIG_PATH);
    const supervisor = new Supervisor(config);

    await supervisor.start();

    process.on("SIGHUP", async () => {
      logger.info("taskmasterd", "Received SIGHUP, reloading configuration...");
      try {
        const newConfig = parseConfig(CONFIG_PATH);
        const changes = await supervisor.reloadConfig(newConfig);
        logger.info(
          "taskmasterd",
          `Config reloaded: added=${changes.added.length}, modified=${changes.modified.length}, removed=${changes.removed.length}`
        );
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        logger.error("taskmasterd", `Config reload failed: ${errorMessage}`);
      }
    });

    // Handle SIGINT (Ctrl+C) for graceful shutdown
    process.on("SIGINT", async () => {
      logger.info(
        "taskmasterd",
        "Received SIGINT, shutting down gracefully..."
      );
      await supervisor.exit();
      logger.info("taskmasterd", "All services stopped. Goodbye!");
      process.exit(0);
    });

    // Handle SIGTERM for graceful shutdown
    process.on("SIGTERM", async () => {
      logger.info(
        "taskmasterd",
        "Received SIGTERM, shutting down gracefully..."
      );
      await supervisor.exit();
      logger.info("taskmasterd", "All services stopped. Goodbye!");
      process.exit(0);
    });

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
                sendSuccess(ws, "status", states);
                break;
              }

              case "start": {
                const result = await supervisor.startService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, "start", result);
                break;
              }

              case "stop": {
                const result = await supervisor.stopService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, "stop", result);
                break;
              }

              case "restart": {
                const result = await supervisor.restartService(cmd.service);
                if (!result) {
                  sendError(ws, `Service '${cmd.service}' not found`);
                  return;
                }
                sendSuccess(ws, "restart", result);
                break;
              }

              case "reload": {
                try {
                  const newConfig = parseConfig(CONFIG_PATH);
                  const changes = await supervisor.reloadConfig(newConfig);
                  sendSuccess(ws, "reload", changes);
                } catch (error) {
                  const errorMessage =
                    error instanceof Error ? error.message : String(error);
                  sendError(ws, `Config reload failed: ${errorMessage}`);
                }
                break;
              }

              case "exit": {
                await supervisor.exit();
                sendSuccess(ws, "exit", "Server shutting down");
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
