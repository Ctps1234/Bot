import { ok, withAuth } from "@/server/api";
import { normalizePlate } from "@/lib/utils";

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const term = normalizePlate(q) || q.replace(/[^A-Za-z0-9 ]/g, "");

  const { getDb } = await import("@/server/db");
  const like = `%${term}%`;
  const rows = getDb()
    .prepare(
      `SELECT v.*, c.name AS client_name,
              (SELECT COUNT(*) FROM orders o WHERE o.vehicle_id = v.id) AS orders,
              (SELECT MAX(o.entry_date) FROM orders o WHERE o.vehicle_id = v.id) AS last_visit,
              (SELECT o.mileage_in FROM orders o
                WHERE o.vehicle_id = v.id AND o.mileage_in IS NOT NULL
                ORDER BY o.entry_date DESC, o.id DESC LIMIT 1) AS last_mileage
         FROM vehicles v JOIN clients c ON c.id = v.client_id
        WHERE v.deleted_at IS NULL
          AND (v.plate LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR c.name LIKE ?)
        ORDER BY v.plate COLLATE NOCASE LIMIT 400`,
    )
    .all(like, like, like, like);

  return ok({
    rows: rows.map((r) => ({
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
    })),
  });
});

