import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { badRequest, notFound, numberParam, ok, readJson, withAuth } from "@/server/api";
import { STATUS_FLOW, type OrderStatus } from "@/lib/types";
import { toISODate } from "@/lib/utils";

const patchSchema = z
  .object({
    status: z.enum(["ABERTA", "EM_EXECUCAO", "CONCLUIDA", "ENTREGUE", "CANCELADA"]),
    entryDate: z.string().min(1),
    expectedFinish: z.string().nullish(),
    mileageIn: z.coerce.number().int().min(0).nullish(),
    fuelLevel: z.coerce.number().int().min(0).max(100).nullish(),
    reportedIssue: z.string().trim().max(4000),
    diagnosis: z.string().trim().max(4000),
    notes: z.string().trim().max(4000),
    warrantyMonths: z.coerce.number().int().min(0).max(120),
    technicianId: z.coerce.number().int().positive().nullish(),
    discountCents: z.coerce.number().int().min(0),
    clientId: z.coerce.number().int().positive(),
    vehicleId: z.coerce.number().int().positive(),
    cancelReason: z.string().trim().max(500),
  })
  .partial();

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  const order = ordersRepo.findDetailed(id);
  if (!order) throw notFound("Ordem de serviço");
  return ok({ order });
});

export const PATCH = withAuth(null, async (request, _user, ctx) => {
  const id = await numberParam(ctx);
  const current = ordersRepo.findById(id);
  if (!current) throw notFound("Ordem de serviço");

  const body = await readJson(request);
  const patch = patchSchema.parse(body);

  // Transição de status controlada pelo fluxo simples
  if (patch.status && patch.status !== current.status) {
    if (patch.status === "CANCELADA") {
      const order = ordersRepo.cancel(id, patch.cancelReason);
      return ok({ order: ordersRepo.findDetailed(order!.id) });
    }
    const allowed = STATUS_FLOW[current.status] ?? [];
    if (!allowed.includes(patch.status)) {
      throw badRequest(
        `Não é possível mudar de "${current.status}" para "${patch.status}".`,
      );
    }
  }

  if (patch.vehicleId) {
    const vehicle = clientsRepo.vehicleById(patch.vehicleId);
    if (!vehicle) throw badRequest("Veículo inválido.");
    const clientId = patch.clientId ?? current.clientId;
    if (vehicle.clientId !== clientId) {
      throw badRequest("O veículo informado pertence a outro cliente.");
    }
  }

  const updated = ordersRepo.update(id, {
    ...(patch.entryDate ? { entryDate: toISODate(patch.entryDate) ?? patch.entryDate } : {}),
    ...(patch.expectedFinish !== undefined
      ? { expectedFinish: patch.expectedFinish ? toISODate(patch.expectedFinish) : null }
      : {}),
    ...(patch.mileageIn !== undefined ? { mileageIn: patch.mileageIn } : {}),
    ...(patch.fuelLevel !== undefined ? { fuelLevel: patch.fuelLevel } : {}),
    ...(patch.reportedIssue !== undefined ? { reportedIssue: patch.reportedIssue } : {}),
    ...(patch.diagnosis !== undefined ? { diagnosis: patch.diagnosis } : {}),
    ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    ...(patch.warrantyMonths !== undefined ? { warrantyMonths: patch.warrantyMonths } : {}),
    ...(patch.technicianId !== undefined ? { technicianId: patch.technicianId } : {}),
    ...(patch.discountCents !== undefined ? { discountCents: patch.discountCents } : {}),
    ...(patch.clientId !== undefined ? { clientId: patch.clientId } : {}),
    ...(patch.vehicleId !== undefined ? { vehicleId: patch.vehicleId } : {}),
    ...(patch.status ? { status: patch.status as OrderStatus } : {}),
  });

  return ok({ order: ordersRepo.findDetailed(updated!.id) });
});

export const DELETE = withAuth(["ADMIN"], async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  const order = ordersRepo.findById(id);
  if (!order) throw notFound("Ordem de serviço");
  if (order.status !== "CANCELADA") {
    throw badRequest("Somente OS canceladas podem ser excluídas em definitivo.");
  }
  const { getDb } = await import("@/server/db");
  getDb().prepare("DELETE FROM orders WHERE id = ?").run(id);
  return ok({ ok: true });
});
