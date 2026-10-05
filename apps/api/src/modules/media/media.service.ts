import { randomUUID } from "node:crypto";

import { type Media, MEDIA_MAX_BYTES, type MediaContentType } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { StorageProvider } from "../../providers/storage";

interface ImageFormat {
  contentType: MediaContentType;
  extension: string;
  matches: (data: Buffer) => boolean;
}

const startsWith = (data: Buffer, bytes: number[], offset = 0) =>
  bytes.every((byte, index) => data[offset + index] === byte);

/** Dosya türü, istemcinin beyanına değil içeriğin ilk baytlarına bakılarak belirlenir. */
const IMAGE_FORMATS: ImageFormat[] = [
  {
    contentType: "image/jpeg",
    extension: "jpg",
    matches: (data) => startsWith(data, [0xff, 0xd8, 0xff]),
  },
  {
    contentType: "image/png",
    extension: "png",
    matches: (data) => startsWith(data, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  },
  {
    contentType: "image/webp",
    extension: "webp",
    matches: (data) =>
      startsWith(data, [0x52, 0x49, 0x46, 0x46]) && startsWith(data, [0x57, 0x45, 0x42, 0x50], 8),
  },
];

/** Verilen medya kayıtlarının tamamı kullanıcıya ait değilse `media_not_found` fırlatır. */
export async function requireOwnedMedia(
  db: Database,
  userId: string,
  mediaIds: readonly string[],
): Promise<void> {
  if (mediaIds.length === 0) return;
  const unique = [...new Set(mediaIds)];
  const { count } = await db.one<{ count: number }>(sql`
    select count(*) as count from media
    where owner_id = ${userId} and id = any(${unique}::uuid[])
  `);
  if (count !== unique.length) throw new AppError("media_not_found");
}

/**
 * Kullanıcının artık hiçbir mesajda, paylaşımda veya profilde kullanılmayan görsellerinin kaydını
 * siler ve depodan kaldırılacak dosyaların anahtarlarını döndürür. Dosyalar, veritabanı işlemi
 * tamamlandıktan sonra `removeFiles` ile silinir; böylece geri alınan bir işlem dosya kaybettirmez.
 *
 * @param only Yalnızca bu görsellere bakılır; verilmezse kullanıcının tüm görsellerine bakılır.
 */
export async function deleteUnusedMedia(
  db: Database,
  ownerId: string,
  only?: readonly string[],
): Promise<string[]> {
  const rows = await db.many<{ storage_key: string }>(sql`
    delete from media md
    where md.owner_id = ${ownerId}
      ${only === undefined ? sql.empty : sql`and md.id = any(${only}::uuid[])`}
      and not exists (select 1 from messages m where m.media_id = md.id)
      and not exists (select 1 from moment_media mm where mm.media_id = md.id)
      and not exists (select 1 from users u where u.avatar_media_id = md.id)
    returning md.storage_key
  `);
  return rows.map((row) => row.storage_key);
}

export async function removeFiles(
  storage: StorageProvider,
  keys: readonly string[],
): Promise<void> {
  await Promise.all(keys.map((key) => storage.remove(key)));
}

export function createMediaService({ db, storage }: AppContext) {
  async function upload(userId: string, data: Buffer): Promise<Media> {
    if (data.length > MEDIA_MAX_BYTES) throw new AppError("media_too_large");
    const format = IMAGE_FORMATS.find((candidate) => candidate.matches(data));
    if (format === undefined) throw new AppError("media_invalid");

    const id = randomUUID();
    const storageKey = `${id}.${format.extension}`;
    await storage.put(storageKey, data);
    await db.execute(sql`
      insert into media (id, owner_id, content_type, byte_size, storage_key)
      values (${id}, ${userId}, ${format.contentType}, ${data.length}, ${storageKey})
    `);

    return {
      id,
      url: storage.publicUrl(storageKey),
      contentType: format.contentType,
      byteSize: data.length,
    };
  }

  return { upload };
}

export type MediaService = ReturnType<typeof createMediaService>;
