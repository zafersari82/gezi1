import {
  type Category,
  IDENTITY_TOKEN_TTL_SECONDS,
  type IdentityKeySet,
  type MiniApp,
  type MiniAppDetail,
  type MiniAppIdentity,
  type MiniAppIdentityToken,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { PackageStoreError } from "../../providers/package-store";
import { toUserRef, type UserRefRow } from "../users/user-rows";
import {
  createMiniAppMapper,
  MINI_APP_COLUMNS,
  miniAppLive,
  type MiniAppRow,
} from "./miniapp-rows";

/** Yayındaki bir paket dosyası ve paketin bağlanabileceği adresler. */
export interface PackageFileDelivery {
  data: Buffer;
  sha256: string;
  contentType: string;
  network: string[];
  /** Dosya paketin giriş belgesi mi? Pakette betik çalıştırabilen tek belge odur. */
  entry: boolean;
}

/** Sarmalayıcı belgenin üretilmesi için gerekenler. */
export interface WrapperDelivery {
  name: string;
  /** Paketin giriş belgesinin paket içindeki yolu. */
  entry: string;
}

export function createMiniAppService({ config, db, keys, log, storage, packageStore }: AppContext) {
  const live = miniAppLive(config.miniAppDevMode);
  const mapper = createMiniAppMapper(config);

  async function list(category?: Category): Promise<MiniApp[]> {
    const rows = await db.many<MiniAppRow>(sql`
      select ${MINI_APP_COLUMNS}
      from mini_app_runtime a
      where ${live}
        ${category === undefined ? sql.empty : sql`and a.category = ${category}`}
      order by a.sort_order, a.name
    `);
    return rows.map(mapper.toMiniApp);
  }

  function findRow(miniAppId: string): Promise<MiniAppRow | null> {
    return db.maybeOne<MiniAppRow>(sql`
      select ${MINI_APP_COLUMNS}
      from mini_app_runtime a
      where a.id = ${miniAppId} and ${live}
    `);
  }

  /** Yayındaki mini uygulamayı okur; yoksa veya yayında değilse `null` döner. */
  async function find(miniAppId: string): Promise<MiniApp | null> {
    const row = await findRow(miniAppId);
    return row === null ? null : mapper.toMiniApp(row);
  }

  /** Kabuğun mini uygulamayı açarken okuduğu kayıt: işletmenin ayarlarını da taşır. */
  async function get(miniAppId: string): Promise<MiniAppDetail> {
    const row = await findRow(miniAppId);
    if (row === null) throw new AppError("miniapp_not_found");
    return mapper.toMiniAppDetail(row);
  }

  /**
   * Kullanıcının mini uygulamaya verilecek kimliğini üretir. `openId`, kullanıcı ve uygulama
   * kaydı çiftine özgüdür; gerçek kullanıcı kimliği ve telefon numarası mini uygulamaya verilmez.
   */
  async function identity(userId: string, miniAppId: string): Promise<MiniAppIdentity> {
    const miniApp = await get(miniAppId);
    if (!miniApp.capabilities.includes("identity.basic")) throw new AppError("forbidden");

    const user = await db.one<UserRefRow>(sql`
      select id, display_name, status, avatar_key from user_refs where id = ${userId}
    `);
    const { displayName, avatarUrl } = toUserRef(user, storage);
    return {
      openId: keys.openId(miniAppId, userId),
      displayName,
      avatarUrl,
    };
  }

  /**
   * Mini uygulamanın kendi sunucusuna göndereceği kimlik belirtecini imzalar. Koşullar kimlik
   * bilgisiyle aynıdır: kayıt kullanıcılara açık olmalı ve `identity.basic` yetkisini istemiş
   * olmalıdır. Belirteç yalnızca takma kimliği (`sub`) ve kaydı (`aud`) taşır; ad ve fotoğraf yoktur.
   */
  async function identityToken(userId: string, miniAppId: string): Promise<MiniAppIdentityToken> {
    const miniApp = await get(miniAppId);
    if (!miniApp.capabilities.includes("identity.basic")) throw new AppError("forbidden");
    const signed = keys.identity.sign({
      issuer: config.publicUrl,
      audience: miniAppId,
      subject: keys.openId(miniAppId, userId),
      ttlSeconds: IDENTITY_TOKEN_TTL_SECONDS,
    });
    return { token: signed.token, expiresAt: signed.expiresAt.toISOString() };
  }

  /** Kimlik belirteçlerini doğrulayan açık anahtarlar; herkese açıktır. */
  function identityKeys(): IdentityKeySet {
    return { keys: keys.identity.publicKeys() };
  }

  /**
   * Uygulama kaydının sarmalayıcı belgesi için kaydın adını ve paketin giriş belgesini okur.
   * Kayıt kullanıcılara kapalıysa ya da özet yayındaki sürümün özeti değilse `null` döner.
   */
  async function openWrapper(miniAppId: string, digest: string): Promise<WrapperDelivery | null> {
    const row = await db.maybeOne<{ name: string; package_entry: string }>(sql`
      select a.name, a.package_entry
      from mini_app_runtime a
      where a.id = ${miniAppId} and ${live} and a.package_digest = ${digest}
    `);
    return row === null ? null : { name: row.name, entry: row.package_entry };
  }

  /**
   * Uygulama kaydının yayındaki paketinden bir dosya okur. Kayıt kullanıcılara kapalıysa, özet
   * yayındaki sürümün özeti değilse ya da dosya pakette yoksa `null` döner: geri çekilen ya da
   * geri alınan bir sürümün dosyaları artık sunulmaz.
   */
  async function openPackageFile(
    miniAppId: string,
    digest: string,
    path: string,
  ): Promise<PackageFileDelivery | null> {
    const file = await db.maybeOne<{
      sha256: string;
      content_type: string;
      network: string[];
      entry: boolean;
    }>(sql`
      select f.sha256, f.content_type, a.network, f.path = a.package_entry as entry
      from mini_app_runtime a
      join package_files f on f.package_id = a.package_id and f.version = a.package_version
      where a.id = ${miniAppId} and ${live} and a.package_digest = ${digest} and f.path = ${path}
    `);
    if (file === null) return null;

    try {
      const data = await packageStore.read(file.sha256);
      const { sha256, content_type: contentType, network, entry } = file;
      return { data, sha256, contentType, network, entry };
    } catch (error) {
      if (!(error instanceof PackageStoreError)) throw error;
      log.error(
        { miniAppId, digest, path, sha256: file.sha256, reason: error.reason },
        "Paket dosyası depoda yok ya da bozulmuş; dosya sunulmadı",
      );
      throw new AppError("package_integrity_failed");
    }
  }

  return { list, find, get, identity, identityToken, identityKeys, openWrapper, openPackageFile };
}

export type MiniAppService = ReturnType<typeof createMiniAppService>;
