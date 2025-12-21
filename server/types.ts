import { z } from "zod";

import { ConfigSchema, ServiceSchema } from "./schema.js";

export type Service = z.infer<typeof ServiceSchema>;
export type Config = z.infer<typeof ConfigSchema>;

export enum RestartPolicy {
  ALWAYS = "always",
  NEVER = "never",
  UNEXPECTED = "unexpected",
}

export enum ServiceState {
  STOPPED = "STOPPED",
  STARTING = "STARTING",
  RUNNING = "RUNNING",
  BACKOFF = "BACKOFF",
  STOPPING = "STOPPING",
  EXITED = "EXITED",
  FATAL = "FATAL",
  UNKNOWN = "UNKNOWN",
}

export enum Signals {
  SIGTERM = "SIGTERM",
  SIGINT = "SIGINT",
  SIGKILL = "SIGKILL",
  SIGQUIT = "SIGQUIT",
  SIGHUP = "SIGHUP",
  SIGUSR1 = "SIGUSR1",
  SIGUSR2 = "SIGUSR2",
}

export type Command =
  | { type: "status" }
  | { type: "start"; service: string }
  | { type: "stop"; service: string }
  | { type: "restart"; service: string }
  | { type: "reload" }
  | { type: "exit" };
