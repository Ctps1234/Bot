import { z } from "zod";
import { ordersRepo } from "@/server/db/orders";
import { notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const schema = z
  .object({
    kind: z.enum(["PECA", "SERVICO"]),
    description: z.string().trim().min(1, "Descreva o item."),
    quantity: z.coerce.number().positive().min(0.01),
    unitPriceCents: z.coerce.number().int().min(0),
    warrantyMonths: z.coerce.number().int().min(0).max(120),
    notes: z.string().trim().max(500).nullish(),
  })
  .partial();

export const PATCH = withAuth(null, async (request, _user, ctx) => {
  const itemId = await numberParam(ctx, "itemId");
  const body = await readJson(request);
  const order = ordersRepo.updateItem(itemId, schema.parse(body));
  if (!order) throw notFound("Item");
  return ok({ order: ordersRepo.findDetailed(order.id) });
});

export const DELETE = withAuth(null, async (_request, _user, ctx) => {
  const itemId = await numberParam(ctx, "itemId");
  const order = ordersRepo.deleteItem(itemId);
  if (!order) throw notFound("Item");
  return ok({ order: ordersRepo.findDetailed(order.id) });
});
