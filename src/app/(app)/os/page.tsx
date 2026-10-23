import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { ordersRepo } from "@/server/db/orders";
import { usersRepo } from "@/server/db/users";
import { OrdersView } from "./orders-view";
import type { OrderStatus } from "@/lib/types";

export const metadata: Metadata = { title: "Ordens de Serviço" };
export const dynamic = "force-dynamic";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; fin?: string }>;
}) {
  ensureDb();
  const sp = await searchParams;

  const status = (sp.status ?? "TODAS") as OrderStatus | "TODAS" | "ATIVAS";
  const financialStatus = (sp.fin ?? "TODAS") as never;
  const q = sp.q ?? "";

  const result = ordersRepo.list({ q, status, financialStatus, limit: 200 });
  const technicians = usersRepo.listTechnicians().map((t) => ({ id: t.id, name: t.name }));

  return (
    <OrdersView
      initial={{ q, status, financialStatus: (sp.fin ?? "TODAS") as never }}
      technicians={technicians}
      serverRows={result.rows.map((o) => ({
        id: o.id,
        number: o.number,
        status: o.status,
        entryDate: o.entryDate,
        expectedFinish: o.expectedFinish,
        deliveredAt: o.deliveredAt,
        totalCents: o.totalCents,
        paidCents: o.paidCents,
        financialStatus: o.financialStatus,
        clientName: o.client.name,
        vehiclePlate: o.vehicle.plate,
        vehicleLabel: [o.vehicle.brand, o.vehicle.model].filter(Boolean).join(" "),
        reportedIssue: o.reportedIssue,
        technicianName: o.technician?.name ?? null,
      }))}
      total={result.total}
      breakdown={ordersRepo.countByStatus()}
    />
  );
}
