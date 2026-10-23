import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { badRequest, notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const updateSchema = z
  .object({
    name: z.string().trim().min(2, "Informe o nome do cliente."),
    personType: z.enum(["FISICA", "JURIDICA"]),
    document: z.string().trim().max(20).nullish(),
    phone: z.string().trim().max(20).nullish(),
    email: z.string().trim().email("E-mail inválido.").max(120).nullish().or(z.literal("")),
    address: z.string().trim().max(300).nullish(),
    notes: z.string().trim().max(4000).nullish(),
  })
  .partial();

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  const client = clientsRepo.findById(id);
  if (!client) throw notFound("Cliente");

  const vehicles = clientsRepo.vehiclesOf(id);
  const history = ordersRepo.historyOfClient(id, 25);

  const totals = history.reduce(
    (acc, o) => {
      if (o.status === "CANCELADA") return acc;
      acc.orders += 1;
      acc.revenue += o.totalCents;
      acc.balance += Math.max(0, o.totalCents - o.paidCents);
      return acc;
    },
    { orders: 0, revenue: 0, balance: 0 },
  );

  return ok({
    client,
    vehicles,
    orders: history,
    totals: {
      vehicles: vehicles.length,
      orders: totals.orders,
      revenueCents: totals.revenue,
      balanceCents: totals.balance,
      lastVisit: history[0]?.entryDate ?? null,
    },
  });
});

export const PATCH = withAuth(null, async (request, _user, ctx) => {
  const id = await numberParam(ctx);
  if (!clientsRepo.findById(id)) throw notFound("Cliente");

  const body = await readJson(request);
  const patch = updateSchema.parse(body);
  const client = clientsRepo.update(id, { ...patch, email: patch.email || null });
  return ok({ client });
});

export const DELETE = withAuth(["ADMIN", "GESTOR"], async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  if (!clientsRepo.findById(id)) throw notFound("Cliente");
  const result = clientsRepo.softDelete(id);
  if (!result.ok) throw badRequest(result.error ?? "Não foi possível excluir.");
  return ok({ ok: true });
});
