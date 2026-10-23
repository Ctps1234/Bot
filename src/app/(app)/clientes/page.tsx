import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { clientsRepo } from "@/server/db/clients";
import { ClientsView } from "./clients-view";

export const metadata: Metadata = { title: "Clientes" };
export const dynamic = "force-dynamic";

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  ensureDb();
  const sp = await searchParams;
  const q = sp.q ?? "";

  const { rows, total } = clientsRepo.list({ q, limit: 300 });

  // agregados por cliente em uma consulta só
  const ids = rows.map((r) => r.id);
  const stats = ids.length
    ? ensureDb()
        .prepare(
          `SELECT c.id AS client_id,
                  COUNT(v.id) AS vehicles,
                  (SELECT COUNT(*) FROM orders o WHERE o.client_id = c.id) AS orders,
                  (SELECT COALESCE(MAX(o.entry_date), NULL) FROM orders o WHERE o.client_id = c.id) AS last_visit,
                  (SELECT COALESCE(SUM(o.total_cents - o.paid_cents), 0) FROM orders o
                    WHERE o.client_id = c.id AND o.status <> 'CANCELADA') AS balance
             FROM clients c
             LEFT JOIN vehicles v ON v.client_id = c.id AND v.deleted_at IS NULL
            WHERE c.id IN (${ids.map(() => "?").join(",")})
            GROUP BY c.id`,
        )
        .all(...ids)
    : [];

  const statsMap = new Map<number, (typeof stats)[number]>();
  for (const s of stats) statsMap.set(Number(s.client_id), s);

  return (
    <ClientsView
      initialQuery={q}
      total={total}
      clients={rows.map((c) => {
        const s = statsMap.get(c.id);
        return {
          id: c.id,
          name: c.name,
          personType: c.personType,
          document: c.document,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
          vehicles: Number(s?.vehicles ?? 0),
          orders: Number(s?.orders ?? 0),
          lastVisit: s?.last_visit ? String(s.last_visit) : null,
          balanceCents: Number(s?.balance ?? 0),
        };
      })}
    />
  );
}
