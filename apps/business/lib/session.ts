import "server-only";

import { randomUUID } from "node:crypto";

import { cookies } from "next/headers";

export const SESSION_COOKIE = "vado_business_session";
export const BUSINESS_COOKIE = "vado_business_selected";
export const INSTANCE_COOKIE = "vado_business_instance";
const DEVICE_COOKIE = "vado_business_device";
const options = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/",
};
export async function sessionToken(): Promise<string | null> {
  return (await cookies()).get(SESSION_COOKIE)?.value ?? null;
}
export async function writeSession(token: string, expiresAt: string): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, token, { ...options, expires: new Date(expiresAt) });
}
export async function clearSession(): Promise<void> {
  const jar = await cookies();
  for (const name of [SESSION_COOKIE, BUSINESS_COOKIE, INSTANCE_COOKIE]) jar.delete(name);
}
export async function readSelection(
  name: typeof BUSINESS_COOKIE | typeof INSTANCE_COOKIE,
): Promise<string | null> {
  return (await cookies()).get(name)?.value ?? null;
}
export async function writeSelection(
  name: typeof BUSINESS_COOKIE | typeof INSTANCE_COOKIE,
  value: string,
): Promise<void> {
  (await cookies()).set(name, value, { ...options, maxAge: 24 * 60 * 60 });
}
export async function deviceId(): Promise<string> {
  const jar = await cookies();
  const old = jar.get(DEVICE_COOKIE)?.value;
  if (old !== undefined && /^[A-Za-z0-9_-]{16,64}$/.test(old)) return old;
  const value = randomUUID();
  jar.set(DEVICE_COOKIE, value, { ...options, maxAge: 365 * 24 * 60 * 60 });
  return value;
}

export const KITCHEN_COOKIE = "vado_kitchen_session";
export const PAIRING_COOKIE = "vado_kitchen_pairing";
export async function kitchenToken(): Promise<string | null> {
  return (await cookies()).get(KITCHEN_COOKIE)?.value ?? null;
}
export async function writeKitchenSession(token: string, expiresAt: string) {
  await clearSession();
  const jar = await cookies();
  jar.set(KITCHEN_COOKIE, token, { ...options, expires: new Date(expiresAt) });
  jar.delete(PAIRING_COOKIE);
}
export async function clearKitchenSession() {
  (await cookies()).delete(KITCHEN_COOKIE);
}
export async function writePairing(id: string, secret: string, expiresAt: string) {
  (await cookies()).set(PAIRING_COOKIE, `${id}.${secret}`, {
    ...options,
    expires: new Date(expiresAt),
  });
}
export async function readPairing() {
  const value = (await cookies()).get(PAIRING_COOKIE)?.value;
  const parts = value?.split(".");
  return parts?.length === 2 ? { id: parts[0], secret: parts[1] } : null;
}
