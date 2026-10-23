import { NextResponse } from "next/server";
import { z } from "zod";
import { usersRepo } from "@/server/db/users";
import { setSessionCookie } from "@/server/auth/session";
import { readJson, toResponse } from "@/server/api";

const schema = z.object({
  email: z.string().trim().min(1, "Informe o e-mail."),
  password: z.string().min(1, "Informe a senha."),
});

export async function POST(request: Request) {
  try {
    const body = await readJson(request);
    const { email, password } = schema.parse(body);

    const user = usersRepo.authenticate(email, password);
    if (!user) {
      return NextResponse.json(
        { error: "E-mail ou senha inválidos." },
        { status: 401 },
      );
    }

    await setSessionCookie(user);
    return NextResponse.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    return toResponse(error);
  }
}
