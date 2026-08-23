import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import type { AppDatabase } from "../db/client.js";
import { admins } from "../db/schema.js";
import { DomainError } from "../domain.js";

const encoder = new TextEncoder();

export class AuthService {
  private readonly key: Uint8Array;

  constructor(private readonly database: AppDatabase, jwtSecret: string) {
    this.key = encoder.encode(jwtSecret);
  }

  async login(username: string, password: string): Promise<{ adminId: number; token: string }> {
    if (Buffer.byteLength(password, "utf8") > 72) throw new DomainError("INVALID_CREDENTIALS", "用户名或密码错误", 401);
    const admin = this.database.orm.select().from(admins).where(eq(admins.username, username)).get();
    const valid = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
    if (!admin || !valid) throw new DomainError("INVALID_CREDENTIALS", "用户名或密码错误", 401);
    const token = await new SignJWT({ role: "admin" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(String(admin.id))
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(this.key);
    return { adminId: admin.id, token };
  }

  async verify(token: string): Promise<number> {
    try {
      const verified = await jwtVerify(token, this.key, { algorithms: ["HS256"] });
      const id = Number(verified.payload.sub);
      if (!Number.isSafeInteger(id) || id < 1 || verified.payload.role !== "admin") throw new Error("invalid subject");
      return id;
    } catch {
      throw new DomainError("SESSION_UNAUTHORIZED", "管理员会话无效", 401);
    }
  }
}
