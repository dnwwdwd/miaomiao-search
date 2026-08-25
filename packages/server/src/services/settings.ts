import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDatabase } from "../db/client.js";
import { settings } from "../db/schema.js";

const sensitiveKeys = new Set(["proxy.url", "engine.exa.apiKey"]);

export class SettingsService {
  constructor(private readonly database: AppDatabase, private readonly encryptionKey: Buffer) {}

  set(key: string, value: unknown): void {
    const now = new Date().toISOString();
    const shouldEncrypt = sensitiveKeys.has(key);
    const storedValue = shouldEncrypt ? this.encrypt(JSON.stringify(value)) : JSON.stringify(value);
    const existing = this.database.orm.select({ key: settings.key }).from(settings).where(eq(settings.key, key)).get();
    if (existing) {
      this.database.orm.update(settings).set({ value: storedValue, encrypted: shouldEncrypt, updatedAt: now }).where(eq(settings.key, key)).run();
    } else {
      this.database.orm.insert(settings).values({ key, value: storedValue, encrypted: shouldEncrypt, updatedAt: now }).run();
    }
  }

  delete(key: string): void {
    this.database.orm.delete(settings).where(eq(settings.key, key)).run();
  }

  get<T>(key: string): T | undefined {
    const setting = this.database.orm.select().from(settings).where(eq(settings.key, key)).get();
    if (!setting) return undefined;
    const raw = setting.encrypted ? this.decrypt(setting.value) : setting.value;
    return JSON.parse(raw) as T;
  }

  private encrypt(value: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `v1:${iv.toString("base64")}:${cipher.getAuthTag().toString("base64")}:${encrypted.toString("base64")}`;
  }

  private decrypt(value: string): string {
    const [version, iv, authTag, ciphertext] = value.split(":");
    if (version !== "v1" || !iv || !authTag || !ciphertext) throw new Error("invalid encrypted setting");
    const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(authTag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64")), decipher.final()]).toString("utf8");
  }
}
