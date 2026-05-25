import dotenv from "dotenv";
import path from "path";

// Must be imported FIRST in any script that uses @/server/validation/env
// to ensure env vars are loaded before validation happens.
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });
