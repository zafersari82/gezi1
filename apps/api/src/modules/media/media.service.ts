import { randomUUID } from "node:crypto";

import { type Media, MEDIA_MAX_BYTES, type MediaContentType } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import type { StorageProvider } from "../../providers/storage";
import { processBusinessImage } from "./image-processing";

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
      and not exists (select 1 from business_media bm where bm.media_id = md.id)
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
  /** Mevcut depoya yükler; DB kaydı başarısızsa dosyayı temizler. */
  async function store(
    data: Buffer,
    persist: (media: Media, storageKey: string) => Promise<void>,
  ): Promise<Media> {
    if (data.length === 0 || data.length > MEDIA_MAX_BYTES) throw new AppError("media_too_large");
    const format = IMAGE_FORMATS.find((candidate) => candidate.matches(data));
    if (format === undefined) throw new AppError("media_invalid");
    const id = randomUUID();
    const storageKey = `${id}.${format.extension}`;
    const media = {
      id,
      url: storage.publicUrl(storageKey),
      contentType: format.contentType,
      byteSize: data.length,
    };
    await storage.put(storageKey, data);
    try {
      await persist(media, storageKey);
    } catch (error) {
      await storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
    return media;
  }

  function upload(userId: string, data: Buffer): Promise<Media> {
    return store(data, (media, storageKey) =>
      db
        .execute(
          sql`
      insert into media (id, owner_id, content_type, byte_size, storage_key)
      values (${media.id}, ${userId}, ${media.contentType}, ${media.byteSize}, ${storageKey})
    `,
        )
        .then(() => undefined),
    );
  }

  /**
   * Business row locks serialize simultaneous uploads for the same tenant. The
   * quota is checked against *encoded* bytes, not untrusted request size.
   */
  async function uploadBusiness(scope: TenantScope, data: Buffer): Promise<Media> {
    requireBusinessRole(scope, ["owner", "manager"]);
    if (data.length === 0 || data.length > MEDIA_MAX_BYTES) throw new AppError("media_too_large");
    const image = await processBusinessImage(data);
    const id = randomUUID();
    const storageKey = `${id}.webp`;
    const media: Media = {
      id,
      url: storage.publicUrl(storageKey),
      contentType: "image/webp",
      byteSize: image.length,
    };
    // Storage is written before the transaction; a failed quota/DB check removes it.
    await storage.put(storageKey, image);
    try {
      await withTenant(db, scope, async (tx) => {
        const business = await tx.one<{ media_quota_bytes: number }>(sql`
          select media_quota_bytes from businesses where id = ${scope.businessId} for update
        `);
        const used = await tx.one<{ bytes: number }>(sql`
          select coalesce(sum(m.byte_size), 0)::bigint as bytes
          from business_media bm join media m on m.id = bm.media_id
          where bm.business_id = ${scope.businessId}
        `);
        if (used.bytes + image.length > business.media_quota_bytes)
          throw new AppError("media_quota_exceeded");
        await tx.execute(sql`
          insert into media (id, owner_id, content_type, byte_size, storage_key)
          values (${media.id}, ${scope.userId}, ${media.contentType}, ${media.byteSize}, ${storageKey})
        `);
        await tx.execute(sql`
          insert into business_media (business_id, media_id, uploaded_by)
          values (${scope.businessId}, ${media.id}, ${scope.userId})
        `);
      });
    } catch (error) {
      await storage.remove(storageKey).catch(() => undefined);
      throw error;
    }
    return media;
  }

  /** Quota and usage are read from the same tenant-scoped business context. */
  function businessUsage(scope: TenantScope) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const row = await tx.one<{
        quota_bytes: number;
        used_bytes: number;
        image_count: number;
      }>(sql`
        select b.media_quota_bytes as quota_bytes,
          coalesce(sum(m.byte_size),0)::bigint as used_bytes,
          count(m.id)::int as image_count
        from businesses b
        left join business_media bm on bm.business_id=b.id
        left join media m on m.id=bm.media_id
        where b.id=${scope.businessId}
        group by b.id
      `);
      return {
        quotaBytes: row.quota_bytes,
        usedBytes: row.used_bytes,
        imageCount: row.image_count,
      };
    });
  }

  /**
   * Explicit maintenance operation. Grace period protects freshly uploaded
   * photos which the owner has not yet attached to a draft. Published images
   * are retained independently of their current draft references.
   */
  async function pruneBusiness(
    scope: TenantScope,
  ): Promise<{ removed: number; freedBytes: number; pendingRemoval: number }> {
    requireBusinessRole(scope, ["owner", "manager"]);
    const removed = await withTenant(db, scope, async (tx) => {
      await tx.one(sql`select id from businesses where id=${scope.businessId} for update`);
      const candidates = await tx.many<{
        media_id: string;
        storage_key: string;
        byte_size: number;
      }>(sql`
        select bm.media_id, m.storage_key, m.byte_size
        from business_media bm join media m on m.id=bm.media_id
        where bm.business_id=${scope.businessId}
          and bm.created_at < now() - interval '7 days'
          and not exists (
            select 1 from business_studio bs where bs.business_id=bm.business_id
            and (bs.logo_media_id=bm.media_id or bs.cover_media_id=bm.media_id
              or bs.published_design->>'logoMediaId'=bm.media_id::text
              or bs.published_design->>'coverMediaId'=bm.media_id::text)
          )
          and not exists (
            select 1 from catalog_items ci
            where ci.business_id=bm.business_id and ci.image_media_id=bm.media_id
          )
          and not exists (select 1 from messages msg where msg.media_id=bm.media_id)
          and not exists (select 1 from moment_media mm where mm.media_id=bm.media_id)
          and not exists (select 1 from users u where u.avatar_media_id=bm.media_id)
        order by bm.created_at, bm.media_id limit 100
      `);
      if (candidates.length === 0) return [];
      const ids = candidates.map((item) => item.media_id);
      await tx.execute(sql`
        delete from business_media where business_id=${scope.businessId}
        and media_id=any(${ids}::uuid[])
      `);
      const deleted = await tx.many<{ storage_key: string; byte_size: number }>(sql`
        delete from media where id=any(${ids}::uuid[])
        and not exists (select 1 from business_media bm where bm.media_id=media.id)
        returning storage_key, byte_size
      `);
      for (const file of deleted) {
        await tx.execute(sql`
          insert into business_media_deletions(storage_key,business_id)
          values (${file.storage_key},${scope.businessId})
          on conflict (storage_key) do nothing
        `);
      }
      return deleted;
    });
    // Remove only keys from the durable deletion queue. Failed deletes remain
    // queued for the next maintenance attempt, without blocking the UI.
    const pending = await withTenant(db, scope, (tx) =>
      tx.many<{ storage_key: string }>(sql`
      select storage_key from business_media_deletions
      where business_id=${scope.businessId}
      order by created_at, storage_key limit 100
    `),
    );
    let pendingRemoval = 0;
    for (const file of pending) {
      try {
        await storage.remove(file.storage_key);
        await withTenant(db, scope, (tx) =>
          tx.execute(sql`
          delete from business_media_deletions
          where business_id=${scope.businessId} and storage_key=${file.storage_key}
        `),
        );
      } catch {
        pendingRemoval += 1;
        await withTenant(db, scope, (tx) =>
          tx.execute(sql`
          update business_media_deletions set attempts=attempts+1
          where business_id=${scope.businessId} and storage_key=${file.storage_key}
        `),
        );
      }
    }
    return {
      removed: removed.length,
      freedBytes: removed.reduce((total, image) => total + image.byte_size, 0),
      pendingRemoval,
    };
  }

  return { upload, uploadBusiness, businessUsage, pruneBusiness };
}

export type MediaService = ReturnType<typeof createMediaService>;
