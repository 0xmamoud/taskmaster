import { parseConfig } from "./parsing";

try {
  const config = parseConfig("./conf.json");

  console.log("Parsed configuration:", config);
} catch (error) {
  console.error(error);
  process.exit(1);
}
