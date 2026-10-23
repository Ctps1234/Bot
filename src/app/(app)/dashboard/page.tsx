import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { statsRepo, currentMonthPeriod } from "@/server/db/stats";
import { ordersRepo } from "@/server/db/orders";
import { clientsRepo } from "@/server/db/clients";
import { settingsRepo } from "@/server/db/settings";
import { todayISO } from "@/lib/utils";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = { title: "Painel" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  ensureDb();

  const dash = statsRepo.dashboard();
  const period = currentMonthPeriod();
  const recent = statsRepo.recentOrders(8);
  const active = ordersRepo.list({ status: "ATIVAS", limit: 8 }).rows;

  // `expected_finish` é uma data local (YYYY-MM-DD); a comparação precisa usar a
  // data local de hoje. `new Date().toISOString()` devolveria a data UTC, o que
  // em fuso negativo adiantaria o alerta de atraso em um dia.
  const today = todayISO();
  const overdue = ordersRepo
    .list({ status: "ATIVAS", limit: 100 })
    .rows.filter((o) => o.expectedFinish && o.expectedFinish < today);

  return (
    <DashboardView
      kpis={{
        ...dash,
        monthRevenueCents: dash.monthRevenueCents,
        receivedThisMonthCents: dash.receivedThisMonth,
        clients: clientsRepo.count(),
        vehicles: clientsRepo.countVehicles(),
        monthFrom: period.from,
        monthTo: period.to,
      }}
      recentOrders={recent}
      activeOrders={active.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        entryDate: o.entryDate,
        expectedFinish: o.expectedFinish,
        totalCents: o.totalCents,
        paidCents: o.paidCents,
        financialStatus: o.financialStatus,
        clientName: o.client.name,
        vehiclePlate: o.vehicle.plate,
        vehicleLabel: [o.vehicle.brand, o.vehicle.model].filter(Boolean).join(" "),
        reportedIssue: o.reportedIssue,
      }))}
      overdueOrders={overdue.map((o) => ({
        id: o.id,
        number: o.number,
        expectedFinish: o.expectedFinish,
        clientName: o.client.name,
        vehiclePlate: o.vehicle.plate,
        status: o.status,
      }))}
      statusBreakdown={ordersRepo.countByStatus()}
      workshopName={settingsRepo.all().workshopName}
    />
  );
}
