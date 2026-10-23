/**
 * Assinatura/verificação do token de sessão.
 *
 * Este módulo precisa ser seguro para o **Edge Runtime** (usado pelo middleware):
 * usa apenas `jose` e tipos — nada de `node:fs`, Prisma, banco ou `next/headers`.
 * A parte que consulta o banco fica em `session.ts`.
 */

import { SignJWT, jwtVerify } from "jose";
import type { Role } from "@/lib/types";

export const SESSION_COOKIE = "oficina_session";
export const SESSION_DAYS = 7;

const FALLBACK_SECRET = "oficina-eletrica-dev-secret-nao-use-em-producao";

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim() || FALLBACK_SECRET;
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  /** id do usuário */
  uid: number;
  name: string;
  role: Role;
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(payload.uid))
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

/** Verifica assinatura/expiração. Não consulta o banco — use `getCurrentUser` para isso. */
export async function verifySessionToken(
  token: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    const uid = Number(payload.sub);
    if (!Number.isFinite(uid) || uid <= 0) return null;
    return {
      uid,
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "RECEPCAO") as Role,
    };
  } catch {
    return null;
  }
}
