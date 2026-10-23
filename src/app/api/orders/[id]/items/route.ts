import { z } from "zod";
import { ordersRepo } from "@/server/db/orders";
import { notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const itemSchema = z.object({
  kind: z.enum(["PECA", "SERVICO"]),
  description: z.string().trim().min(1, "Descreva o item."),
  quantity: z.coerce.number().positive("Quantidade deve ser maior que zero.").default(1),
  unitPriceCents: z.coerce.number().int().min(0).default(0),
  warrantyMonths: z.coerce.number().int().min(0).max(120).default(0),
  notes: z.string().trim().max(500).nullish(),
});

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx, "id");
  if (!ordersRepo.findById(id)) throw notFound("Ordem de serviço");
  return ok({ items: ordersRepo.itemsOf(id) });
});

export const POST = withAuth(null, async (request, _user, ctx) => {
  const id = await numberParam(ctx, "id");
  if (!ordersRepo.findById(id)) throw notFound("Ordem de serviço");

  const body = await readJson<{ item?: unknown; items?: unknown[] }>(request);
  const inputs = Array.isArray(body.items) ? body.items : [body.item ?? body];
  const parsed = inputs.map((i) => itemSchema.parse(i));

  ordersRepo.addItems(
    id,
    parsed.map((p) => ({ ...p, notes: p.notes ?? null })),
  );
  return ok({ order: ordersRepo.findDetailed(id) }, { status: 201 });
});
