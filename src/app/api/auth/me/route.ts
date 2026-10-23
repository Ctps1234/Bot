import { getCurrentUser } from "@/server/auth/session";
import { settingsRepo } from "@/server/db/settings";
import { ok, unauthorized, withAuth } from "@/server/api";

export const GET = withAuth(null, async () => {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  const settings = settingsRepo.all();
  return ok({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    },
    workshop: {
      name: settings.workshopName,
      city: settings.city,
    },
  });
});
