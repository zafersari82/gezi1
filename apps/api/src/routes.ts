import type { FastifyInstance } from "fastify";

import type { Config } from "./core/config";
import type { AdminGuard, AdminKeyGuard, Guard } from "./core/http";
import { adminRoutes } from "./modules/admin/admin.routes";
import { adminAccountRoutes } from "./modules/admin-accounts/admin-accounts.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { businessRoutes } from "./modules/businesses/businesses.routes";
import { chatRoutes } from "./modules/chat/chat.routes";
import { contactRoutes } from "./modules/contacts/contacts.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { miniAppAdminRoutes } from "./modules/miniapps/miniapp-admin.routes";
import { miniAppDeliveryRoutes } from "./modules/miniapps/miniapp-delivery.routes";
import { miniAppRoutes } from "./modules/miniapps/miniapps.routes";
import { momentRoutes } from "./modules/moments/moments.routes";
import { notificationRoutes } from "./modules/notifications/notifications.routes";
import { packageRoutes } from "./modules/packages/packages.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { qrRoutes } from "./modules/qr/qr.routes";
import { reportRoutes } from "./modules/reports/reports.routes";
import { userRoutes } from "./modules/users/users.routes";
import type { Services } from "./services";

/** Rota dosyalarının ortak bağımlılıkları. */
export interface RouteContext {
  config: Config;
  services: Services;
  guard: Guard;
  /** Oturumu doğrular ve kimliğin yakın zamanda kanıtlanmış olmasını şart koşar (hassas işlemler). */
  verifiedGuard: Guard;
  /** Yönetim uçlarını korur: yönetici anahtarını, panel oturumunu ve ucun bildirdiği izni doğrular. */
  adminGuard: AdminGuard;
  /** Oturum gerektirmeyen giriş ucunu korur: yalnızca yönetici anahtarını doğrular. */
  adminKeyGuard: AdminKeyGuard;
}

/**
 * Tüm uç noktaları kaydeder. Her rota aynı sırayı izler:
 * oturumu doğrula, girdiyi sözleşme şemasıyla çözümle, servisi çağır, sonucu döndür.
 */
export function registerRoutes(server: FastifyInstance, context: RouteContext): void {
  authRoutes(server, context);
  userRoutes(server, context);
  notificationRoutes(server, context);
  contactRoutes(server, context);
  chatRoutes(server, context);
  momentRoutes(server, context);
  mediaRoutes(server, context);
  qrRoutes(server, context);
  businessRoutes(server, context);
  miniAppRoutes(server, context);
  miniAppDeliveryRoutes(server, context);
  paymentRoutes(server, context);
  reportRoutes(server, context);
  adminAccountRoutes(server, context);
  adminRoutes(server, context);
  miniAppAdminRoutes(server, context);
  packageRoutes(server, context);
}
