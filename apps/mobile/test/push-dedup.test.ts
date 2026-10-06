import { randomUUID } from "node:crypto";

import { expect, test } from "vitest";

import { createPushDeduplicator } from "@/features/notifications/push-dedup";

test("aynı bildirim eş zamanlı ve uygulama yeniden açılınca bir kez gösterilir", async () => {
  const saved = new Map<string, string>();
  const storage = {
    getItem: (key: string) => Promise.resolve(saved.get(key) ?? null),
    setItem: (key: string, value: string) => {
      saved.set(key, value);
      return Promise.resolve();
    },
  };
  const data = { type: "new_device", eventId: randomUUID() };
  const first = createPushDeduplicator(storage);
  expect(
    await Promise.all([first.shouldShow(data), first.shouldShow(data), first.shouldShow(data)]),
  ).toEqual([true, false, false]);
  expect(await createPushDeduplicator(storage).shouldShow(data)).toBe(false);
  expect(await first.shouldShow({ type: "new_device", eventId: randomUUID() })).toBe(true);
  expect(await first.shouldShow({ type: "new_device" })).toBe(true);
});

test("bozuk kimlik gösterilmez; kalıcı kayıt başarısızsa tekrar bildirimi gösterilmez", async () => {
  const dedup = createPushDeduplicator({
    getItem: () => Promise.resolve(null),
    setItem: () => Promise.reject(new Error("Depo kapalı")),
  });
  expect(await dedup.shouldShow({ type: "new_device", eventId: "bozuk" })).toBe(false);
  expect(await dedup.shouldShow({ type: "new_device", eventId: randomUUID() })).toBe(false);
});
