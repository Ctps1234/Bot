import type { Role } from "@/lib/types";

export interface SessionUser {
  id: number;
  name: string;
  email: string;
  role: Role;
  roleLabel: string;
}
