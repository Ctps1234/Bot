import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { statsRepo, currentMonthPeriod } from "@/server/db/stats";
import { FinancialView } from "./financial-view";

export const metadata: Metadata = { title: "Financeiro" };
export const dynamic = "force-dynamic";

export default async function FinancialPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fin?: string }>;
}) {
  ensureDb();
  const sp = await searchParams;
  const period = currentMonthPeriod();

  const data = statsRepo.financial({
    q: sp.q ?? "",
    financialStatus: sp.fin ?? "TODAS",
    limit: 300,
  });

  const monthReceived = statsRepo.dashboard().receivedThisMonth;

  // Contas a receber por faixa de atraso (não depende dos filtros da tabela).
  const aging = statsRepo.receivablesAging(8);

  return (
    <FinancialView
      initial={{ q: sp.q ?? "", fin: sp.fin ?? "TODAS" }}
      totals={{ ...data.totals, receivedThisMonthCents: monthReceived }}
      rows={data.rows}
      period={period}
      aging={aging}
    />
  );
}
