import { test, expect, describe, beforeEach } from "bun:test";
import { ServiceInstance } from "@/server/serviceInstance";
import { ServiceState, RestartPolicy } from "@/server/types";
import type { Service } from "@/server/types";
import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync } from "fs";
import { Signals } from "@/server/types";

const TEST_DIR = join(tmpdir(), "taskmaster-service-test");
const TEST_WORKDIR = join(TEST_DIR, "workdir");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_WORKDIR, { recursive: true });
});

const createServiceConfig = (overrides: Partial<Service> = {}): Service => ({
  cmd: "echo 'test'",
  numprocs: 1,
  autostart: true,
  autorestart: RestartPolicy.NEVER,
  exitcodes: [0],
  startretries: 3,
  starttime: 1,
  stopsignal: Signals.SIGTERM,
  stoptime: 2,
  stdout: null,
  stderr: null,
  env: {},
  workingdir: TEST_WORKDIR,
  umask: "022",
  ...overrides,
});

describe("ServiceInstance - Basic lifecycle", () => {
  test("should start in STOPPED state", () => {
    const config = createServiceConfig();
    const instance = new ServiceInstance("test", 0, config);

    expect(instance.getState()).toBe(ServiceState.STOPPED);
  });

  test("should successfully start a process", async () => {
    const config = createServiceConfig({
      cmd: "exec sleep 10",
      starttime: 1,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    expect(instance.getState()).toBe(ServiceState.RUNNING);
  });

  test("should detect failed start (process exits before starttime)", async () => {
    const config = createServiceConfig({
      cmd: "exit 1",
      starttime: 1,
      autorestart: RestartPolicy.ALWAYS,
      startretries: 3,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    // Should be attempting restart after failed start
    expect(instance.getState()).toBe(ServiceState.BACKOFF);
  });

  test("should stop a running process", async () => {
    const config = createServiceConfig({
      cmd: "exec sh -c 'while true; do echo test; done'",
      starttime: 1,
      stoptime: 5,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    const exitCode = await instance.stop();
    expect(instance.getState()).toBe(ServiceState.STOPPED);
    expect(exitCode).toBe(143); // 128 + 15 (SIGTERM)
  });

  test("should force kill with SIGKILL if process doesn't stop", async () => {
    const config = createServiceConfig({
      cmd: "trap '' SIGTERM; sleep 100",
      starttime: 1,
      stoptime: 1,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    const exitCode = await instance.stop();
    expect(instance.getState()).toBe(ServiceState.STOPPED);
    expect(exitCode).toBe(137); // 128 + 9 (SIGKILL)
  });

  test("should restart a process", async () => {
    const config = createServiceConfig({
      cmd: "exec sleep 10",
      starttime: 1,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    await instance.restart();
    expect(instance.getState()).toBe(ServiceState.RUNNING);
  });
});

describe("ServiceInstance - Autorestart NEVER", () => {
  test("should NOT restart when autorestart is NEVER", async () => {
    const config = createServiceConfig({
      cmd: "exit 0",
      starttime: 1,
      autorestart: RestartPolicy.NEVER,
      exitcodes: [0],
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    await Bun.sleep(2000);

    expect(instance.getState()).toBe(ServiceState.EXITED);
  });
});

describe("ServiceInstance - Autorestart ALWAYS", () => {
  test("should restart when autorestart is ALWAYS", async () => {
    const config = createServiceConfig({
      cmd: "sleep 1.5; exit 0",
      starttime: 1,
      autorestart: RestartPolicy.ALWAYS,
      exitcodes: [0],
      startretries: 2,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    await Bun.sleep(1000);

    // Should be in BACKOFF or STARTING (attempting restart)
    expect(
      [ServiceState.BACKOFF, ServiceState.STARTING].includes(
        instance.getState()
      )
    ).toBe(true);
  });

  test("should go FATAL after too many restart attempts", async () => {
    const config = createServiceConfig({
      cmd: "exit 1",
      starttime: 1,
      autorestart: RestartPolicy.ALWAYS,
      exitcodes: [0],
      startretries: 2,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    // Wait for multiple restart attempts (with 100ms delay, should be FATAL within ~500ms)
    await Bun.sleep(1000);

    expect(instance.getState()).toBe(ServiceState.FATAL);
  });
});

describe("ServiceInstance - Autorestart UNEXPECTED", () => {
  test("should restart on unexpected exit code", async () => {
    const config = createServiceConfig({
      cmd: "sleep 1.5; exit 1",
      starttime: 1,
      autorestart: RestartPolicy.UNEXPECTED,
      exitcodes: [0],
      startretries: 2,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    // Wait for exit and restart attempt
    await Bun.sleep(1000);

    expect(
      [ServiceState.BACKOFF, ServiceState.STARTING].includes(
        instance.getState()
      )
    ).toBe(true);
  });

  test("should NOT restart on expected exit code", async () => {
    const config = createServiceConfig({
      cmd: "exit 0",
      starttime: 1,
      autorestart: RestartPolicy.UNEXPECTED,
      exitcodes: [0],
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    // Wait for exit
    await Bun.sleep(2000);

    expect(instance.getState()).toBe(ServiceState.EXITED);
  });

  test("should NOT restart on multiple expected exit codes", async () => {
    const config = createServiceConfig({
      cmd: "exit 2",
      starttime: 1,
      autorestart: RestartPolicy.UNEXPECTED,
      exitcodes: [0, 2],
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();

    // Wait for exit
    await Bun.sleep(2000);

    expect(instance.getState()).toBe(ServiceState.EXITED);
  });
});

describe("ServiceInstance - Edge cases", () => {
  test("should not start if already running", async () => {
    const config = createServiceConfig({
      cmd: "exec sleep 10",
      starttime: 1,
    });
    const instance = new ServiceInstance("test", 0, config);

    await instance.start();
    expect(instance.getState()).toBe(ServiceState.RUNNING);

    // Try to start again
    await instance.start();

    // Should still be running, not restarted
    expect(instance.getState()).toBe(ServiceState.RUNNING);
  });

  test("should not stop if already stopped", async () => {
    const config = createServiceConfig();
    const instance = new ServiceInstance("test", 0, config);

    expect(instance.getState()).toBe(ServiceState.STOPPED);

    // Try to stop
    await instance.stop();

    expect(instance.getState()).toBe(ServiceState.STOPPED);
  });
});
