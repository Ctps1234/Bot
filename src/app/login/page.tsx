import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/server/auth/session";
import { ensureDb } from "@/server/db";
import { settingsRepo } from "@/server/db/settings";
import { usersRepo } from "@/server/db/users";
import { LoginForm } from "./login-form";
import { Zap } from "lucide-react";

export const metadata: Metadata = { title: "Entrar" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  ensureDb();
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  const params = await searchParams;
  const settings = settingsRepo.all();
  const needsSetup = usersRepo.count() === 0;
  const appName = process.env.NEXT_PUBLIC_APP_NAME ?? "OficinaVolt";

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_26rem]">
      {/* painel institucional */}
      <div className="relative hidden overflow-hidden bg-navy-900 lg:block">
        <div
          className="absolute inset-0 opacity-[0.16]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, #fbbf24 1px, transparent 0)",
            backgroundSize: "26px 26px",
          }}
        />
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-brand-500/12 blur-3xl" />
        <div className="absolute right-0 bottom-0 h-80 w-80 rounded-full bg-blue-500/10 blur-3xl" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-500 text-navy-950 shadow-lg shadow-brand-500/20">
              <Zap className="h-6 w-6" strokeWidth={2.4} />
            </span>
            <div>
              <p className="text-lg font-bold text-white">{appName}</p>
              <p className="text-[11px] font-semibold tracking-[0.16em] text-brand-400/90 uppercase">
                Gestão de oficina elétrica
              </p>
            </div>
          </div>

          <div className="max-w-md">
            <h1 className="text-3xl leading-tight font-bold text-white">
              Da entrada do veículo ao pagamento,{" "}
              <span className="text-brand-400">tudo em um lugar só.</span>
            </h1>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Ordens de serviço com diagnóstico, peças e mão de obra, histórico por
              cliente e veículo, controle do que já foi recebido e do que está em
              aberto — e relatórios do faturamento da oficina.
            </p>

            <ul className="mt-8 space-y-3">
              {[
                ["OS rápida", "Cliente, veículo, defeito relatado e itens em uma tela só."],
                ["Fluxo simples", "Aberta → Em execução → Concluída → Entregue."],
                ["Financeiro junto", "Recebimentos por OS e total em aberto do mês."],
              ].map(([title, text]) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                  <p className="text-sm text-slate-400">
                    <span className="font-semibold text-slate-200">{title}.</span> {text}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-slate-600">
            {settings.workshopName}
            {settings.city ? ` · ${settings.city}` : ""}
          </p>
        </div>
      </div>

      {/* formulário */}
      <div className="flex items-center justify-center bg-surface px-5 py-10 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex items-center gap-2.5 lg:hidden">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-500 text-navy-950">
              <Zap className="h-5 w-5" strokeWidth={2.4} />
            </span>
            <p className="text-base font-bold text-slate-900">{appName}</p>
          </div>

          <h2 className="text-xl font-bold text-slate-900">Entrar no sistema</h2>
          <p className="mt-1 text-sm text-slate-500">
            Use seu e-mail e senha para acessar a gestão da oficina.
          </p>

          {needsSetup ? (
            <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-900">
              <p className="font-semibold">Nenhum usuário cadastrado ainda.</p>
              <p className="mt-1">
                Crie o primeiro acesso com{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">npm run db:seed</code>{" "}
                (cria <strong>admin@oficina.com</strong> / <strong>admin123</strong>).
              </p>
            </div>
          ) : null}

          <LoginForm next={params.next} />
        </div>
      </div>
    </div>
  );
}
