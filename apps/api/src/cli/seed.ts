import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import {
  compareVersions,
  PACKAGE_MANIFEST_FILE,
  type PackageVersionStatus,
  TERMS_VERSION,
} from "@vado/contracts";

import { ADMIN_ACTOR } from "../core/audit";
import { loadConfig, loadEnvFile } from "../core/config";
import type { AppContext } from "../core/context";
import { createDatabase, type Database, sql } from "../core/database";
import { StartupError } from "../core/errors";
import { createAppKeys } from "../core/keys";
import { migrate } from "../core/migrator";
import { writeZip, type ZipEntry } from "../core/zip";
import { readPackageDirectory } from "../modules/packages/package-directory";
import { inspectPackage } from "../modules/packages/package-inspection";
import { createLocalPackageStore } from "../providers/package-store";
import { createLocalStorage } from "../providers/storage";
import { createServices } from "../services";

/**
 * Geliştirme için örnek veri yükler: `npm run db:seed`.
 * Dört kullanıcı, sohbetler, bir grup, paylaşımlar, onaylı bir işletme ve örnek mini uygulama.
 * Örnek kullanıcılarla giriş: 0555 000 00 01 … 04, doğrulama kodu 000000.
 *
 * Örnek mini uygulama (Randevu) derlenmiş klasöründen paketlenir, yüklenir, onaylanır ve iki
 * işletmenin uygulama kaydında ayrı ayarlarla yayınlanır: aynı paket, iki ayrı vitrin. Üçüncü bir
 * kayıt, paketi geliştirme sunucusundan (`npm run dev`) açar; kod değiştikçe yenilenir.
 *
 * Betik yeniden çalıştırılabilir: kullanıcılar ve içerik yalnızca ilk seferde eklenir. Örnek
 * paketin içeriği değiştiyse yeni bir sürüm olarak yüklenir ve kayıtlarda yayınlanır. Telefonla
 * denerken geliştirme sunucusunun adresi `VADO_SEED_MINIAPP_URL` ile bilgisayarın ağ adresine
 * çevrilir (bkz. `npm run lan`).
 */
const USAGE = "Kullanım: npm run db:seed (ya da: npm run seed -w @vado/api -- --package <klasör>)";
const PACKAGE_ID = "randevu";
const MERCHANT_ID = "kadikoy-berber";
const DEFAULT_MINI_APP_URL = "http://localhost:5173";
const DEVELOPMENT_RECORD_ID = "randevu-gelistirme";
const CAPABILITIES = [
  "identity.basic",
  "payment.request",
  "storage.local",
  "share.native",
] as const;

/** Aynı paketi yayınlayan uygulama kayıtları: her işletmenin kendi adı, satıcısı ve hizmetleri. */
const RECORDS = [
  {
    id: "randevu",
    name: "Kadıköy Berber",
    description: "Saç, sakal ve bakım randevunu birkaç dokunuşla al.",
    merchantId: MERCHANT_ID,
    services: "berber",
    sortOrder: 1,
  },
  {
    id: "elit-guzellik",
    name: "Elit Güzellik Salonu",
    description: "Manikür, cilt bakımı ve fön için randevunu birkaç dokunuşla al.",
    merchantId: "elit-guzellik",
    services: "guzellik",
    sortOrder: 2,
  },
] as const;

/** Yeniden yüklenebilecek, henüz karara bağlanmamış ya da onaylı durumlar. */
const USABLE_STATUSES: PackageVersionStatus[] = ["draft", "in_review", "approved"];

const PEOPLE = [
  { key: "ayse", name: "Ayşe Yılmaz", phone: "+905550000001", bio: "Kahve ve kitap meraklısı" },
  { key: "mehmet", name: "Mehmet Demir", phone: "+905550000002", bio: "Kadıköy Berber'in sahibi" },
  { key: "zeynep", name: "Zeynep Kaya", phone: "+905550000003", bio: "Tasarımcı" },
  { key: "can", name: "Can Öztürk", phone: "+905550000004", bio: "" },
] as const;

