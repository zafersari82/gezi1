import {
  type IssuedQr,
  type IssueQrBody,
  QR_PREFIX,
  type QrParams,
  qrParamsSchema,
  type QrTarget,
} from "@vado/contracts";
import { z } from "zod";

import { recordAudit } from "../../core/audit";
import type { AppContext } from "../../core/context";
import { AppError } from "../../core/errors";
import type { BusinessService } from "../businesses/businesses.service";
import type { MiniAppAdminService } from "../miniapps/miniapp-admin.service";
import type { MiniAppService } from "../miniapps/miniapps.service";
import type { UserService } from "../users/users.service";

/**
 * QR kodun içinde taşınan veri. `exp` saniye cinsinden bitiş zamanıdır; `null` ise süresizdir.
 * `p`, panelden mini uygulama koduna yazılan parametrelerdir (2.5); yoksa alan hiç yazılmaz, böylece
 * parametresiz kodlar önceki sürümlerin ürettiğiyle aynı kalır.
 */
const payloadSchema = z.object({
  t: z.enum(["user", "business", "miniapp"]),
  id: z.string().min(1).max(64),
  exp: z.number().int().nullable(),
  p: qrParamsSchema.optional(),
});
type Payload = z.infer<typeof payloadSchema>;

const nowInSeconds = () => Math.floor(Date.now() / 1000);

export function createQrService(
  { config, db, keys, log }: AppContext,
  services: {
    users: UserService;
    businesses: BusinessService;
    miniApps: MiniAppService;
    miniAppAdmin: MiniAppAdminService;
  },
) {
  const { users, businesses, miniApps, miniAppAdmin } = services;

  function encode(payload: Payload): IssuedQr {
    const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return {
      value: `${QR_PREFIX}${data}.${keys.qr.sign(data)}`,
      expiresAt: payload.exp === null ? null : new Date(payload.exp * 1000).toISOString(),
    };
  }

  function decode(value: string): Payload {
    if (!value.startsWith(QR_PREFIX)) throw new AppError("qr_invalid");
    // Veriden sonraki bölüm imzadır: güncel kodlarda `<anahtar kimliği>.<imza>`, 2.1 ve öncesinde
    // üretilmiş kodlarda yalnızca `<imza>`.
    const body = value.slice(QR_PREFIX.length);
    const separator = body.indexOf(".");
    if (separator === -1) throw new AppError("qr_invalid");
    const data = body.slice(0, separator);
    const verified = keys.qr.verify(data, body.slice(separator + 1));
    if (verified === null) throw new AppError("qr_invalid");

    let json: unknown;
    try {
      json = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    } catch {
      throw new AppError("qr_invalid");
    }
    const payload = payloadSchema.safeParse(json);
    if (!payload.success) throw new AppError("qr_invalid");
    if (payload.data.exp !== null && payload.data.exp < nowInSeconds()) {
      throw new AppError("qr_expired");
    }
    // Eski bir anahtarı halkadan çıkarmadan önce, onunla imzalı kodların hâlâ okutulup
    // okutulmadığına bu kayıtlardan bakılır.
    if (!verified.current) {
      log.info(
        { keyId: verified.keyId, type: payload.data.t },
        "Eski anahtarla imzalı QR kod doğrulandı",
      );
    }
    return payload.data;
  }

  /**
   * İmzalı QR kod üretir. Kişisel kod yalnızca sahibi tarafından üretilir ve kısa ömürlüdür;
   * işletme kodu işletme sahibine, mini uygulama kodu herkese açıktır ve süresizdir.
   */
  async function issue(userId: string, body: IssueQrBody): Promise<IssuedQr> {
    if (body.type === "user") {
      return encode({ t: "user", id: userId, exp: nowInSeconds() + config.userQrTtlSeconds });
    }
    if (body.type === "business") {
      if (!(await businesses.isListedOwner(userId, body.id))) {
        throw new AppError("business_not_found");
      }
      return encode({ t: "business", id: body.id, exp: null });
    }
    await miniApps.get(body.id);
    return encode({ t: "miniapp", id: body.id, exp: null });
  }

  /**
   * Panelden, imzalı parametreli mini uygulama kodu üretir. Kayıt henüz yayında olmasa da kod
   * üretilebilir (basılı kodlar açılıştan önce hazırlanır); okutulduğunda kayıt açık değilse
   * kullanıcı "kod geçersiz" değil "şu anda açılamıyor" iletisini görür.
   */
  async function issueMiniAppQr(
    actor: string,
    miniAppId: string,
    params: QrParams,
  ): Promise<IssuedQr> {
    await miniAppAdmin.get(miniAppId);
    const hasParams = Object.keys(params).length > 0;
    const issued = encode({
      t: "miniapp",
      id: miniAppId,
      exp: null,
      ...(hasParams ? { p: params } : {}),
    });
    await recordAudit(db, {
      actor,
      action: "miniapp.qr_issued",
      targetType: "miniapp",
      targetId: miniAppId,
      metadata: { params },
    });
    return issued;
  }

  /** QR kodu doğrular ve gösterdiği kaydın güncel halini döndürür. */
  async function resolve(userId: string, value: string): Promise<QrTarget> {
    const payload = decode(value);

    if (payload.t === "user") {
      const user = await users.getProfile(userId, payload.id).catch((error: unknown) => {
        if (error instanceof AppError) throw new AppError("qr_target_unavailable");
        throw error;
      });
      return { type: "user", user };
    }
    if (payload.t === "business") {
      const business = await businesses.find(payload.id);
      if (business === null) throw new AppError("qr_target_unavailable");
      return { type: "business", business };
    }
    const miniApp = await miniApps.find(payload.id);
    if (miniApp === null) throw new AppError("qr_target_unavailable");
    return { type: "miniapp", miniApp, params: payload.p ?? {} };
  }

  return { issue, issueMiniAppQr, resolve };
}

export type QrService = ReturnType<typeof createQrService>;
