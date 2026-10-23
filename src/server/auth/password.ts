import { hashSync, compareSync, genSaltSync } from "bcryptjs";

const SALT_ROUNDS = 10;

export function hashPassword(plain: string): string {
  return hashSync(plain, genSaltSync(SALT_ROUNDS));
}

export function verifyPassword(plain: string, hash: string): boolean {
  try {
    return compareSync(plain, hash);
  } catch {
    return false;
  }
}

export function isStrongEnough(password: string): boolean {
  return typeof password === "string" && password.length >= 6;
}