type PersonKey = (typeof PEOPLE)[number]["key"];

async function createPeople(db: Database): Promise<Record<PersonKey, string>> {
  const ids = {} as Record<PersonKey, string>;
  for (const person of PEOPLE) {
    const row = await db.one<{ id: string }>(sql`
      insert into users (phone, display_name, username, bio, terms_version, terms_accepted_at)
      values (${person.phone}, ${person.name}, ${person.key}, ${person.bio}, ${TERMS_VERSION}, now())
      returning id
    `);
    ids[person.key] = row.id;
  }
  return ids;
}

/** Örnek kullanıcıları, sohbetleri, paylaşımları ve işletmeyi ekler. */
async function seedContent(context: AppContext): Promise<void> {
  const { admin, businesses, chat, contacts, moments } = createServices(context);
  const user = await createPeople(context.db);

  const befriend = async (from: string, to: string) => {
    const request = await contacts.sendRequest(from, to, "");
    if (request.requestId !== null) await contacts.acceptRequest(to, request.requestId);
  };
  await befriend(user.ayse, user.mehmet);
  await befriend(user.ayse, user.zeynep);
  await befriend(user.mehmet, user.zeynep);
  await befriend(user.mehmet, user.can);
  await contacts.sendRequest(user.can, user.ayse, "Merhaba Ayşe, ben Can. Mehmet'in arkadaşıyım.");

  const say = (senderId: string, conversationId: string, body: string) =>
    chat.sendMessage(senderId, conversationId, { kind: "text", clientId: randomUUID(), body });

  const direct = await chat.openDirect(user.ayse, user.mehmet);
  await say(user.mehmet, direct.id, "Selam Ayşe, cumartesi için randevun duruyor mu?");
  await say(user.ayse, direct.id, "Duruyor, 13:00'te oradayım.");
  await say(user.mehmet, direct.id, "Süper. VADO Randevu'dan saatini değiştirebilirsin.");

  const group = await chat.createGroup(user.ayse, {
    title: "Hafta Sonu Planı",
    memberIds: [user.mehmet, user.zeynep],
  });
  await say(user.zeynep, group.id, "Pazar günü Moda'da kahvaltı yapalım mı?");
  await say(user.mehmet, group.id, "Bana uyar, 10:30 gibi?");
  await say(user.ayse, group.id, "Tamam, ben masayı ayırtırım.");

  const walk = await moments.create(user.mehmet, "Moda sahilinde sabah yürüyüşü. Hava harika!", []);
  await moments.setLiked(user.ayse, walk.id, true);
  await moments.addComment(user.zeynep, walk.id, "Bir dahakine beni de çağır.");
  const coffee = await moments.create(
    user.zeynep,
    "Yeni açılan kahveciyi denedik, çok beğendik.",
    [],
  );
  await moments.setLiked(user.mehmet, coffee.id, true);

  const business = await businesses.create(user.mehmet, {
    name: "Kadıköy Berber",
    slug: MERCHANT_ID,
    category: "beauty",
    description: "Saç, sakal ve bakım. Randevunu VADO üzerinden al.",
    city: "İstanbul",
  });
  await admin.updateBusiness(ADMIN_ACTOR, business.id, { verified: true, status: "active" });
}

/** Paketin dosyalarını, bildirim dosyasındaki sürüm numarası değiştirilmiş olarak döndürür. */
function withVersion(entries: readonly ZipEntry[], version: string): ZipEntry[] {
  return entries.map((entry) => {
    if (entry.path !== PACKAGE_MANIFEST_FILE) return entry;
    const manifest = JSON.parse(entry.data.toString("utf8")) as Record<string, unknown>;
    return {
      ...entry,
      data: Buffer.from(`${JSON.stringify({ ...manifest, version }, null, 2)}\n`),
    };
  });
}

