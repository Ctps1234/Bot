import type { Metadata } from "next";
import { ensureDb } from "@/server/db";
import { settingsRepo } from "@/server/db/settings";
import { usersRepo } from "@/server/db/users";
import { getCurrentUser } from "@/server/auth/session";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = { title: "Configurações" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  ensureDb();
  const settings = settingsRepo.all();
  const users = usersRepo.list(true);
  const current = await getCurrentUser();

  return (
    <SettingsView
      settings={settings}
      users={JSON.parse(
        JSON.stringify(
          users.map((u) => ({
            id: u.id,
            name: u.name,
            email: u.email,
            role: u.role,
            phone: u.phone,
            active: u.active,
            createdAt: u.createdAt,
          })),
        ),
      )}
      currentUserId={current?.id ?? 0}
      canManageUsers={(current?.role ?? "RECEPCAO") === "ADMIN"}
      canEditSettings={["ADMIN", "GESTOR"].includes(current?.role ?? "")}
      driver={ensureDb().driver}
    />
  );
}
