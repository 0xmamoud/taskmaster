import type { Subprocess } from "bun";
import { type Service, ServiceState, RestartPolicy } from "./types";

export class ServiceInstance {
  private state: ServiceState = ServiceState.STOPPED;
  private processId: Subprocess | null = null;
  private retryCount: number = 0;

  constructor(
    public serviceName: string,
    public instanceId: number,
    public config: Service
  ) {}

  async start(): Promise<void> {
    if (
      this.state !== ServiceState.STOPPED &&
      this.state !== ServiceState.BACKOFF
    ) {
      return;
    }

    this.state = ServiceState.STARTING;

    this.processId = Bun.spawn(["sh", "-c", this.config.cmd], {
      cwd: this.config.workingdir,
      env: this.config.env,
    });

    const startTimeout = Bun.sleep(this.config.starttime * 1000);
    const processExited = this.processId.exited;

    const result = await Promise.race([startTimeout, processExited]);

    if (typeof result === "number") {
      this.handleExit(result);
      return;
    }

    this.state = ServiceState.RUNNING;

    // Monitor exit for processes that started successfully
    this.processId.exited.then((exitCode) => {
      this.handleExit(exitCode);
    });
  }

  async stop(): Promise<number | null> {
    if (
      this.state !== ServiceState.RUNNING &&
      this.state !== ServiceState.STARTING
    ) {
      return null;
    }

    if (!this.processId) {
      return null;
    }

    this.state = ServiceState.STOPPING;

    this.processId.kill(this.config.stopsignal);

    const stopTimeout = Bun.sleep(this.config.stoptime * 1000);
    const processExited = this.processId.exited;

    const result = await Promise.race([stopTimeout, processExited]);

    let exitCode: number;
    if (result === undefined) {
      this.processId.kill("SIGKILL");
      exitCode = await this.processId.exited;
    } else {
      exitCode = result;
    }

    this.state = ServiceState.STOPPED;
    this.processId = null;

    return exitCode;
  }

  async restart(): Promise<void> {
    if (
      this.state === ServiceState.RUNNING ||
      this.state === ServiceState.STARTING
    ) {
      await this.stop();
    }
    await this.start();
  }

  getState(): ServiceState {
    return this.state;
  }

  private handleExit(exitCode: number): void {
    if (this.state === ServiceState.STOPPING) {
      this.state = ServiceState.STOPPED;
      return;
    }

    const shouldRestart = this.shouldRestart(exitCode);

    if (shouldRestart) {
      this.retryCount++;
      if (this.retryCount > this.config.startretries) {
        this.state = ServiceState.FATAL;
      } else {
        this.state = ServiceState.BACKOFF;
        setTimeout(() => this.start(), 100);
      }
    } else {
      this.state = ServiceState.EXITED;
    }
  }

  private shouldRestart(exitCode: number): boolean {
    switch (this.config.autorestart) {
      case RestartPolicy.ALWAYS:
        return true;
      case RestartPolicy.NEVER:
        return false;
      case RestartPolicy.UNEXPECTED:
        return !this.config.exitcodes.includes(exitCode);
      default:
        return false;
    }
  }
}
