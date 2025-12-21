import { z } from "zod";
import { RestartPolicy, Signals } from "./types.js";

export const ServiceSchema = z.object({
  cmd: z.string().min(1, "Command cannot be empty"),
  numprocs: z
    .number()
    .int()
    .positive("numprocs must be a positive integer")
    .max(100, "numprocs must be <= 100"),
  autostart: z.boolean().default(true),
  autorestart: z.enum(RestartPolicy),
  exitcodes: z
    .array(z.number().int())
    .min(1, "At least one exit code required"),
  startretries: z.number().int().nonnegative("startretries must be >= 0"),
  starttime: z.number().positive("starttime must be >= 0"),
  stopsignal: z.enum(Signals),
  stoptime: z.number().positive("stoptime must be positive"),
  stdout: z.string().nullable().optional(),
  stderr: z.string().nullable().optional(),
  env: z.record(z.string(), z.string()).optional().default({}),
  workingdir: z.string().min(1, "workingdir cannot be empty"),
  umask: z.string().regex(/^[0-7]{3}$/, "umask must be a 3-digit octal string"),
});

export const ConfigSchema = z.object({
  services: z
    .record(z.string(), ServiceSchema)
    .refine((services) => Object.keys(services).length > 0, {
      message: "At least one service must be defined",
    }),
});
