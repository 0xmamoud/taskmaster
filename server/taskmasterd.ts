import { parseConfig } from "./parsing";
import type { Command } from "./types";

try {
  const config = parseConfig("./conf.json");

  const server = Bun.serve({
    port: parseInt(process.env.PORT || "3333"),
    fetch(request, server) {
      if (server.upgrade(request)) {
        return;
      }
      return new Response("Hello from Taskmasterd!");
    },
    websocket: {
      message(ws, message) {
        const cmd: Command = JSON.parse(message.toString());
        switch (cmd.type) {
          case "status":
            // Handle status command
            ws.send(JSON.stringify({ status: "All systems operational" }));
            break;
          case "start":
            // Handle start command for cmd.service
            ws.send(
              JSON.stringify({ status: `Service ${cmd.service} started` })
            );
            break;
          case "stop":
            // Handle stop command for cmd.service
            ws.send(
              JSON.stringify({ status: `Service ${cmd.service} stopped` })
            );
            break;
          case "restart":
            // Handle restart command for cmd.service
            ws.send(
              JSON.stringify({ status: `Service ${cmd.service} restarted` })
            );
            break;
          case "reload":
            // Handle reload command
            ws.send(JSON.stringify({ status: "Configuration reloaded" }));
            break;
          case "exit":
            // Handle exit command
            ws.send(JSON.stringify({ status: "Shutting down server" }));
            ws.close();
            process.exit(0);
            break;
          default:
            ws.send(JSON.stringify({ error: "Unknown command" }));
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
