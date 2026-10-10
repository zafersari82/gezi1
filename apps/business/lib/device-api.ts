import "server-only";

import type { z } from "zod";

import { apiRequest, BusinessApiError } from "./api";
import { kitchenToken } from "./session";
export async function deviceRequest(method: string, path: string, body?: unknown) {
  const token = await kitchenToken();
  if (token === null) throw new BusinessApiError(401, "unauthorized", "Tableti mutfağa eşleştir.");
  return apiRequest(method, path, body, true, token);
}
export async function deviceGet<Schema extends z.ZodType>(
  schema: Schema,
  path: string,
): Promise<z.infer<Schema>> {
  return schema.parse(await (await deviceRequest("GET", path)).json());
}
