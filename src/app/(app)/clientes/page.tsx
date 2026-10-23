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

  // Agregados (veículos, OS, última visita, saldo) vêm do repositório — a mesma
  // fonte usada pela rota /api/clients, para a busca no cliente não perder colunas.
  const { rows, total } = clientsRepo.listWithStats({ q, limit: 300 });

  return <ClientsView initialQuery={q} total={total} clients={rows} />;
}
