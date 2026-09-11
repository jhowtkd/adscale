import dotenv from "dotenv";
import { existsSync } from "node:fs";
import path from "node:path";

const appRoot = path.resolve(__dirname, "..");
const candidates = [
  process.env.DOTENV_PATH,
  path.resolve(appRoot, ".env.local"),
  path.resolve(appRoot, "../../../app/.env.local"),
].filter((value): value is string => Boolean(value));

for (const file of candidates) {
  if (existsSync(file)) {
    dotenv.config({ path: file });
    break;
  }
}
