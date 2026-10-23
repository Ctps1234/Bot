import { getDb } from "./index";
import { mapUser, nowISO, num, strOrNull } from "./mappers";
import type { Role, User } from "@/lib/types";
import { hashPassword, verifyPassword } from "@/server/auth/password";

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: Role;
  phone?: string | null;
}

export const usersRepo = {
  findByEmail(email: string): User | null {
    const row = getDb()
      .prepare("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .get(email.trim());
    return row ? mapUser(row) : null;
  },

  /** Autenticação: retorna o usuário apenas se a senha conferir e ele estiver ativo. */
  authenticate(email: string, password: string): User | null {
    const row = getDb()
      .prepare("SELECT * FROM users WHERE lower(email) = lower(?) LIMIT 1")
      .get(email.trim());
    if (!row) return null;
    const hash = strOrNull(row.password_hash);
    if (!hash) return null;
    if (!verifyPassword(password, hash)) return null;
    const user = mapUser(row);
    return user.active ? user : null;
  },

  findById(id: number): User | null {
    const row = getDb().prepare("SELECT * FROM users WHERE id = ?").get(id);
    return row ? mapUser(row) : null;
  },

  list(includeInactive = false): User[] {
    const db = getDb();
    const sql = includeInactive
      ? "SELECT * FROM users ORDER BY name"
      : "SELECT * FROM users WHERE active = 1 ORDER BY name";
    return db.prepare(sql).all().map(mapUser);
  },

  /** Usuários que podem ser responsáveis técnicos por uma OS. */
  listTechnicians(): User[] {
    return getDb()
      .prepare(
        "SELECT * FROM users WHERE active = 1 AND role IN ('ADMIN','GESTOR','TECNICO') ORDER BY name",
      )
      .all()
      .map(mapUser);
  },

  create(input: CreateUserInput): User {
    const db = getDb();
    const ts = nowISO();
    const res = db
      .prepare(
        `INSERT INTO users (name, email, password_hash, role, phone, active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        input.name.trim(),
        input.email.trim().toLowerCase(),
        hashPassword(input.password),
        input.role ?? "TECNICO",
        input.phone?.trim() || null,
        ts,
        ts,
      );
    return this.findById(num(res.lastInsertRowid))!;
  },

  update(
    id: number,
    patch: Partial<Pick<User, "name" | "email" | "role" | "phone">> & {
      active?: boolean;
      password?: string;
    },
  ): User | null {
    const db = getDb();
    const fields: string[] = [];
    const values: (string | number | null)[] = [];

    if (patch.name !== undefined) {
      fields.push("name = ?");
      values.push(patch.name.trim());
    }
    if (patch.email !== undefined) {
      fields.push("email = ?");
      values.push(patch.email.trim().toLowerCase());
    }
    if (patch.role !== undefined) {
      fields.push("role = ?");
      values.push(patch.role);
    }
    if (patch.phone !== undefined) {
      fields.push("phone = ?");
      values.push(patch.phone?.trim() || null);
    }
    if (patch.active !== undefined) {
      fields.push("active = ?");
      values.push(patch.active ? 1 : 0);
    }
    if (patch.password) {
      fields.push("password_hash = ?");
      values.push(hashPassword(patch.password));
    }
    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = ?");
    values.push(nowISO(), id);
    db.prepare(`UPDATE users SET ${fields.join(", ")} WHERE id = ?`).run(
      ...values,
    );
    return this.findById(id);
  },

  countAdmins(): number {
    const row = getDb()
      .prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'ADMIN' AND active = 1")
      .get();
    return num(row?.c);
  },

  count(): number {
    const row = getDb().prepare("SELECT COUNT(*) AS c FROM users").get();
    return num(row?.c);
  },

  hasAny(): boolean {
    return this.count() > 0;
  },
};

export { usersRepo as default };
