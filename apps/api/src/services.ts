import type { AppContext } from "./core/context";
import { createAdminService } from "./modules/admin/admin.service";
import { createAdminAccountService } from "./modules/admin-accounts/admin-accounts.service";
import { createAuthService } from "./modules/auth/auth.service";
import { createBusinessService } from "./modules/businesses/businesses.service";
import { createChatService } from "./modules/chat/chat.service";
import { createContactService } from "./modules/contacts/contacts.service";
import { createMediaService } from "./modules/media/media.service";
import { createMiniAppAdminService } from "./modules/miniapps/miniapp-admin.service";
import { createMiniAppService } from "./modules/miniapps/miniapps.service";
import { createMomentService } from "./modules/moments/moments.service";
import { createPackageService } from "./modules/packages/packages.service";
import { createPaymentService } from "./modules/payments/payments.service";
import { createQrService } from "./modules/qr/qr.service";
import { createReportService } from "./modules/reports/reports.service";
import { createUserService } from "./modules/users/users.service";

/** Tüm servisleri bağımlılık sırasına göre kurar. */
export function createServices(context: AppContext) {
  const auth = createAuthService(context);
  const media = createMediaService(context);
  const chat = createChatService(context);
  const users = createUserService(context, { auth, chat });
  const contacts = createContactService(context);
  const moments = createMomentService(context);
  const businesses = createBusinessService(context);
  const miniApps = createMiniAppService(context);
  const miniAppAdmin = createMiniAppAdminService(context);
  const packages = createPackageService(context, { miniAppAdmin });
  const qr = createQrService(context, { users, businesses, miniApps });
  const payments = createPaymentService(context);
  const reports = createReportService(context);
  const admin = createAdminService(context, auth);
  const adminAccounts = createAdminAccountService(context);

  return {
    auth,
    media,
    chat,
    users,
    contacts,
    moments,
    businesses,
    miniApps,
    miniAppAdmin,
    packages,
    qr,
    payments,
    reports,
    admin,
    adminAccounts,
  };
}

export type Services = ReturnType<typeof createServices>;
