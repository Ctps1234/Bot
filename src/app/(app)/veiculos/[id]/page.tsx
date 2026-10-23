import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { VehicleProfile } from "./vehicle-profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  ensureDb();
  const { id } = await params;
  const vehicle = clientsRepo.vehicleById(Number(id));
  return { title: vehicle ? `Veículo ${vehicle.plate}` : "Veículo" };
}

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureDb();
  const { id } = await params;
  const vehicle = clientsRepo.vehicleById(Number(id));
  if (!vehicle) notFound();

  const client = clientsRepo.findById(vehicle.clientId);
  if (!client) notFound();

  const orders = ordersRepo.list({ vehicleId: vehicle.id, limit: 100 }).rows;
  const last = ordersRepo.lastOrderOfVehicle(vehicle.id);

  // serviços mais feitos neste veículo
  const { getDb } = await import("@/server/db");
  const topServices = getDb()
    .prepare(
      `SELECT i.description AS description, COUNT(*) AS count, MAX(i.unit_price_cents) AS last_price
         FROM order_items i JOIN orders o ON o.id = i.order_id
        WHERE o.vehicle_id = ? AND o.status <> 'CANCELADA' AND i.kind = 'SERVICO'
        GROUP BY lower(i.description) ORDER BY count DESC, MAX(i.id) DESC LIMIT 6`,
    )
    .all(vehicle.id);

  const totals = orders.reduce(
    (acc, o) => {
      if (o.status === "CANCELADA") return acc;
      acc.orders += 1;
      acc.revenue += o.totalCents;
      acc.balance += Math.max(0, o.totalCents - o.paidCents);
      return acc;
    },
    { orders: 0, revenue: 0, balance: 0 },
  );

  return (
    <VehicleProfile
      vehicle={JSON.parse(JSON.stringify(vehicle))}
      client={JSON.parse(JSON.stringify(client))}
      lastMileage={last?.mileageIn ?? null}
      lastVisit={orders[0]?.entryDate ?? null}
      totals={totals}
      topServices={topServices.map((r) => ({
        description: String(r.description),
        count: Number(r.count),
        lastPriceCents: Number(r.last_price ?? 0),
      }))}
      orders={JSON.parse(
        JSON.stringify(
          orders.map((o) => ({
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
            diagnosis: o.diagnosis,
            mileageIn: o.mileageIn,
            warrantyMonths: o.warrantyMonths,
            items: o.items.map((i) => ({
              kind: i.kind,
              description: i.description,
              totalCents: i.totalCents,
            })),
          })),
        ),
      )}
    />
  );
}
