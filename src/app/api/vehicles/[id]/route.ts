import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { badRequest, notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const updateSchema = z
  .object({
    plate: z.string().trim().min(4, "Informe a placa."),
    brand: z.string().trim().max(60).nullish(),
    model: z.string().trim().max(80).nullish(),
    year: z.coerce.number().int().min(1950).max(2100).nullish(),
    color: z.string().trim().max(40).nullish(),
    voltage: z.enum(["12V", "24V", "12V/24V", "OUTRO"]),
    fleetNumber: z.string().trim().max(30).nullish(),
    notes: z.string().trim().max(2000).nullish(),
  })
  .partial();

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  const vehicle = clientsRepo.vehicleById(id);
  if (!vehicle) throw notFound("Veículo");

  const orders = ordersRepo.list({ vehicleId: id, limit: 50 }).rows;
  return ok({
    vehicle,
    client: clientsRepo.findById(vehicle.clientId),
    orders,
    lastOrder: ordersRepo.lastOrderOfVehicle(id),
  });
});

export const PATCH = withAuth(null, async (request, _user, ctx) => {
  const id = await numberParam(ctx);
  if (!clientsRepo.vehicleById(id)) throw notFound("Veículo");
  const body = await readJson(request);
  const vehicle = clientsRepo.updateVehicle(id, updateSchema.parse(body));
  return ok({ vehicle });
});

export const DELETE = withAuth(["ADMIN", "GESTOR"], async (_request, _user, ctx) => {
  const id = await numberParam(ctx);
  if (!clientsRepo.vehicleById(id)) throw notFound("Veículo");
  const result = clientsRepo.deleteVehicle(id);
  if (!result.ok) throw badRequest(result.error ?? "Não foi possível excluir.");
  return ok({ ok: true });
});
