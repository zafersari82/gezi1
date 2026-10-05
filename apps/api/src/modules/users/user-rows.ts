import type { Me, UserRef, UserStatus } from "@vado/contracts";

import { type Database, sql } from "../../core/database";
import type { StorageProvider } from "../../providers/storage";

const UNNAMED_USER = "VADO Kullanıcısı";
/** Silinmiş hesapların, eski mesajlarda ve sohbet listesinde görünen adı. */
export const DELETED_USER = "Silinmiş Hesap";

/** `user_refs` görünümünden okunan satır. */
export interface UserRefRow {
  id: string;
  display_name: string | null;
  status: UserStatus;
  avatar_key: string | null;
}

/** Başkalarına gösterilecek ad: silinmiş ve henüz ad girmemiş hesaplar için sabit metin kullanılır. */
export function displayNameOf(row: Pick<UserRefRow, "display_name" | "status">): string {
  if (row.status === "deleted") return DELETED_USER;
  return row.display_name ?? UNNAMED_USER;
}

export function toUserRef(row: UserRefRow, storage: StorageProvider): UserRef {
  return {
    id: row.id,
    displayName: displayNameOf(row),
    avatarUrl: row.avatar_key === null ? null : storage.publicUrl(row.avatar_key),
  };
}

interface MeRow {
  id: string;
  phone: string | null;
  display_name: string | null;
  username: string | null;
  bio: string;
  avatar_key: string | null;
  discoverable_by_phone: boolean;
  created_at: Date;
}

/** Oturum sahibinin kendi hesabını okur. Kullanıcı yoksa `null` döner. */
export async function findMe(
  db: Database,
  storage: StorageProvider,
  userId: string,
): Promise<Me | null> {
  const row = await db.maybeOne<MeRow>(sql`
    select
      u.id,
      u.phone,
      u.display_name,
      u.username,
      u.bio,
      m.storage_key as avatar_key,
      u.discoverable_by_phone,
      u.created_at
    from users u
    left join media m on m.id = u.avatar_media_id
    where u.id = ${userId} and u.status <> 'deleted'
  `);
  if (row === null) return null;

  return {
    id: row.id,
    phone: row.phone ?? "",
    displayName: row.display_name,
    username: row.username,
    bio: row.bio,
    avatarUrl: row.avatar_key === null ? null : storage.publicUrl(row.avatar_key),
    discoverableByPhone: row.discoverable_by_phone,
    createdAt: row.created_at.toISOString(),
  };
}
