import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { ordersRepo } from "@/server/db/orders";
import { clientsRepo } from "@/server/db/clients";
import { usersRepo } from "@/server/db/users";
import { settingsRepo } from "@/server/db/settings";
import { OrderDetail } from "./order-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  ensureDb();
  const order = ordersRepo.findById(Number(id));
  return { title: order ? `OS ${order.number}` : "Ordem de serviço" };
}

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  ensureDb();
  const { id } = await params;
  const order = ordersRepo.findDetailed(Number(id));
  if (!order) notFound();

  const settings = settingsRepo.all();

  return (
    <OrderDetail
      order={JSON.parse(JSON.stringify(order))}
      settings={{
        workshopName: settings.workshopName,
        legalName: settings.legalName,
        document: settings.document,
        phone: settings.phone,
        address: settings.address,
        city: settings.city,
        state: settings.state,
        printFooter: settings.printFooter,
        defaultWarrantyMonths: settings.defaultWarrantyMonths,
      }}
      technicians={usersRepo.listTechnicians().map((t) => ({ id: t.id, name: t.name }))}
      clientVehicles={clientsRepo
        .vehiclesOf(order.clientId)
        .map((v) => ({
          id: v.id,
          plate: v.plate,
          brand: v.brand,
          model: v.model,
          year: v.year,
          voltage: v.voltage,
        }))}
    />
  );
}
