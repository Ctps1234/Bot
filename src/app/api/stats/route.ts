import { statsRepo, currentMonthPeriod } from "@/server/db/stats";
import { ordersRepo } from "@/server/db/orders";
import { clientsRepo } from "@/server/db/clients";
import { ok, withAuth } from "@/server/api";
import { toISODate } from "@/lib/utils";

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  const period = currentMonthPeriod();
  const from = url.searchParams.get("from") || period.from;
  const to = url.searchParams.get("to") || period.to;

  const dash = statsRepo.dashboard();

  return ok({
    dashboard: {
      ...dash,
      monthRevenueCents: dash.monthRevenueCents,
      receivedThisMonthCents: dash.receivedThisMonth,
      clients: clientsRepo.count(),
      vehicles: clientsRepo.countVehicles(),
    },
    recentOrders: statsRepo.recentOrders(8),
    activeOrders: ordersRepo
      .list({ status: "ATIVAS", limit: 8 })
      .rows.map((o) => ({
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
      })),
    statusBreakdown: ordersRepo.countByStatus(),
    report: statsRepo.report(from, to),
    generatedAt: toISODate(new Date()),
  });
});
