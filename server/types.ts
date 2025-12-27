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
  SIGABRT = "SIGABRT",
  SIGALRM = "SIGALRM",
  SIGBUS = "SIGBUS",
  SIGCHLD = "SIGCHLD",
  SIGCONT = "SIGCONT",
  SIGFPE = "SIGFPE",
  SIGHUP = "SIGHUP",
  SIGILL = "SIGILL",
  SIGINT = "SIGINT",
  SIGIO = "SIGIO",
  SIGIOT = "SIGIOT",
  SIGKILL = "SIGKILL",
  SIGPIPE = "SIGPIPE",
  SIGPOLL = "SIGPOLL",
  SIGPROF = "SIGPROF",
  SIGPWR = "SIGPWR",
  SIGQUIT = "SIGQUIT",
  SIGSEGV = "SIGSEGV",
  SIGSTKFLT = "SIGSTKFLT",
  SIGSTOP = "SIGSTOP",
  SIGSYS = "SIGSYS",
  SIGTERM = "SIGTERM",
  SIGTRAP = "SIGTRAP",
  SIGTSTP = "SIGTSTP",
  SIGTTIN = "SIGTTIN",
  SIGTTOU = "SIGTTOU",
  SIGUNUSED = "SIGUNUSED",
  SIGURG = "SIGURG",
  SIGUSR1 = "SIGUSR1",
  SIGUSR2 = "SIGUSR2",
  SIGVTALRM = "SIGVTALRM",
  SIGWINCH = "SIGWINCH",
  SIGXCPU = "SIGXCPU",
  SIGXFSZ = "SIGXFSZ",
  SIGBREAK = "SIGBREAK",
  SIGLOST = "SIGLOST",
  SIGINFO = "SIGINFO",
}

export type Command =
  | { type: "status" }
  | { type: "start"; service: string }
  | { type: "stop"; service: string }
  | { type: "restart"; service: string }
  | { type: "reload" }
  | { type: "exit" };

export type SuccessResponse =
  | { success: true; type: "status"; data: string }
  | { success: true; type: "start"; data: { name: string; instances: number } }
  | { success: true; type: "stop"; data: string }
  | {
      success: true;
      type: "restart";
      data: { name: string; instances: number };
    }
  | {
      success: true;
      type: "reload";
      data: { removed: string[]; modified: string[]; added: string[] };
    }
  | { success: true; type: "exit"; data: string };

export type ErrorResponse = { success: false; error: string };

export type Response = SuccessResponse | ErrorResponse;
