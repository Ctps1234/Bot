import { z } from "zod";
import { usersRepo } from "@/server/db/users";
import { badRequest, conflict, ok, readJson, withAuth } from "@/server/api";

const schema = z.object({
  name: z.string().trim().min(2, "Informe o nome."),
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(6, "A senha deve ter ao menos 6 caracteres."),
  role: z.enum(["ADMIN", "GESTOR", "TECNICO", "RECEPCAO"]).default("TECNICO"),
  phone: z.string().trim().max(20).nullish(),
});

export const GET = withAuth(null, async (request) => {
  const url = new URL(request.url);
  if (url.searchParams.get("mode") === "technicians") {
    return ok({ users: usersRepo.listTechnicians() });
  }
  return ok({ users: usersRepo.list(true) });
});

export const POST = withAuth(["ADMIN"], async (request) => {
  const body = await readJson(request);
  const data = schema.parse(body);
  if (usersRepo.findByEmail(data.email)) {
    throw conflict("Já existe um usuário com este e-mail.");
  }
  const user = usersRepo.create(data);
  return ok(
    { user: { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, active: user.active } },
    { status: 201 },
  );
});

export const PATCH = withAuth(["ADMIN"], async (request) => {
  const body = await readJson<{ id?: number } & z.infer<typeof schema> & { active?: boolean }>(
    request,
  );
  const id = Number(body.id);
  if (!Number.isFinite(id) || id <= 0) throw badRequest("Informe o id do usuário.");
  const target = usersRepo.findById(id);
  if (!target) throw badRequest("Usuário não encontrado.");

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = body.name;
  if (body.email !== undefined) patch.email = body.email;
  if (body.role !== undefined) patch.role = body.role;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.active !== undefined) patch.active = body.active;
  if (body.password) patch.password = body.password;

  // não permitir remover o último administrador ativo
  if ((patch.active === false || patch.role !== undefined) && target.role === "ADMIN") {
    const stillAdmin =
      target.role === "ADMIN" && patch.active !== false && (patch.role ?? "ADMIN") === "ADMIN";
    if (!stillAdmin && usersRepo.countAdmins() <= 1) {
      throw badRequest("É necessário manter ao menos um administrador ativo.");
    }
  }

  const user = usersRepo.update(id, patch as never);
  return ok({
    user: user
      ? { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone, active: user.active }
      : null,
  });
});
