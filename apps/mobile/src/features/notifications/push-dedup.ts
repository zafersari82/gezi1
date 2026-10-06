import { pushDataSchema } from "@vado/contracts";
import { z } from "zod";

interface PushStorage {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
}

const STORAGE_KEY = "vado.push.events";
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_EVENTS = 2048;
const savedSchema = z.array(z.object({ id: z.uuid(), at: z.number() }));

/** Yedi günlük son 2048 olay kalıcıdır; eş zamanlı bildirimler aynı kuyruğu kullanır. */
export function createPushDeduplicator(storage: PushStorage) {
  let tail: Promise<unknown> = Promise.resolve();
  function shouldShow(data: unknown): Promise<boolean> {
    const result = tail
      .then(async () => {
        const parsed = pushDataSchema.safeParse(data);
        if (!parsed.success) return false;
        const id = parsed.data.eventId;
        if (id === undefined) return true;
        const raw = await storage.getItem(STORAGE_KEY);
        const saved = savedSchema.safeParse(raw === null ? [] : (JSON.parse(raw) as unknown));
        const now = Date.now();
        const entries = saved.success
          ? saved.data.filter((entry) => entry.at > now - RETENTION_MS)
          : [];
        if (entries.some((entry) => entry.id === id)) return false;
        await storage.setItem(
          STORAGE_KEY,
          JSON.stringify([...entries, { id, at: now }].slice(-MAX_EVENTS)),
        );
        return true;
      })
      .catch(() => false);
    tail = result;
    return result;
  }
  return { shouldShow };
}
