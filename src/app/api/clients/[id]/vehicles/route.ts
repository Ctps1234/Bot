import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { notFound, numberParam, ok, readJson, withAuth } from "@/server/api";

const schema = z.object({
  plate: z.string().trim().min(4, "Informe a placa."),
  brand: z.string().trim().max(60).nullish(),
  model: z.string().trim().max(80).nullish(),
  year: z.coerce.number().int().min(1950).max(2100).nullish(),
  color: z.string().trim().max(40).nullish(),
  voltage: z.enum(["12V", "24V", "12V/24V", "OUTRO"]).default("12V"),
  fleetNumber: z.string().trim().max(30).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export const GET = withAuth(null, async (_request, _user, ctx) => {
  const id = await numberParam(ctx, "id");
  if (!clientsRepo.findById(id)) throw notFound("Cliente");
  return ok({ vehicles: clientsRepo.vehiclesOf(id) });
});

export const POST = withAuth(null, async (request, _user, ctx) => {
  const clientId = await numberParam(ctx, "id");
  if (!clientsRepo.findById(clientId)) throw notFound("Cliente");

  const body = await readJson(request);
  const data = schema.parse(body);
  const vehicle = clientsRepo.createVehicle({ clientId, ...data });
  return ok({ vehicle }, { status: 201 });
});
