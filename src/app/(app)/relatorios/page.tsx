import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { statsRepo } from "@/server/db/stats";
import { addDaysISO, endOfMonthISO, startOfMonthISO, todayISO } from "@/lib/utils";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = { title: "Relatórios" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  ensureDb();
  const sp = await searchParams;

  const from = sp.from || startOfMonthISO();
  const to = sp.to || todayISO();
  const report = statsRepo.report(from, to);

  return (
    <ReportsView
      report={JSON.parse(JSON.stringify(report))}
      presets={{
        today: { from: todayISO(), to: todayISO() },
        last7: { from: addDaysISO(-6), to: todayISO() },
        last30: { from: addDaysISO(-29), to: todayISO() },
        thisMonth: { from: startOfMonthISO(), to: endOfMonthISO() },
        lastMonth: {
          from: startOfMonthISO(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
          to: endOfMonthISO(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1)),
        },
        year: { from: `${new Date().getFullYear()}-01-01`, to: todayISO() },
      }}
    />
  );
}
