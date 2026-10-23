/**
 * Sessão no servidor (Node runtime): cookies + consulta ao banco.
 *
 * Não importe este módulo no `middleware.ts` — ele puxa o driver SQLite
 * (`node:fs`), que não existe no Edge Runtime. Use `./token` lá.
 */

import { cookies } from "next/headers";
import { usersRepo } from "@/server/db/users";
import {
  SESSION_COOKIE,
  SESSION_DAYS,
  createSessionToken,
  verifySessionToken,
  type SessionPayload,
} from "./token";
import type { Role, User } from "@/lib/types";

export { SESSION_COOKIE, verifySessionToken, type SessionPayload };

export async function setSessionCookie(user: User): Promise<void> {
  const token = await createSessionToken({
    uid: user.id,
    name: user.name,
    role: user.role,
  });
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/** Lê o cookie e devolve o usuário completo (do banco), ou null. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  const payload = await verifySessionToken(store.get(SESSION_COOKIE)?.value);
  if (!payload) return null;

  const user = usersRepo.findById(payload.uid);
  // usuário removido/desativado depois da emissão do token perde o acesso
  if (!user || !user.active) return null;
  return user;
}

/** ADMIN pode tudo; demais papéis só o que for listado. */
export function can(user: User | null, ...roles: Role[]): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  return roles.includes(user.role);
}
