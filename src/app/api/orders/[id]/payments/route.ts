import { z } from "zod";
import { ordersRepo } from "@/server/db/orders";
import { badRequest, notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const schema = z.object({
  amountCents: z.coerce.number().int().positive("Informe um valor maior que zero."),
  method: z
    .enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO", "TRANSFERENCIA", "BOLETO", "OUTRO"])
    .default("DINHEIRO"),
  paidAt: z.string().min(1).optional(),
  note: z.string().trim().max(300).nullish(),
});

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx, "id");
  if (!ordersRepo.findById(id)) throw notFound("Ordem de serviço");
  return ok({ payments: ordersRepo.paymentsOf(id) });
});

export const POST = withAuth(null, async (request, user, ctx) => {
  const id = await numberParam(ctx, "id");
  if (!ordersRepo.findById(id)) throw notFound("Ordem de serviço");

  const body = await readJson(request);
  const data = schema.parse(body);

  const result = ordersRepo.addPayment({
    orderId: id,
    amountCents: data.amountCents,
    method: data.method,
    paidAt: data.paidAt,
    note: data.note ?? null,
    createdBy: user.id,
  });
  if ("error" in result) throw badRequest(result.error);

  return ok(
    { payment: result.payment, order: ordersRepo.findDetailed(id) },
    { status: 201 },
  );
});
