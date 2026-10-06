import { createBusinessOrderConsumer } from "./core/business-order-live";
import type { AppContext } from "./core/context";
import { createLiveReplayService } from "./core/live-replay";
import { orderingAuditConsumer } from "./core/ordering-audit";
import { createOutboxWorker } from "./core/outbox-worker";
import { createOrderPushConsumer, createRestaurantLiveConsumer } from "./core/restaurant-live";
import { createTenantMaintenance } from "./core/tenant-maintenance";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminAccountService } from "./modules/admin-accounts/admin-accounts.service";
import { createAuthService } from "./modules/auth/auth.service";
import { createBranchOperationsService } from "./modules/business-management/branch-operations.service";
import { createBusinessManagementService } from "./modules/business-management/business-management.service";
import { createBusinessSocketService } from "./modules/business-management/business-socket.service";
import { createKitchenDeviceService } from "./modules/business-management/kitchen-devices.service";
import { createBusinessService } from "./modules/businesses/businesses.service";
import { permitOrderTransition } from "./modules/capabilities/capabilities.registry";
import { createCapabilityService } from "./modules/capabilities/capabilities.service";
import { createCatalogService } from "./modules/catalog/catalog.service";
import { createChatService } from "./modules/chat/chat.service";
import { createContactService } from "./modules/contacts/contacts.service";
import { createMediaService } from "./modules/media/media.service";
import { createMiniAppAdminService } from "./modules/miniapps/miniapp-admin.service";
import { createMiniAppService } from "./modules/miniapps/miniapps.service";
import { createMomentService } from "./modules/moments/moments.service";
import { createNotificationService } from "./modules/notifications/notifications.service";
import { createOrderingService } from "./modules/ordering/ordering.service";
import { createPackageService } from "./modules/packages/packages.service";
import { createPaymentService } from "./modules/payments/payments.service";
import { createQrService } from "./modules/qr/qr.service";
import { createReportService } from "./modules/reports/reports.service";
import { createRestaurantService } from "./modules/restaurant/restaurant.service";
import { createUserService } from "./modules/users/users.service";
import { createSignedWebhookConsumer } from "./providers/webhook";

/** Tüm servisleri bağımlılık sırasına göre kurar. */
export function createServices(context: AppContext) {
  const notifications = createNotificationService(context);
  const events = createOutboxWorker({
    platformDb: context.platformDb,
    log: context.log,
    consumers: [
      orderingAuditConsumer,
      createBusinessOrderConsumer(context.platformDb, context.realtime),
      notifications.consumer,
      createRestaurantLiveConsumer(context),
      createOrderPushConsumer(context),
      ...context.config.orderWebhooks.map(createSignedWebhookConsumer),
    ],
  });
  const auth = createAuthService(context, { notifications });
  const media = createMediaService(context);
  const chat = createChatService(context, { notifications });
  const users = createUserService(context, { auth, chat });
  const contacts = createContactService(context);
  const moments = createMomentService(context);
  const businesses = createBusinessService(context);
  const businessManagement = createBusinessManagementService(context);
  const catalog = createCatalogService(context);
  const capabilities = createCapabilityService(context);
  const ordering = createOrderingService(context, catalog, permitOrderTransition);
  const miniApps = createMiniAppService(context);
  const miniAppAdmin = createMiniAppAdminService(context);
  const packages = createPackageService(context, { miniAppAdmin });
  const qr = createQrService(context, { users, businesses, miniApps, miniAppAdmin });
  const payments = createPaymentService(context);
  const reports = createReportService(context);
  const admin = createAdminService(context, auth);
  const adminAccounts = createAdminAccountService(context);

  return {
    notifications,
    tenantMaintenance: createTenantMaintenance(context.platformDb),
    events,
    auth,
    media,
    chat,
    users,
    contacts,
    moments,
    businesses,
    businessManagement,
    branchOperations: createBranchOperationsService(context),
    liveReplay: createLiveReplayService(context),
    kitchenDevices: createKitchenDeviceService(context),
    businessSockets: createBusinessSocketService(context),
    catalog,
    ordering,
    capabilities,
    miniApps,
    miniAppAdmin,
    packages,
    qr,
    restaurant: createRestaurantService(context, qr),
    payments,
    reports,
    admin,
    adminAccounts,
  };
}

export type Services = ReturnType<typeof createServices>;
