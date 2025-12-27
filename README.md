# Taskmaster

A lightweight implementation of [supervisord](http://supervisord.org/) written in TypeScript using Bun. Taskmaster provides a daemon (`taskmasterd`) to manage and monitor processes, and a CLI client (`taskmasterctl`) to interact with it.

## Features

- Process supervision with automatic restart policies
- Multiple process instances per service
- Hot configuration reload without downtime
- Graceful shutdown with configurable stop signals and timeouts
- stdout/stderr redirection to files
- Environment variables injection
- Working directory and umask configuration per service
- WebSocket-based communication between client and daemon

## Installation

```bash
bun install
```

## Usage

### Start the daemon

```bash
bun run server/taskmasterd.ts
```

### Start the CLI client

```bash
bun run client/taskmasterctl.ts
```

### Available commands

| Command             | Description                   |
| ------------------- | ----------------------------- |
| `status`            | Show status of all services   |
| `start <service>`   | Start a service               |
| `stop <service>`    | Stop a service                |
| `restart <service>` | Restart a service             |
| `reload`            | Hot reload configuration file |
| `exit`              | Shutdown the daemon           |
| `help`              | Show available commands       |
| `quit`              | Exit the client               |

---

## Configuration File

Taskmaster uses a JSON configuration file (`conf.json`) to define services. Each service has the following options:

| Option         | Type                                  | Description                                                   |
| -------------- | ------------------------------------- | ------------------------------------------------------------- |
| `cmd`          | `string`                              | Command to execute                                            |
| `numprocs`     | `number`                              | Number of instances to run (1-100)                            |
| `autostart`    | `boolean`                             | Start automatically when daemon starts                        |
| `autorestart`  | `"always" \| "never" \| "unexpected"` | Restart policy                                                |
| `exitcodes`    | `number[]`                            | Exit codes considered as "expected" (for `unexpected` policy) |
| `startretries` | `number`                              | Max retry attempts before marking as FATAL                    |
| `starttime`    | `number`                              | Seconds to wait before considering process as started         |
| `stopsignal`   | `string`                              | Signal to send for graceful stop (e.g., `SIGTERM`)            |
| `stoptime`     | `number`                              | Seconds to wait before sending SIGKILL                        |
| `stdout`       | `string \| null`                      | File path for stdout redirection (null = discard)             |
| `stderr`       | `string \| null`                      | File path for stderr redirection (null = discard)             |
| `env`          | `Record<string, string>`              | Environment variables to set                                  |
| `workingdir`   | `string`                              | Working directory for the process                             |
| `umask`        | `string`                              | Umask in octal format (e.g., `"022"`)                         |

### Example configuration

```json
{
  "services": {
    "web": {
      "cmd": "bun run web.ts",
      "numprocs": 2,
      "autostart": true,
      "autorestart": "always",
      "exitcodes": [0],
      "startretries": 3,
      "starttime": 5,
      "stopsignal": "SIGTERM",
      "stoptime": 5,
      "stdout": "/var/log/web-stdout.log",
      "stderr": "/var/log/web-stderr.log",
      "env": {
        "PORT": "3000",
        "NODE_ENV": "production"
      },
      "workingdir": "/app/services",
      "umask": "022"
    }
  }
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         taskmasterctl                           │
│                      (CLI Client - REPL)                        │
└──────────────────────────┬──────────────────────────────────────┘
                           │ WebSocket
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         taskmasterd                             │
│                    (Daemon / WebSocket Server)                  │
├─────────────────────────────────────────────────────────────────┤
│                          Supervisor                             │
│               (Manages all ServiceGroups)                       │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│ ServiceGroup │ ServiceGroup │ ServiceGroup │        ...         │
│   (web)      │   (api)      │   (worker)   │                    │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│ Instance #1  │ Instance #1  │ Instance #1  │                    │
│ Instance #2  │              │ Instance #2  │                    │
│     ...      │              │ Instance #3  │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
```

### Components

| Component           | File                        | Responsibility                                    |
| ------------------- | --------------------------- | ------------------------------------------------- |
| **taskmasterd**     | `server/taskmasterd.ts`     | Main daemon, WebSocket server, command routing    |
| **taskmasterctl**   | `client/taskmasterctl.ts`   | CLI client with REPL interface                    |
| **Supervisor**      | `server/supervisor.ts`      | Manages all service groups, handles config reload |
| **ServiceGroup**    | `server/serviceGroup.ts`    | Manages multiple instances of a single service    |
| **ServiceInstance** | `server/serviceInstance.ts` | Manages a single process (spawn, stop, restart)   |

---

## Core Concepts

### Service States

Each service instance follows a state machine:

```
                    ┌──────────────┐
                    │   STOPPED    │◄─────────────────────┐
                    └──────┬───────┘                      │
                           │ start()                      │
                           ▼                              │
                    ┌──────────────┐                      │
             ┌──────│   STARTING   │──────┐               │
             │      └──────────────┘      │               │
             │                            │               │
    started successfully           exited during          │
             │                     startup                │
             ▼                            │               │
      ┌──────────────┐                    ▼               │
      │   RUNNING    │             ┌──────────────┐       │
      └──────┬───────┘             │   BACKOFF    │───────┤
             │                     └──────┬───────┘       │
             │ unexpected exit            │               │
             │                    retry limit exceeded    │
             ▼                            │               │
      ┌──────────────┐                    ▼               │
      │   STOPPING   │             ┌──────────────┐       │
      └──────┬───────┘             │    FATAL     │       │
             │                     └──────────────┘       │
             │ stop()                                     │
             └────────────────────────────────────────────┘

                    ┌──────────────┐
                    │    EXITED    │  (expected exit, no restart)
                    └──────────────┘
```

### Restart Policies

| Policy       | Behavior                                             |
| ------------ | ---------------------------------------------------- |
| `always`     | Always restart, regardless of exit code              |
| `never`      | Never restart automatically                          |
| `unexpected` | Restart only if exit code is NOT in `exitcodes` list |

---

## Data Flow / Lifecycle

### 1. Daemon Startup

```
1. Parse configuration file (conf.json)
2. Validate config against Zod schema
3. Create Supervisor instance
4. For each service in config:
   └─ Create ServiceGroup
      └─ Create N ServiceInstance(s) based on numprocs
5. Start all services with autostart=true
6. Start WebSocket server (default port 3333)
7. Listen for client commands
```

### 2. Process Startup (per instance)

```
1. Set state to STARTING
2. Build command with umask: "umask XXX && <cmd>"
3. Spawn process with Bun.spawn():
   - Set working directory (cwd)
   - Set environment variables (env)
   - Redirect stdout/stderr to files or discard
4. Wait for starttime seconds
5. If process exits during startup → handle retry logic
6. If still running → set state to RUNNING
7. Monitor process exit asynchronously
```

### 3. Process Stop

```
1. Set state to STOPPING
2. Send configured stopsignal (e.g., SIGTERM)
3. Wait for stoptime seconds
4. If still running → send SIGKILL
5. Set state to STOPPED
```

### 4. Configuration Reload

```
1. Client sends "reload" command
2. Daemon re-parses configuration file
3. Compare old vs new config:
   - Identify removed services
   - Identify modified services
   - Identify added services
4. Stop removed and modified services
5. Delete removed ServiceGroups
6. Create new ServiceGroups for modified/added
7. Start modified/added services (if autostart=true)
8. Return diff to client
```

---

## Environment Variables

| Variable      | Default       | Description                |
| ------------- | ------------- | -------------------------- |
| `CONFIG_PATH` | `./conf.json` | Path to configuration file |
| `PORT`        | `3333`        | WebSocket server port      |

---

## Tech Stack

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **Language**: TypeScript
- **Validation**: [Zod](https://zod.dev) - Schema validation
- **Communication**: WebSocket (native Bun)