function nextPatch(version: string): string {
  const [major, minor, patch] = version.split(".").map(Number);
  return `${major ?? 0}.${minor ?? 0}.${(patch ?? 0) + 1}`;
}

/**
 * Örnek paketin onaylı bir sürümünün bulunmasını sağlar ve sürüm numarasını döndürür. Klasörün
 * içeriği son yüklenen sürümle aynıysa o sürüm kullanılır; değiştiyse sıradaki sürüm numarasıyla
 * yeniden yüklenir, çünkü yüklenmiş bir sürümün içeriği değiştirilemez.
 */
async function ensureApprovedVersion(context: AppContext, directory: string): Promise<string> {
  const { packages } = createServices(context);
  const rules = { maxArchiveBytes: context.config.packageMaxBytes, allowInsecureNetwork: true };
  const { entries } = await readPackageDirectory(directory).catch(() => {
    throw new StartupError(
      `Örnek paketin klasörü okunamadı: ${directory}\n` +
        "Önce örnek mini uygulamayı derleyin: npm run build -w @vado/miniapp-appointment",
    );
  });
  const built = inspectPackage(writeZip(entries), rules);
  if (built.manifest.id !== PACKAGE_ID) {
    throw new StartupError(`Klasördeki paket "${PACKAGE_ID}" değil: ${built.manifest.id}`);
  }

  await packages.save(ADMIN_ACTOR, PACKAGE_ID, {
    name: built.manifest.name,
    developerName: "VADO",
  });
  const [latest] = (await packages.get(PACKAGE_ID)).versions;
  let version = built.manifest.version;
  let upload: ZipEntry[] | null = entries;

  if (latest !== undefined) {
    const retagged = inspectPackage(writeZip(withVersion(entries, latest.version)), rules);
    const unchanged = [built.digest, retagged.digest].includes(latest.digest);
    if (unchanged && USABLE_STATUSES.includes(latest.status)) {
      version = latest.version;
      upload = null;
    } else if (compareVersions(version, latest.version) <= 0) {
      version = nextPatch(latest.version);
      upload = withVersion(entries, version);
    }
  }

  if (upload !== null) await packages.upload(ADMIN_ACTOR, PACKAGE_ID, writeZip(upload));
  const { status } = await packages.getVersion(PACKAGE_ID, version);
  if (status === "draft") await packages.submit(ADMIN_ACTOR, PACKAGE_ID, version);
  if (status !== "approved") {
    await packages.approve(
      ADMIN_ACTOR,
      PACKAGE_ID,
      version,
      "Örnek veri: kendiliğinden onaylandı.",
    );
  }
  return version;
}

/** Örnek paketi yükler ve işletmelerin uygulama kayıtlarında, her birinin kendi ayarıyla yayınlar. */
async function seedPackagedMiniApps(context: AppContext, directory: string): Promise<string> {
  const { miniAppAdmin } = createServices(context);
  const version = await ensureApprovedVersion(context, directory);
  const business = await context.db.maybeOne<{ id: string }>(sql`
    select id from businesses where slug = ${MERCHANT_ID}
  `);

  for (const record of RECORDS) {
    await miniAppAdmin.save(ADMIN_ACTOR, record.id, {
      name: record.name,
      description: record.description,
      category: "beauty",
      developerName: "VADO",
      sortOrder: record.sortOrder,
    });
    await miniAppAdmin.saveMerchant(ADMIN_ACTOR, record.id, record.merchantId, {
      displayName: record.name,
      businessId: record.merchantId === MERCHANT_ID ? (business?.id ?? null) : null,
    });
    await miniAppAdmin.publish(ADMIN_ACTOR, record.id, {
      packageId: PACKAGE_ID,
      version,
      config: {
        businessName: record.name,
        merchantId: record.merchantId,
        services: record.services,
      },
    });
    await miniAppAdmin.update(ADMIN_ACTOR, record.id, { verified: true });
  }
  return version;
}

