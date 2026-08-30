import { createHmac } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";

const secret = z.string().min(32);

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATA_DIR: z.string().min(1).default("./data"),
  APP_INSTANCE_SECRET: secret.optional(),
  APP_ORIGIN: z.url().optional(),
  OIDC_CLIENT_ID: z.string().min(1).optional(),
  OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  OIDC_ISSUER_URI: z.url().optional(),
  OIDC_AUTH_URI: z.url().optional(),
  OIDC_TOKEN_URI: z.url().optional(),
  OIDC_USERINFO_URI: z.url().optional(),
  OPEN_WEBSEARCH_URL: z.url().default("http://127.0.0.1:3210"),
  OPEN_WEBSEARCH_VERSION: z.string().regex(/^\d+\.\d+\.\d+$/).default("2.1.11"),
  SERVER_HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
});

export type OidcConfig = {
  clientId: string;
  clientSecret: string;
  issuerUri: URL;
  authorizationUri: URL;
  tokenUri: URL;
  userinfoUri: URL;
  redirectUri: string;
};

export type ServerConfig = {
  environment: "development" | "test" | "production";
  dataDir: string;
  databasePath: string;
  identityDatabasePath: string;
  userDataDir: string;
  appOrigin: URL;
  cookieSecret: string;
  sessionSecret: string;
  tokenHashKey: string;
  settingsEncryptionKey: Buffer;
  oidc: OidcConfig;
  openWebSearchUrl: URL;
  openWebSearchVersion: string;
  serverHost: string;
  port: number;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const parsed = envSchema.parse(env);
  const requiredOidcValues = [parsed.APP_INSTANCE_SECRET, parsed.APP_ORIGIN, parsed.OIDC_CLIENT_ID, parsed.OIDC_CLIENT_SECRET, parsed.OIDC_ISSUER_URI, parsed.OIDC_AUTH_URI, parsed.OIDC_TOKEN_URI, parsed.OIDC_USERINFO_URI];
  if (parsed.NODE_ENV !== "test" && requiredOidcValues.some((value) => !value)) {
    throw new Error("non-test environments require APP_INSTANCE_SECRET, APP_ORIGIN, and all OIDC_* settings");
  }

  const upstream = new URL(parsed.OPEN_WEBSEARCH_URL);
  if (upstream.protocol !== "http:" && upstream.protocol !== "https:") {
    throw new Error("OPEN_WEBSEARCH_URL must use HTTP(S)");
  }
  const instanceSecret = parsed.APP_INSTANCE_SECRET ?? "test-only-instance-secret-must-not-be-used-in-production";
  const appOrigin = new URL(parsed.APP_ORIGIN ?? "http://127.0.0.1:3000");
  const oidc = {
    clientId: parsed.OIDC_CLIENT_ID ?? "miaomiao-search-test-client",
    clientSecret: parsed.OIDC_CLIENT_SECRET ?? "miaomiao-search-test-client-secret",
    issuerUri: new URL(parsed.OIDC_ISSUER_URI ?? "https://oidc.invalid/issuer"),
    authorizationUri: new URL(parsed.OIDC_AUTH_URI ?? "https://oidc.invalid/authorize"),
    tokenUri: new URL(parsed.OIDC_TOKEN_URI ?? "https://oidc.invalid/token"),
    userinfoUri: new URL(parsed.OIDC_USERINFO_URI ?? "https://oidc.invalid/userinfo"),
    redirectUri: new URL("/api/auth/oidc/callback", appOrigin).toString(),
  } satisfies OidcConfig;
  const dataDir = resolve(parsed.DATA_DIR);

  return {
    environment: parsed.NODE_ENV,
    dataDir,
    databasePath: resolve(dataDir, "identity.sqlite"),
    identityDatabasePath: resolve(dataDir, "identity.sqlite"),
    userDataDir: resolve(dataDir, "users"),
    appOrigin,
    cookieSecret: deriveSecret(instanceSecret, "cookie"),
    sessionSecret: deriveSecret(instanceSecret, "session"),
    tokenHashKey: deriveSecret(instanceSecret, "mcp-token"),
    settingsEncryptionKey: deriveKey(instanceSecret, "settings"),
    oidc,
    openWebSearchUrl: upstream,
    openWebSearchVersion: parsed.OPEN_WEBSEARCH_VERSION,
    serverHost: parsed.SERVER_HOST,
    port: parsed.PORT,
  };
}

function deriveKey(instanceSecret: string, purpose: string): Buffer {
  return createHmac("sha256", instanceSecret).update(`miaomiao-search:${purpose}`).digest();
}

function deriveSecret(instanceSecret: string, purpose: string): string {
  return deriveKey(instanceSecret, purpose).toString("hex");
}
