import type { FastifyInstance } from "fastify";

import type { Config } from "./core/config";
import type { AdminGuard, AdminKeyGuard, Guard } from "./core/http";
import { adminRoutes } from "./modules/admin/admin.routes";
import { adminAccountRoutes } from "./modules/admin-accounts/admin-accounts.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { bookingRoutes } from "./modules/booking/booking.routes";
import { branchOperationsRoutes } from "./modules/business-management/branch-operations.routes";
import { businessAccessRoutes } from "./modules/business-management/business-access.routes";
import { businessManagementRoutes } from "./modules/business-management/business-management.routes";
import { kitchenDeviceRoutes } from "./modules/business-management/kitchen-devices.routes";
import { businessRoutes } from "./modules/businesses/businesses.routes";
import { capabilityRoutes } from "./modules/capabilities/capabilities.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { channelRoutes } from "./modules/channels/channels.routes";
import { businessChatRoutes } from "./modules/chat/business-chat.routes";
import { chatRoutes } from "./modules/chat/chat.routes";
import { contactRoutes } from "./modules/contacts/contacts.routes";
import { deliveryRoutes } from "./modules/delivery/delivery.routes";
import { discoveryRoutes } from "./modules/discovery/discovery.routes";
import { feedbackRoutes } from "./modules/feedback/feedback.routes";
import { incentiveRoutes } from "./modules/incentives/incentives.routes";
import { locationRoutes } from "./modules/location/location.routes";
import { mediaRoutes } from "./modules/media/media.routes";
import { miniAppAdminRoutes } from "./modules/miniapps/miniapp-admin.routes";
import { miniAppDeliveryRoutes } from "./modules/miniapps/miniapp-delivery.routes";
import { miniAppRoutes } from "./modules/miniapps/miniapps.routes";
import { momentRoutes } from "./modules/moments/moments.routes";
import { notificationRoutes } from "./modules/notifications/notifications.routes";
import { orderingRoutes } from "./modules/ordering/ordering.routes";
import { packageRoutes } from "./modules/packages/packages.routes";
import { paymentRoutes } from "./modules/payments/payments.routes";
import { qrRoutes } from "./modules/qr/qr.routes";
import { reportRoutes } from "./modules/reports/reports.routes";
import { restaurantRoutes } from "./modules/restaurant/restaurant.routes";
import { returnRoutes } from "./modules/returns/returns.routes";
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
  feedbackRoutes(server, context);
  locationRoutes(server, context);
  incentiveRoutes(server, context);
  authRoutes(server, context);
  userRoutes(server, context);
  notificationRoutes(server, context);
  contactRoutes(server, context);
  chatRoutes(server, context);
  businessChatRoutes(server, context);
  channelRoutes(server, context);
  momentRoutes(server, context);
  mediaRoutes(server, context);
  qrRoutes(server, context);
  businessRoutes(server, context);
  discoveryRoutes(server, context);
  businessManagementRoutes(server, context);
  businessAccessRoutes(server, context);
  branchOperationsRoutes(server, context);
  catalogRoutes(server, context);
  capabilityRoutes(server, context);
  orderingRoutes(server, context);
  bookingRoutes(server, context);
  returnRoutes(server, context);
  deliveryRoutes(server, context);
  courierRoutes(server, context);
  restaurantRoutes(server, context);
  kitchenDeviceRoutes(server, context);
  miniAppRoutes(server, context);
  miniAppDeliveryRoutes(server, context);
  paymentRoutes(server, context);
  reportRoutes(server, context);
  adminAccountRoutes(server, context);
  adminRoutes(server, context);
  miniAppAdminRoutes(server, context);
  packageRoutes(server, context);
}
import { courierRoutes } from "./modules/delivery/courier.routes";
