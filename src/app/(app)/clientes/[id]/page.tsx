import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { ClientProfile } from "./client-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  ensureDb();
  const { id } = await params;
  const client = clientsRepo.findById(Number(id));
  return { title: client ? client.name : "Cliente" };
}

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureDb();
  const { id } = await params;
  const client = clientsRepo.findById(Number(id));
  if (!client) notFound();

  const vehicles = clientsRepo.vehiclesOf(client.id);
  const history = ordersRepo.historyOfClient(client.id, 100);

  const totals = history.reduce(
    (acc, o) => {
      if (o.status === "CANCELADA") return acc;
      acc.orders += 1;
      acc.revenue += o.totalCents;
      acc.balance += Math.max(0, o.totalCents - o.paidCents);
      acc.parts += o.itemsTotalCents;
      return acc;
    },
    { orders: 0, revenue: 0, balance: 0, parts: 0 },
  );

  const active = history.filter((o) =>
    ["ABERTA", "EM_EXECUCAO", "CONCLUIDA"].includes(o.status),
  );

  return (
    <ClientProfile
      client={JSON.parse(JSON.stringify(client))}
      vehicles={JSON.parse(JSON.stringify(vehicles))}
      orders={JSON.parse(
        JSON.stringify(
          history.map((o) => ({
            id: o.id,
            number: o.number,
            status: o.status,
            entryDate: o.entryDate,
            expectedFinish: o.expectedFinish,
            deliveredAt: o.deliveredAt,
            totalCents: o.totalCents,
            paidCents: o.paidCents,
            financialStatus: o.financialStatus,
            reportedIssue: o.reportedIssue,
            vehiclePlate: o.vehicle.plate,
            vehicleLabel: [o.vehicle.brand, o.vehicle.model].filter(Boolean).join(" "),
            mileageIn: o.mileageIn,
          })),
        ),
      )}
      totals={{
        vehicles: vehicles.length,
        orders: totals.orders,
        revenueCents: totals.revenue,
        balanceCents: totals.balance,
        activeCount: active.length,
        avgTicketCents: totals.orders > 0 ? Math.round(totals.revenue / totals.orders) : 0,
        lastVisit: history[0]?.entryDate ?? null,
      }}
    />
  );
}

