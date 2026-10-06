import type * as Crypto from "node:crypto";

import { afterAll, beforeAll, expect, it, vi } from "vitest";

const phones = vi.hoisted(() => ({ values: [] as number[] }));
vi.mock("node:crypto", async () => {
  const actual = await vi.importActual<typeof Crypto>("node:crypto");
  return {
    ...actual,
    randomInt: (min: number, max?: number) => {
      if (min === 0 && max === 10_000_000)
        return phones.values.shift() ?? actual.randomInt(min, max);
      return max === undefined ? actual.randomInt(min) : actual.randomInt(min, max);
    },
  };
});
import { createUser, startTestApp, type TestApp } from "./support/harness";
let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
});
afterAll(async () => {
  await app.stop();
});
it("test kullanıcıları rastgele telefon çakışmasını yeniden deneyerek ayırır", async () => {
  phones.values = [9_000_001, 9_000_001, 9_000_002];
  const a = await createUser(app, "Birinci");
  const b = await createUser(app, "İkinci");
  expect(a.phone).not.toBe(b.phone);
  expect(a.id).not.toBe(b.id);
});
