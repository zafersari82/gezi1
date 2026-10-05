import { createVado } from "./client";

export { createVado, type HostWindow, type Vado, VadoError } from "./client";
export type {
  BridgeErrorCode,
  ConfigValues,
  ContainerInfo,
  MiniAppContext,
  MiniAppIdentity,
  PaymentRequestParams,
  ShareParams,
} from "@vado/contracts";

/**
 * Mini uygulamaların kullandığı hazır istemci.
 *
 *   import { vado } from "@vado/miniapp-sdk";
 *
 *   const profile = await vado.identity.getProfile();
 *   const payment = await vado.payment.request({
 *     merchantId: "kadikoy-berber",
 *     orderId: "rnd-1042",
 *     description: "Saç kesimi",
 *     amountMinor: 65_000,
 *   });
 */
export const vado = createVado(typeof window === "undefined" ? undefined : window);
