import { createBusinessOrderConsumer } from "./core/business-order-live";
import type { AppContext } from "./core/context";
import { createLiveReplayService } from "./core/live-replay";
import { orderingAuditConsumer } from "./core/ordering-audit";
import { createOrderingLifecycle } from "./core/ordering-lifecycle";
import { createOutboxWorker } from "./core/outbox-worker";
import { createTenantMaintenance } from "./core/tenant-maintenance";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminAccountService } from "./modules/admin-accounts/admin-accounts.service";
import { createAuthService } from "./modules/auth/auth.service";
import { createBookingService } from "./modules/booking/booking.service";
import { createBranchOperationsService } from "./modules/business-management/branch-operations.service";
import { createBusinessAccessService } from "./modules/business-management/business-access.service";
import { createBusinessManagementService } from "./modules/business-management/business-management.service";
import { createBusinessSocketService } from "./modules/business-management/business-socket.service";
import { createOperationDeviceService } from "./modules/business-management/operation-devices.service";
import { createStorefrontContext } from "./modules/business-management/storefront-context";
import { createBusinessService } from "./modules/businesses/businesses.service";
import {
  deviceMaySetStatus,
  orderDecisionRequired,
  permitOrderTransition,
} from "./modules/capabilities/capabilities.registry";
import { createCapabilityService } from "./modules/capabilities/capabilities.service";
import { createCatalogService } from "./modules/catalog/catalog.service";
import { createChannelService } from "./modules/channels/channels.service";
import { createBusinessChatService } from "./modules/chat/business-chat.service";
import { createChatService } from "./modules/chat/chat.service";
import { createContactService } from "./modules/contacts/contacts.service";
import { createDeliveryService } from "./modules/delivery/delivery.service";
import { createDeliveryAvailabilityReader } from "./modules/discovery/delivery-availability.reader";
import { createDiscoveryService } from "./modules/discovery/discovery.service";
import { createFeedbackService } from "./modules/feedback/feedback.service";
import { createIncentiveService } from "./modules/incentives/incentives.service";
import { createLocationService } from "./modules/location/location.service";
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
import {
  createOrderPushConsumer,
  createRestaurantLiveConsumer,
} from "./modules/restaurant/restaurant-live";
import { tableSessionLabels } from "./modules/restaurant/table-session-labels";
import { createReturnService } from "./modules/returns/returns.service";
import { createUserService } from "./modules/users/users.service";
import { createCourierLiveConsumer } from "./providers/delivery/courier-live";
import { createOwnCourierProvider } from "./providers/delivery/own-courier";
import { createSignedWebhookConsumer } from "./providers/webhook";

/** Tüm servisleri bağımlılık sırasına göre kurar. */
export function createServices(context: AppContext) {
  const notifications = createNotificationService(context);
  const events = createOutboxWorker({
    platformDb: context.platformDb,
    log: context.log,
    consumers: [
      orderingAuditConsumer,
      createCourierLiveConsumer(context),
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
  const businessChat = createBusinessChatService(context, { notifications });
  const users = createUserService(context, { auth, chat });
  const contacts = createContactService(context);
  const moments = createMomentService(context);
  const businesses = createBusinessService(context);
  const businessManagement = createBusinessManagementService(context);
  const catalog = createCatalogService(context);
  const capabilities = createCapabilityService(context);
  const orderingLifecycle = createOrderingLifecycle();
  const incentives = createIncentiveService(context, orderingLifecycle);
  const courier = createOwnCourierProvider(context, orderingLifecycle);
  const ordering = createOrderingService(
    context,
    catalog,
    {
      permitTransition: permitOrderTransition,
      deviceMaySetStatus,
      decisionRequired: orderDecisionRequired,
    },
    { table_session: tableSessionLabels },
    orderingLifecycle,
    incentives.pricing,
  );
  const returns = createReturnService(context, ordering, orderingLifecycle);
  const miniApps = createMiniAppService(context);
  const miniAppAdmin = createMiniAppAdminService(context);
  const packages = createPackageService(context, { miniAppAdmin });
  const qr = createQrService(context, { users, businesses, miniApps, miniAppAdmin });
  const payments = createPaymentService(context);
  const reports = createReportService(context);
  const admin = createAdminService(context, auth);
  const adminAccounts = createAdminAccountService(context);

  return {
    feedback: createFeedbackService(context),
    incentives,
    courier,
    orderingLifecycle,
    delivery: createDeliveryService(context),
    location: createLocationService(context),
    notifications,
    tenantMaintenance: createTenantMaintenance(context.platformDb),
    events,
    auth,
    media,
    chat,
    businessChat,
    channels: createChannelService(context),
    users,
    contacts,
    moments,
    businesses,
    discovery: createDiscoveryService(
      context,
      createDeliveryAvailabilityReader(context.platformDb),
    ),
    businessManagement,
    businessAccess: createBusinessAccessService(context),
    branchOperations: createBranchOperationsService(context),
    liveReplay: createLiveReplayService(context),
    operationDevices: createOperationDeviceService(context),
    businessSockets: createBusinessSocketService(context),
    catalog,
    ordering,
    booking: createBookingService(context),
    returns,
    capabilities,
    miniApps,
    miniAppAdmin,
    packages,
    qr,
    restaurant: createRestaurantService(context, qr),
    storefrontContext: createStorefrontContext(context),
    payments,
    reports,
    admin,
    adminAccounts,
  };
}

export type Services = ReturnType<typeof createServices>;
