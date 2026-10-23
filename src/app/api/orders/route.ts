import { z } from "zod";
import { clientsRepo } from "@/server/db/clients";
import { ordersRepo } from "@/server/db/orders";
import { settingsRepo } from "@/server/db/settings";
import { badRequest, ok, readJson, withAuth } from "@/server/api";
import type { OrderStatus } from "@/lib/types";
import { normalizePlate, toISODate } from "@/lib/utils";

const itemSchema = z.object({
  kind: z.enum(["PECA", "SERVICO"]),
  description: z.string().trim().min(1, "Descreva o item."),
  quantity: z.coerce.number().positive().default(1),
  unitPriceCents: z.coerce.number().int().min(0).default(0),
  warrantyMonths: z.coerce.number().int().min(0).max(120).default(0),
  notes: z.string().trim().max(500).nullish(),
});

/**
 * Criação de OS.
 * Cliente pode ser informado por `clientId` OU por `client` (dados inline —
 * neste caso o cliente é encontrado pelo nome ou criado na hora).
 * Veículo pode ser informado por `vehicleId` OU por `vehicle` (dados inline).
 */
const createSchema = z.object({
  clientId: z.coerce.number().int().positive().optional(),
  client: z
    .object({
      name: z.string().trim().min(2, "Informe o nome do cliente."),
      phone: z.string().trim().max(20).nullish(),
      email: z.string().trim().max(120).nullish(),
      document: z.string().trim().max(20).nullish(),
      personType: z.enum(["FISICA", "JURIDICA"]).default("FISICA"),
    })
    .optional(),
  vehicleId: z.coerce.number().int().positive().optional(),
  vehicle: z
    .object({
      plate: z.string().trim().min(4, "Informe a placa do veículo."),
      brand: z.string().trim().max(60).nullish(),
      model: z.string().trim().max(80).nullish(),
      year: z.coerce.number().int().min(1950).max(2100).nullish(),
      color: z.string().trim().max(40).nullish(),
      voltage: z.enum(["12V", "24V", "12V/24V", "OUTRO"]).default("12V"),
    })
    .optional(),
  entryDate: z.string().min(1).optional(),
  expectedFinish: z.string().nullish(),
  mileageIn: z.coerce.number().int().min(0).nullish(),
  fuelLevel: z.coerce.number().int().min(0).max(100).nullish(),
  reportedIssue: z.string().trim().max(4000).default(""),
  diagnosis: z.string().trim().max(4000).default(""),
  notes: z.string().trim().max(4000).default(""),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional(),
  technicianId: z.coerce.number().int().positive().nullish(),
  discountCents: z.coerce.number().int().min(0).default(0),
  status: z.enum(["ABERTA", "EM_EXECUCAO", "CONCLUIDA", "ENTREGUE"]).default("ABERTA"),
  items: z.array(itemSchema).default([]),
});

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  const get = (k: string) => url.searchParams.get(k);

  const statusParam = get("status") ?? "TODAS";
  const rows = ordersRepo.list({
    q: get("q") ?? "",
    status: statusParam as OrderStatus | "TODAS" | "ATIVAS",
    financialStatus: (get("financialStatus") ?? "TODAS") as never,
    clientId: get("clientId") ? Number(get("clientId")) : undefined,
    vehicleId: get("vehicleId") ? Number(get("vehicleId")) : undefined,
    technicianId: get("technicianId") ? Number(get("technicianId")) : undefined,
    from: get("from") || null,
    to: get("to") || null,
    limit: Number(get("limit") ?? 50),
    offset: Number(get("offset") ?? 0),
  });

  return ok({
    rows: rows.rows,
    total: rows.total,
    statusBreakdown: ordersRepo.countByStatus(),
    settings: {
      defaultWarrantyMonths: settingsRepo.all().defaultWarrantyMonths,
    },
  });
});

export const POST = withAuth(null, async (request, user) => {
  const body = await readJson(request);
  const data = createSchema.parse(body);

  /* ---------------- resolve cliente (existente ou novo) ---------------- */
  let clientId = data.clientId;
  if (!clientId) {
    if (!data.client?.name) throw badRequest("Informe o cliente da OS.");
    const existing = clientsRepo.findByName(data.client.name);
    if (existing) {
      clientId = existing.id;
      // complementa dados ausentes sem sobrescrever o que já existe
      clientsRepo.update(existing.id, {
        phone: existing.phone || data.client.phone || null,
        email: existing.email || data.client.email || null,
        document: existing.document || data.client.document || null,
      });
    } else {
      clientId = clientsRepo.create({
        name: data.client.name,
        phone: data.client.phone || null,
        email: data.client.email || null,
        document: data.client.document || null,
        personType: data.client.personType ?? "FISICA",
      }).id;
    }
  }
  const client = clientsRepo.findById(clientId);
  if (!client) throw badRequest("Cliente inválido.");

  /* ---------------- resolve veículo (existente ou novo) ---------------- */
  let vehicleId = data.vehicleId;
  if (vehicleId) {
    const v = clientsRepo.vehicleById(vehicleId);
    if (!v) throw badRequest("Veículo inválido.");
    if (v.clientId !== client.id) {
      throw badRequest("O veículo informado pertence a outro cliente.");
    }
  } else {
    if (!data.vehicle?.plate) {
      throw badRequest("Informe a placa do veículo ou selecione um veículo cadastrado.");
    }
    const plate = normalizePlate(data.vehicle.plate);
    const existing = clientsRepo.vehicleByPlate(plate);
    if (existing) {
      vehicleId = existing.id;
      if (existing.clientId !== client.id) {
        throw badRequest(
          `A placa ${plate} já está cadastrada para o cliente "${clientsRepo.findById(existing.clientId)?.name ?? "outro"}".`,
        );
      }
    } else {
      vehicleId = clientsRepo.createVehicle({ clientId: client.id, ...data.vehicle, plate }).id;
    }
  }

  /* ---------------------------- cria a OS ---------------------------- */
  const settings = settingsRepo.all();
  const order = ordersRepo.create({
    clientId: client.id,
    vehicleId,
    entryDate: toISODate(data.entryDate) ?? toISODate(new Date())!,
    expectedFinish: data.expectedFinish ? toISODate(data.expectedFinish) : null,
    mileageIn: data.mileageIn ?? null,
    fuelLevel: data.fuelLevel ?? null,
    reportedIssue: data.reportedIssue,
    diagnosis: data.diagnosis,
    notes: data.notes,
    warrantyMonths: data.warrantyMonths ?? settings.defaultWarrantyMonths,
    technicianId: data.technicianId ?? null,
    discountCents: data.discountCents ?? 0,
    status: data.status,
    createdBy: user.id,
  });

  if (data.items.length > 0) {
    ordersRepo.addItems(order.id, data.items.map((i) => ({ ...i, notes: i.notes ?? null })));
  }

  return ok({ order: ordersRepo.findDetailed(order.id) }, { status: 201 });
});
