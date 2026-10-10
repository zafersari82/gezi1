import {
  businessMiniAppLaunchSchema,
  type CommerceMiniAppId,
  type DeliveryQuote,
  deliveryQuoteSchema,
} from "@vado/contracts";

import { api } from "@/api/client";
import { rememberLaunch } from "@/features/miniapps/launch-params";

/**
 * Keşif sonucu nihai teslimat izni değildir: yayınlanmış doğru uygulama ve
 * kullanıcının kendi kayıtlı adresi canlı teslimat teklifiyle yeniden doğrulanır.
 */
export async function prepareDeliveryStoreLaunch(
  businessId: string,
  branchId: string,
  addressId: string,
  miniAppId: CommerceMiniAppId,
): Promise<{ miniAppId: CommerceMiniAppId; launch: string; quote: DeliveryQuote }> {
  const context = businessMiniAppLaunchSchema.parse(
    await api.get<unknown>(`/v1/businesses/${businessId}/miniapps/${miniAppId}/launch`),
  );
  if (context.businessId !== businessId) throw new Error("İşletme eşleşmiyor.");
  const quote = deliveryQuoteSchema.parse(
    await api.post<unknown>(
      `/v1/shell/${context.businessId}/${context.appInstanceId}/delivery-quote`,
      { branchId, addressId },
    ),
  );
  if (quote.address.id !== addressId || quote.address.archived) {
    throw new Error("Teslimat adresi doğrulanamadı.");
  }
  return {
    miniAppId,
    quote,
    launch: rememberLaunch(
      miniAppId,
      {
        ...context,
        delivery_branch: branchId,
        delivery_address: addressId,
      },
      null,
      { type: "business", businessId: context.businessId },
    ),
  };
}
