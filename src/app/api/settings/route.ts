import { z } from "zod";
import { settingsRepo } from "@/server/db/settings";
import { ok, readJson, withAuth } from "@/server/api";

const schema = z
  .object({
    workshopName: z.string().trim().min(2, "Informe o nome da oficina.").max(120),
    legalName: z.string().trim().max(160),
    document: z.string().trim().max(20),
    phone: z.string().trim().max(20),
    address: z.string().trim().max(300),
    city: z.string().trim().max(80),
    state: z.string().trim().max(2),
    defaultWarrantyMonths: z.coerce.number().int().min(0).max(120),
    defaultLaborHourCents: z.coerce.number().int().min(0),
    printFooter: z.string().trim().max(600),
  })
  .partial();

export const GET = withAuth(null, async () => ok({ settings: settingsRepo.all() }));

export const PATCH = withAuth(["ADMIN", "GESTOR"], async (request) => {
  const body = await readJson(request);
  const patch = schema.parse(body);
  return ok({ settings: settingsRepo.update(patch) });
});
