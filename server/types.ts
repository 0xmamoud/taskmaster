import { z } from "zod";

import { ConfigSchema, ServiceSchema } from "./schema.js";

export type Service = z.infer<typeof ServiceSchema>;
export type Config = z.infer<typeof ConfigSchema>;
