const port = parseInt(process.env.PORT || "4001");

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        service: "api",
        pid: process.pid,
      });
    }

    if (url.pathname === "/users") {
      return Response.json([
        { id: 1, name: "Alice" },
        { id: 2, name: "Bob" },
      ]);
    }

    return Response.json({ message: "API Service", pid: process.pid });
  },
});

console.log(`[API] Running on port ${server.port} (PID: ${process.pid})`);
