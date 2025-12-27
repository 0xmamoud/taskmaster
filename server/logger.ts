import { appendFileSync } from "fs";

type LogLevel = "INFO" | "WARN" | "ERROR";

class Logger {
  private logFile: string | null;

  constructor(logFile?: string) {
    this.logFile = logFile || null;
  }

  private log(level: LogLevel, service: string, message: string): void {
    const timestamp = new Date().toISOString();
    const line = `[${timestamp}] [${level}] [${service}] ${message}`;

    console.log(line);

    if (this.logFile) {
      appendFileSync(this.logFile, line + "\n");
    }
  }

  info(service: string, message: string): void {
    this.log("INFO", service, message);
  }

  warn(service: string, message: string): void {
    this.log("WARN", service, message);
  }

  error(service: string, message: string): void {
    this.log("ERROR", service, message);
  }
}

export const logger = new Logger(process.env.LOG_FILE || "taskmaster.log");
