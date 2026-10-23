import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getCurrentUser, can } from "@/server/auth/session";
import type { Role, User } from "@/lib/types";

export type RouteParams = Record<string, string | string[]>;
export type RouteContext = { params: Promise<RouteParams> };

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = () => new ApiError(401, "Sessão expirada. Entre novamente.");
export const forbidden = (message = "Você não tem permissão para esta ação.") =>
  new ApiError(403, message);
export const notFound = (what = "Registro") => new ApiError(404, `${what} não encontrado.`);
export const badRequest = (message: string, details?: unknown) =>
  new ApiError(400, message, details);
export const conflict = (message: string) => new ApiError(409, message);

export type RouteHandler = (
  req: Request,
  user: User,
  ctx: RouteContext,
) => Promise<Response> | Response;

const EMPTY_CTX: RouteContext = { params: Promise.resolve({}) };

/**
 * Envolve um handler de rota com autenticação, autorização por papel e tratamento
 * padronizado de erros.
 *
 * Assinatura fixa do handler: `(req, user, ctx)`. Rotas sem parâmetros dinâmicos
 * simplesmente ignoram `ctx`; rotas com `[id]` usam `numberParam(ctx)`.
 *
 * O `ctx` retornado é obrigatório (não opcional) de propósito: o Next valida os
 * exports de rotas e rejeita `(req, ctx?)`.
 *
 * @param roles papéis autorizados — `null` libera para qualquer usuário autenticado
 */
export function withAuth(
  roles: Role[] | null,
  inner: RouteHandler,
): (req: Request, ctx: RouteContext) => Promise<Response> {
  return async (req: Request, ctx: RouteContext) => {
    try {
      const user = await getCurrentUser();
      if (!user) throw unauthorized();
      if (roles && !can(user, ...roles)) throw forbidden();
      // em rotas estáticas o Next pode não enviar contexto — protege o acesso a params
      return await inner(req, user, ctx ?? EMPTY_CTX);
    } catch (error) {
      return toResponse(error);
    }
  };
}

export function toResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, details: error.details ?? null },
      { status: error.status },
    );
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    return NextResponse.json(
      {
        error: first?.message ?? "Dados inválidos.",
        details: error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 422 },
    );
  }

  const message = error instanceof Error ? error.message : String(error);

  if (/UNIQUE constraint failed/i.test(message)) {
    const field = message.split(":").pop()?.trim() ?? "";
    const friendly = /plate/i.test(field)
      ? "Já existe um veículo cadastrado com esta placa."
      : /email/i.test(field)
        ? "Já existe um usuário com este e-mail."
        : /number/i.test(field)
          ? "Número de OS duplicado — tente salvar novamente."
          : "Já existe um registro com estes dados.";
    return NextResponse.json({ error: friendly, details: { raw: message } }, { status: 409 });
  }
  if (/FOREIGN KEY constraint failed/i.test(message)) {
    return NextResponse.json(
      { error: "Operação inválida: o registro relacionado não existe.", details: { raw: message } },
      { status: 409 },
    );
  }
  if (/NOT NULL constraint failed/i.test(message)) {
    return NextResponse.json(
      { error: "Campo obrigatório ausente.", details: { raw: message } },
      { status: 422 },
    );
  }

  console.error("[api] erro não tratado:", error);
  return NextResponse.json(
    { error: "Erro interno ao processar a requisição.", details: { raw: message } },
    { status: 500 },
  );
}

export async function readJson<T = Record<string, unknown>>(request: Request): Promise<T> {
  try {
    const body = await request.json();
    return (body ?? {}) as T;
  } catch {
    throw badRequest("Corpo da requisição inválido (JSON esperado).");
  }
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

/** Resolve os params dinâmicos da rota (Next 15+ é assíncrono). */
export async function params(ctx: RouteContext): Promise<RouteParams> {
  return ctx.params;
}

/** Converte um param de rota em número, ou lança 400. */
export async function numberParam(ctx: RouteContext, key = "id"): Promise<number> {
  const p = await ctx.params;
  const raw = Array.isArray(p[key]) ? p[key][0] : p[key];
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw badRequest(`Identificador inválido (${key}).`);
  }
  return value;
}
