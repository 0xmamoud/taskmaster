const port = parseInt(process.env.PORT || "4002");

const server = Bun.serve({
  port,
  fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return Response.json({
        status: "healthy",
        service: "web",
        pid: process.pid,
      });
    }

    return new Response(
      `<!DOCTYPE html>
<html>
<head><title>Web Service</title></head>
<body>
  <h1>Web Service</h1>
  <p>PID: ${process.pid}</p>
  <p>Port: ${port}</p>
</body>
</html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  },
});

console.log(`[WEB] Running on port ${server.port} (PID: ${process.pid})`);
