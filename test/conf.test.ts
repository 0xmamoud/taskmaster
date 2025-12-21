import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { parseConfig } from "@/server/parsing";
import { mkdirSync, writeFileSync, rmSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

const TEST_DIR = join(tmpdir(), "taskmaster-test");
const TEST_WORKDIR = join(TEST_DIR, "workdir");
const TEST_LOGS_DIR = join(TEST_DIR, "logs");

beforeEach(() => {
  // create test directories
  mkdirSync(TEST_DIR, { recursive: true });
  mkdirSync(TEST_WORKDIR, { recursive: true });
  mkdirSync(TEST_LOGS_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up after tests
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseConfig - Valid configurations", () => {
  test("should parse a valid configuration", () => {
    const configPath = join(TEST_DIR, "valid.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          stdout: join(TEST_LOGS_DIR, "web-stdout.log"),
          stderr: join(TEST_LOGS_DIR, "web-stderr.log"),
          env: {
            PORT: "3000",
          },
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).not.toThrow();
  });

  test("should parse configuration with null stdout/stderr", () => {
    const configPath = join(TEST_DIR, "null-logs.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "never",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          stdout: null,
          stderr: null,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).not.toThrow();
  });

  test("should parse configuration without stdout/stderr", () => {
    const configPath = join(TEST_DIR, "no-logs.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: false,
          autorestart: "unexpected",
          exitcodes: [0, 1],
          startretries: 5,
          starttime: 2,
          stopsignal: "SIGINT",
          stoptime: 10,
          workingdir: TEST_WORKDIR,
          umask: "027",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).not.toThrow();
  });
});

describe("parseConfig - Invalid configurations", () => {
  test("should throw on missing required field (cmd)", () => {
    const configPath = join(TEST_DIR, "missing-cmd.json");
    const config = {
      services: {
        web: {
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw on empty cmd", () => {
    const configPath = join(TEST_DIR, "empty-cmd.json");
    const config = {
      services: {
        web: {
          cmd: "",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw on invalid numprocs (0)", () => {
    const configPath = join(TEST_DIR, "invalid-numprocs.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 0,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw on invalid autorestart value", () => {
    const configPath = join(TEST_DIR, "invalid-autorestart.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "sometimes", // invalid
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw on invalid umask format", () => {
    const configPath = join(TEST_DIR, "invalid-umask.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "999", // invalid octal
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw on empty exitcodes array", () => {
    const configPath = join(TEST_DIR, "empty-exitcodes.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [], // empty
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow();
  });
});

describe("parseConfig - workingdir validation", () => {
  test("should throw when workingdir does not exist", () => {
    const configPath = join(TEST_DIR, "bad-workdir.json");
    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: "/this/does/not/exist",
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow(/workingdir.*does not exist/);
  });

  test("should throw when workingdir is not accessible", () => {
    const configPath = join(TEST_DIR, "no-access-workdir.json");
    const restrictedDir = join(TEST_DIR, "restricted");
    mkdirSync(restrictedDir);
    chmodSync(restrictedDir, 0o000); // Aucun droit

    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          workingdir: restrictedDir,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow(/workingdir.*not accessible/);

    chmodSync(restrictedDir, 0o755);
  });
});

describe("parseConfig - stdout/stderr validation", () => {
  test("should create log directories automatically", () => {
    const configPath = join(TEST_DIR, "auto-create-logs.json");
    const newLogsDir = join(TEST_DIR, "new-logs", "nested");

    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          stdout: join(newLogsDir, "stdout.log"),
          stderr: join(newLogsDir, "stderr.log"),
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).not.toThrow();
  });

  test("should throw when log directory is not writable", () => {
    const configPath = join(TEST_DIR, "readonly-logs.json");
    const readonlyDir = join(TEST_DIR, "readonly");
    mkdirSync(readonlyDir);
    chmodSync(readonlyDir, 0o444); // Read-only

    const config = {
      services: {
        web: {
          cmd: "bun run web.ts",
          numprocs: 1,
          autostart: true,
          autorestart: "always",
          exitcodes: [0],
          startretries: 3,
          starttime: 5,
          stopsignal: "SIGTERM",
          stoptime: 5,
          stdout: join(readonlyDir, "nested", "stdout.log"),
          workingdir: TEST_WORKDIR,
          umask: "022",
        },
      },
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow(/cannot create or write/);

    chmodSync(readonlyDir, 0o755);
  });
});

describe("parseConfig - File errors", () => {
  test("should throw when config file does not exist", () => {
    expect(() => parseConfig("/this/does/not/exist.json")).toThrow();
  });

  test("should throw on invalid JSON syntax", () => {
    const configPath = join(TEST_DIR, "invalid.json");
    writeFileSync(configPath, "{ invalid json }");

    expect(() => parseConfig(configPath)).toThrow();
  });

  test("should throw when no services defined", () => {
    const configPath = join(TEST_DIR, "no-services.json");
    const config = {
      services: {},
    };

    writeFileSync(configPath, JSON.stringify(config));

    expect(() => parseConfig(configPath)).toThrow(
      /At least one service must be defined/
    );
  });
});
