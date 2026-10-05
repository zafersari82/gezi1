import type { FastifyBaseLogger } from "fastify";

import type { PackageStore } from "../providers/package-store";
import type { PushProvider } from "../providers/push";
import type { SmsProvider } from "../providers/sms";
import type { StorageProvider } from "../providers/storage";
import type { RealtimePublisher } from "../realtime/realtime";
import type { Config } from "./config";
import type { Database } from "./database";
import type { AppKeys } from "./keys";

/** Servislerin günlüğe kayıt düşmek için kullandığı arayüz. */
export type Logger = Pick<FastifyBaseLogger, "info" | "warn" | "error">;

/** Servislerin ihtiyaç duyduğu ortak bağımlılıklar. Uygulama başlarken bir kez kurulur. */
export interface AppContext {
  config: Config;
  db: Database;
  log: Logger;
  keys: AppKeys;
  storage: StorageProvider;
  /** Paket dosyalarının durduğu içerik adresli depo. */
  packageStore: PackageStore;
  sms: SmsProvider;
  /** Anlık bildirimleri telefona ulaştıran sağlayıcı. */
  push: PushProvider;
  realtime: RealtimePublisher;
}
