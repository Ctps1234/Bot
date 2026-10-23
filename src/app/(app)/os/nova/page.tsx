import type { Metadata } from "next";
import { ensureDb, getDb } from "@/server/db";
import { clientsRepo } from "@/server/db/clients";
import { usersRepo } from "@/server/db/users";
import { settingsRepo } from "@/server/db/settings";
import { ordersRepo } from "@/server/db/orders";
import { OrderForm } from "./order-form";

export const metadata: Metadata = { title: "Nova OS" };
export const dynamic = "force-dynamic";

export default async function NewOrderPage() {
  ensureDb();

  const clients = clientsRepo.list({ limit: 400 }).rows;

  // veículos agrupados por cliente (uma consulta só)
  const vehicles = clients.length
    ? getDb()
        .prepare(
          `SELECT * FROM vehicles
            WHERE deleted_at IS NULL AND client_id IN (${clients.map(() => "?").join(",")})
            ORDER BY plate COLLATE NOCASE`,
        )
        .all(...clients.map((c) => c.id))
    : [];

  const vehiclesByClient: Record<number, typeof vehicles> = {};
  for (const row of vehicles) {
    const clientId = Number(row.client_id);
    (vehiclesByClient[clientId] ??= []).push(row);
  }

  // última quilometragem registrada por veículo (pré-preenche o campo)
  const lastMileageRows = getDb()
    .prepare(
      `SELECT vehicle_id, MAX(entry_date) AS last_date FROM orders
        WHERE mileage_in IS NOT NULL GROUP BY vehicle_id`,
    )
    .all();
  const lastMileage: Record<number, number> = {};
  for (const row of lastMileageRows) {
    const detail = getDb()
      .prepare(
        `SELECT mileage_in FROM orders
          WHERE vehicle_id = ? AND entry_date = ? AND mileage_in IS NOT NULL
          ORDER BY id DESC LIMIT 1`,
      )
      .get(Number(row.vehicle_id), String(row.last_date));
    if (detail?.mileage_in != null) {
      lastMileage[Number(row.vehicle_id)] = Number(detail.mileage_in);
    }
  }

  // descrições já usadas em outras OS -> sugestões de autocomplete
  const suggestions = getDb()
    .prepare(
      `SELECT description, kind FROM order_items GROUP BY description, kind
        ORDER BY MAX(id) DESC LIMIT 80`,
    )
    .all()
    .map((r) => ({ description: String(r.description), kind: String(r.kind) }));

  const technicians = usersRepo
    .listTechnicians()
    .map((t) => ({ id: t.id, name: t.name }));

  const settings = settingsRepo.all();

  return (
    <OrderForm
      clients={clients.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        document: c.document,
      }))}
      vehicles={vehicles.map((v) => ({
        id: Number(v.id),
        clientId: Number(v.client_id),
        plate: String(v.plate),
        brand: v.brand ? String(v.brand) : null,
        model: v.model ? String(v.model) : null,
        year: v.year ? Number(v.year) : null,
        voltage: String(v.voltage ?? "12V") as never,
      }))}
      technicians={technicians}
      defaultWarrantyMonths={settings.defaultWarrantyMonths}
      nextNumber={`OS-${String(settings.orderSeq + 1).padStart(4, "0")}`}
      suggestions={suggestions}
      lastMileage={lastMileage}
    />
  );
}
