import "@testing-library/jest-dom";

// Publication fixtures use real encryption with a test-only key.
process.env.EQUIPE_IG_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString("base64");
