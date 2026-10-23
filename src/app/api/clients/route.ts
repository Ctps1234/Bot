import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { badRequest, ok, readJson, withAuth } from "@/server/api";

const createSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome do cliente."),
  personType: z.enum(["FISICA", "JURIDICA"]).default("FISICA"),
  document: z.string().trim().max(20).nullish(),
  phone: z.string().trim().max(20).nullish(),
  email: z.string().trim().email("E-mail inválido.").max(120).nullish().or(z.literal("")),
  address: z.string().trim().max(300).nullish(),
  notes: z.string().trim().max(4000).nullish(),
});

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  const q = url.searchParams.get("q") ?? "";
  const limit = Number(url.searchParams.get("limit") ?? 100);
  const offset = Number(url.searchParams.get("offset") ?? 0);

  // modo "search": lista curta para autocomplete
  if (url.searchParams.get("mode") === "search") {
    return ok({ rows: clientsRepo.search(q, Number(url.searchParams.get("limit") ?? 8)) });
  }

  const result = clientsRepo.list({
    q,
    limit: Number.isFinite(limit) ? limit : 100,
    offset: Number.isFinite(offset) ? offset : 0,
  });
  return ok(result);
});

export const POST = withAuth(null, async (request) => {
  const body = await readJson(request);
  const data = createSchema.parse(body);
  if (!data.name) throw badRequest("Informe o nome do cliente.");
  const client = clientsRepo.create({
    ...data,
    email: data.email || null,
  });
  return ok({ client }, { status: 201 });
});
