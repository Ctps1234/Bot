import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/server/auth/session";
import { ensureDb } from "@/server/db";
import { identityGaps, settingsRepo } from "@/server/db/settings";
import { ROLE_LABEL } from "@/lib/types";
import { MobileNav, Sidebar } from "./sidebar";
import { SetupNotice } from "./setup-notice";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { ToastProvider } from "@/components/ui/toast";
import type { SessionUser } from "./types";

export async function AppShell({ children }: { children: ReactNode }) {
  ensureDb();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const settings = settingsRepo.all();
  const sessionUser: SessionUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    roleLabel: ROLE_LABEL[user.role],
  };

  return (
    <ToastProvider>
      <div className="min-h-dvh lg:grid lg:grid-cols-[16.5rem_1fr]">
        <aside className="no-print sticky top-0 hidden h-dvh lg:block">
          <Sidebar user={sessionUser} workshopName={settings.workshopName} />
        </aside>

        <MobileNav user={sessionUser} workshopName={settings.workshopName} />

        <main className="min-w-0">
          <div className="mx-auto w-full max-w-[86rem] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
            <SetupNotice gaps={identityGaps(settings)} />
            {children}
          </div>
        </main>
      </div>

      <KeyboardShortcuts />
    </ToastProvider>
  );
}
