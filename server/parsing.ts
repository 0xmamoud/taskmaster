import { readFileSync, accessSync, mkdirSync, constants } from "fs";
import { dirname, resolve } from "path";
import { ConfigSchema } from "./schema.js";
import type { Config } from "./types.js";

function validateWorkingDir(path: string, serviceName: string): void {
  const absolutePath = resolve(path);

  try {
    accessSync(absolutePath, constants.R_OK | constants.X_OK);
  } catch (error) {
    throw new Error(
      `Service "${serviceName}": workingdir "${path}" does not exist or is not accessible`
    );
  }
}

function validateLogFile(
  logPath: string,
  serviceName: string,
  type: "stdout" | "stderr"
): void {
  const absolutePath = resolve(logPath);
  const dir = dirname(absolutePath);

  try {
    mkdirSync(dir, { recursive: true });

    accessSync(dir, constants.W_OK);
  } catch (error) {
    throw new Error(
      `Service "${serviceName}": cannot create or write to ${type} log file "${logPath}"`
    );
  }
}

export function parseConfig(configPath: string): Config {
  const fileContent = readFileSync(configPath, "utf-8");

  const rawConfig = JSON.parse(fileContent);

  const config = ConfigSchema.parse(rawConfig);

  for (const [serviceName, serviceConfig] of Object.entries(config.services)) {
    validateWorkingDir(serviceConfig.workingdir, serviceName);

    if (serviceConfig.stdout !== null && serviceConfig.stdout !== undefined) {
      validateLogFile(serviceConfig.stdout, serviceName, "stdout");
    }

    if (serviceConfig.stderr !== null && serviceConfig.stderr !== undefined) {
      validateLogFile(serviceConfig.stderr, serviceName, "stderr");
    }
  }

  return config;
}
