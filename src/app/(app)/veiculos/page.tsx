import type { Metadata } from "next";
import { ensureDb, getDb } from "@/server/db";
import { VehiclesView } from "./vehicles-view";

export const metadata: Metadata = { title: "Veículos" };
export const dynamic = "force-dynamic";

export default async function VehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  ensureDb();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();

  const like = `%${q.replace(/[^A-Za-z0-9 ]/g, "")}%`;
  const params: (string | number)[] = [];
  const where = q
    ? `WHERE v.deleted_at IS NULL AND (v.plate LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR c.name LIKE ?)`
    : "WHERE v.deleted_at IS NULL";
  if (q) params.push(like, like, like, like);

  const rows = getDb()
    .prepare(
      `SELECT v.*, c.name AS client_name, c.id AS cid,
              (SELECT COUNT(*) FROM orders o WHERE o.vehicle_id = v.id) AS orders,
              (SELECT MAX(o.entry_date) FROM orders o WHERE o.vehicle_id = v.id) AS last_visit,
              (SELECT o.mileage_in FROM orders o
                WHERE o.vehicle_id = v.id AND o.mileage_in IS NOT NULL
                ORDER BY o.entry_date DESC, o.id DESC LIMIT 1) AS last_mileage
         FROM vehicles v JOIN clients c ON c.id = v.client_id
         ${where}
        ORDER BY v.plate COLLATE NOCASE
        LIMIT 400`,
    )
    .all(...params);

  return (
    <VehiclesView
      initialQuery={q}
      vehicles={rows.map((r) => ({
        id: Number(r.id),
        plate: String(r.plate),
        brand: r.brand ? String(r.brand) : null,
        model: r.model ? String(r.model) : null,
        year: r.year ? Number(r.year) : null,
        color: r.color ? String(r.color) : null,
        voltage: String(r.voltage ?? "12V"),
        fleetNumber: r.fleet_number ? String(r.fleet_number) : null,
        clientId: Number(r.client_id),
        clientName: String(r.client_name),
        orders: Number(r.orders ?? 0),
        lastVisit: r.last_visit ? String(r.last_visit) : null,
        lastMileage: r.last_mileage != null ? Number(r.last_mileage) : null,
      }))}
    />
  );
}
