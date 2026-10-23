import { NextResponse, type NextRequest } from "next/server";
// Importante: apenas o módulo de token (Edge-safe). Importar `session.ts` aqui
// puxaria o driver SQLite (node:fs) e quebraria o Edge Runtime.
import { SESSION_COOKIE, verifySessionToken } from "@/server/auth/token";

/** Telas protegidas (navegação). */
const PROTECTED_PAGES = [
  "/dashboard",
  "/os",
  "/clientes",
  "/veiculos",
  "/financeiro",
  "/relatorios",
  "/configuracoes",
];

/**
 * APIs: tudo em `/api/*` exige sessão e responde 401 JSON (nunca redirect),
 * com exceção de `/api/auth/*` (login e logout são públicos).
 * A autorização fina por papel acontece nos handlers, que revalidam o usuário no banco.
 */
const PUBLIC_API_PREFIX = "/api/auth/";

function matches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySessionToken(token) : null;

  const isApi = pathname.startsWith("/api/");

  /* ------------------------------ sem sessão ------------------------------ */
  if (!session) {
    if (isApi) {
      // /api/auth/* é público (login/logout). O resto exige sessão.
      if (!pathname.startsWith(PUBLIC_API_PREFIX)) {
        return NextResponse.json(
          { error: "Não autenticado. Faça login para continuar." },
          { status: 401 },
        );
      }
      return NextResponse.next();
    }

    const needsLogin = pathname === "/" || matches(pathname, PROTECTED_PAGES);
    if (needsLogin) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.search = "";
      if (pathname !== "/" && pathname !== "/login") {
        url.searchParams.set("next", pathname);
      }
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  /* --------------------------- já autenticado ----------------------------- */
  if (pathname === "/login" || pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Demais rotas seguem para o handler, que revalida o usuário no banco.
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Tudo, exceto assets estáticos.
     * /login precisa entrar no matcher para redirecionar quem já está autenticado.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