/** Paketi geliştirme sunucusundan açan kaydı yazar; yalnızca geliştirme kipinde kullanılabilir. */
async function seedDevelopmentRecord(context: AppContext, url: string): Promise<void> {
  const { miniAppAdmin } = createServices(context);
  await miniAppAdmin.save(ADMIN_ACTOR, DEVELOPMENT_RECORD_ID, {
    name: "Randevu (geliştirme)",
    description:
      "Geliştirme sunucusundan açılır; kod değiştikçe yenilenir. Önce npm run dev çalışmalı.",
    iconUrl: new URL("/icon.png", url).href,
    category: "beauty",
    developerName: "VADO",
    sortOrder: 90,
    development: {
      entryUrl: url,
      allowedOrigins: [url],
      capabilities: [...CAPABILITIES],
      version: "0.0.0",
    },
  });
  await miniAppAdmin.saveConfig(ADMIN_ACTOR, DEVELOPMENT_RECORD_ID, {
    businessName: "Geliştirme Berberi",
    merchantId: MERCHANT_ID,
    services: "berber",
  });
  // Adres değiştiğinde doğrulama sıfırlanır; örnek kayıt yeniden doğrulanmış sayılır.
  await miniAppAdmin.update(ADMIN_ACTOR, DEVELOPMENT_RECORD_ID, { verified: true });
  await miniAppAdmin.saveMerchant(ADMIN_ACTOR, DEVELOPMENT_RECORD_ID, MERCHANT_ID, {
    displayName: "Kadıköy Berber",
    businessId: null,
  });
}

/** `--package <klasör>` seçeneğini okur; yol, komutun yazıldığı klasöre göredir. */
function packageDirectory(args: readonly string[]): string {
  const index = args.indexOf("--package");
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value.startsWith("--")) throw new StartupError(USAGE);
  return resolve(process.env.INIT_CWD ?? process.cwd(), value);
}

async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig();
  if (config.env === "production") {
    throw new StartupError("Örnek veri canlı ortama yüklenemez.");
  }
  const directory = packageDirectory(process.argv.slice(2));
  const miniAppUrl = process.env.VADO_SEED_MINIAPP_URL ?? DEFAULT_MINI_APP_URL;
  if (!URL.canParse(miniAppUrl)) {
    throw new StartupError(`VADO_SEED_MINIAPP_URL geçerli bir adres değil: ${miniAppUrl}`);
  }
  await migrate(config.databaseUrl);

  const db = createDatabase(config.databaseUrl, 2);
  try {
    const context: AppContext = {
      config,
      db,
      // Betik yalnızca kendi çıktısını yazar; servislerin günlük kayıtları gösterilmez.
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      keys: createAppKeys(config.keys),
      storage: await createLocalStorage(config.storageDir, config.publicUrl),
      packageStore: await createLocalPackageStore(config.packageDir),
      sms: { sendOtp: () => Promise.resolve() },
      // Betik çalışırken bağlı istemci yoktur; bildirimler gönderilmez.
      realtime: { emit: () => undefined, disconnectSession: () => undefined },
    };

    const seeded = await db.maybeOne(sql`select 1 from users where phone = ${PEOPLE[0].phone}`);
    if (seeded === null) {
      await seedContent(context);
      console.log("Örnek kullanıcılar ve içerik yüklendi.");
    } else {
      console.log("Örnek kullanıcılar zaten yüklü; içerik değiştirilmedi.");
    }

    const version = await seedPackagedMiniApps(context, directory);
    const names = RECORDS.map((record) => record.name).join(", ");
    console.log(`Örnek paket ${PACKAGE_ID} ${version} yayında: ${names}.`);
    if (config.miniAppDevMode) {
      await seedDevelopmentRecord(context, miniAppUrl);
      console.log(`Geliştirme kaydının adresi: ${miniAppUrl}`);
    }
    console.log("Giriş için: 0555 000 00 01 (Ayşe) … 0555 000 00 04 (Can), kod 000000");
  } finally {
    await db.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof StartupError ? error.message : error);
  process.exit(1);
});
