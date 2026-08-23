import { resolve } from "node:path";
import { z } from "zod";

const secret = z.string().min(32);
const base64Key = z.string().refine(
  (value) => {
    try {
      return Buffer.from(value, "base64").length === 32;
    } catch {
      return false;
    }
  },
  "must encode exactly 32 bytes",
);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_DIR: z.string().min(1).default("./data"),
  ADMIN_USERNAME: z.string().min(1).default("admin"),
  ADMIN_PASSWORD: z.string().min(12).optional(),
  JWT_SECRET: secret.optional(),
  TOKEN_HASH_KEY: secret.optional(),
  SETTINGS_ENCRYPTION_KEY: base64Key.optional(),
  OPEN_WEBSEARCH_URL: z.url().default("http://127.0.0.1:3210"),
  OPEN_WEBSEARCH_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("2.1.11"),
  SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  ALLOWED_HOSTS: z.string().default("localhost,127.0.0.1,[::1]"),
  ALLOWED_ORIGINS: z.string().default("http://localhost:3000,http://127.0.0.1:3000"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type ServerConfig = {
  environment: "development" | "test" | "production";
  dataDir: string;
  databasePath: string;
  adminUsername: string;
  adminPassword?: string;
  jwtSecret: string;
  tokenHashKey: string;
  settingsEncryptionKey: Buffer;
  openWebSearchUrl: URL;
  openWebSearchVersion: string;
  serverHost: string;
  allowedHosts: string[];
  allowedOrigins: string[];
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(env);
  if (parsed.NODE_ENV !== "test" && (!parsed.ADMIN_PASSWORD || !parsed.JWT_SECRET || !parsed.TOKEN_HASH_KEY || !parsed.SETTINGS_ENCRYPTION_KEY)) {
    throw new Error("non-test environments require ADMIN_PASSWORD, JWT_SECRET, TOKEN_HASH_KEY, and SETTINGS_ENCRYPTION_KEY");
  }

  const upstream = new URL(parsed.OPEN_WEBSEARCH_URL);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    throw new Error("OPEN_WEBSEARCH_URL must use HTTP(S)");
  }
  if (!["127.0.0.1", "localhost", "::1", "open-websearch"].includes(upstream.hostname)) {
    throw new Error("OPEN_WEBSEARCH_URL must target the private Open-WebSearch daemon");
  }
  if (parsed.ADMIN_PASSWORD && Buffer.byteLength(parsed.ADMIN_PASSWORD, "utf8") > 72) {
    throw new Error("ADMIN_PASSWORD must not exceed 72 UTF-8 bytes");
  }

  const fallbackSecret = parsed.JWT_SECRET ?? "test-only-jwt-secret-must-not-be-used-in-production";
  const fallbackTokenHashKey = parsed.TOKEN_HASH_KEY ?? "test-only-token-hash-key-must-not-be-used-production";
  const fallbackEncryptionKey = parsed.SETTINGS_ENCRYPTION_KEY ?? Buffer.alloc(32, 7).toString("base64");
  const dataDir = resolve(parsed.DATA_DIR);
  const allowedHosts = parsed.ALLOWED_HOSTS.split(",").map((value) => value.trim()).filter(Boolean);
  const allowedOrigins = parsed.ALLOWED_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean);
  if (allowedHosts.length === 0 || allowedOrigins.some((value) => !isUrl(value))) throw new Error("ALLOWED_HOSTS and ALLOWED_ORIGINS must contain valid values");

  return {
    environment: parsed.NODE_ENV,
    dataDir,
    databasePath: resolve(dataDir, "lazycat-search.db"),
    adminUsername: parsed.ADMIN_USERNAME,
    adminPassword: parsed.ADMIN_PASSWORD,
    jwtSecret: fallbackSecret,
    tokenHashKey: fallbackTokenHashKey,
    settingsEncryptionKey: Buffer.from(fallbackEncryptionKey, "base64"),
    openWebSearchUrl: upstream,
    openWebSearchVersion: parsed.OPEN_WEBSEARCH_VERSION,
    serverHost: parsed.SERVER_HOST,
    allowedHosts,
    allowedOrigins,
    port: parsed.PORT,
  };
}

function isUrl(value: string): boolean {
  try { new URL(value); return true; } catch { return false; }
}
