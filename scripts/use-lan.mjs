/**
 * Gerçek telefonla denemek için geliştirme ortamını bilgisayarın ağ adresine çevirir: `npm run lan`.
 *
 * Telefon, bilgisayardaki servislere "localhost" ile ulaşamaz. Bu betik API'nin kendi adresini
 * (fotoğraf ve mini uygulama paketi bağlantıları bununla kurulur) ve mini uygulama geliştirme
 * sunucusunun adresini bilgisayarın yerel ağ adresiyle değiştirir. Mobil uygulama API adresini
 * Expo'dan kendisi öğrenir; ona ayar gerekmez.
 *
 *   npm run lan                  ağ adresini kendisi bulur
 *   npm run lan -- 192.168.1.20  adresi elle verir
 *   npm run lan -- --off         ayarları geri alır (yeniden localhost)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { isIPv4 } from "node:net";
import { networkInterfaces } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ENV_FILE = fileURLToPath(new URL("../apps/api/.env", import.meta.url));

const API_PORT = 4000;
const MINI_APP_PORT = 5173;
const WEB_PREVIEW_PORT = 8081;
const LOCAL_ORIGINS = [
  `http://localhost:${WEB_PREVIEW_PORT}`,
  "http://localhost:3000",
  `http://localhost:${MINI_APP_PORT}`,
];
const MANAGED_KEYS = ["VADO_PUBLIC_URL", "VADO_SEED_MINIAPP_URL", "VADO_CORS_ORIGINS"];

/** Ev ve ofis ağlarında kullanılan özel adres aralıkları. */
const PRIVATE_RANGE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

function lanAddresses() {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === "IPv4" && !address.internal)
    .map((address) => address.address);
  // Sanal ağ bağdaştırıcıları (VPN, Docker) yerine önce gerçek yerel ağ adresleri denenir.
  return addresses.sort((a, b) => Number(PRIVATE_RANGE.test(b)) - Number(PRIVATE_RANGE.test(a)));
}

/** .env dosyasında verilen anahtarları günceller veya siler; diğer satırlara dokunmaz. */
async function updateEnvFile(entries) {
  const current = existsSync(ENV_FILE) ? await readFile(ENV_FILE, "utf8") : "";
  const kept = current
    .split("\n")
    .filter((line) => !MANAGED_KEYS.some((key) => line.startsWith(`${key}=`)));
  while (kept.at(-1) === "") kept.pop();

  const added = Object.entries(entries).map(([key, value]) => `${key}=${value}`);
  const lines = [...kept, ...added];
  // İçinde ayar kalmayan dosya bırakılmaz.
  if (lines.length === 0) await rm(ENV_FILE, { force: true });
  else await writeFile(ENV_FILE, `${lines.join("\n")}\n`);
}

/** Örnek veriyi yeniden yükler: geliştirme kaydı yeni adresle güncellenir. */
function seed() {
  // Windows'ta npm bir .cmd dosyası olduğu için komut kabuk üzerinden çalıştırılır.
  const result = spawnSync("npm run db:seed", { cwd: ROOT, stdio: "inherit", shell: true });
  return result.status === 0;
}

const argument = process.argv[2];
const turningOff = argument === "--off";

if (turningOff) {
  await updateEnvFile({});
  console.log("Ağ ayarları kaldırıldı; servisler yeniden localhost adresini kullanacak.");
} else {
  const candidates = lanAddresses();
  const address = argument ?? candidates[0];
  if (address === undefined || !isIPv4(address)) {
    console.error(
      argument === undefined
        ? "Ağ adresi bulunamadı. Bilgisayarın Wi-Fi'a bağlı olduğundan emin ol ya da adresi elle ver: npm run lan -- 192.168.1.20"
        : `Geçerli bir IPv4 adresi değil: ${argument}`,
    );
    process.exit(1);
  }

  const origin = (port) => `http://${address}:${port}`;
  await updateEnvFile({
    VADO_PUBLIC_URL: origin(API_PORT),
    VADO_SEED_MINIAPP_URL: origin(MINI_APP_PORT),
    VADO_CORS_ORIGINS: [...LOCAL_ORIGINS, origin(WEB_PREVIEW_PORT), origin(MINI_APP_PORT)].join(
      ",",
    ),
  });
  console.log(`Ağ adresi: ${address}`);
  if (argument === undefined && candidates.length > 1) {
    console.log(`Başka adresler de bulundu: ${candidates.slice(1).join(", ")}`);
    console.log("Telefon bağlanamazsa doğru adresi elle ver: npm run lan -- <adres>");
  }
}

console.log("\nÖrnek veri yeni adresle güncelleniyor…");
if (!seed()) {
  console.error(
    "\nÖrnek veri güncellenemedi. Veritabanının çalıştığını kontrol et (npm run db:up), sonra `npm run db:seed` çalıştır.",
  );
  process.exit(1);
}
if (turningOff) {
  console.log("\nHazır. Çalışan API'yi yeniden başlat (npm run dev).");
} else {
  console.log(
    "\nHazır. Çalışan API'yi yeniden başlat (npm run dev), ardından `npm run mobile` ile",
  );
  console.log("açılan QR kodu telefondaki Expo Go uygulamasıyla okut. Telefon ve bilgisayar aynı");
  console.log("Wi-Fi ağında olmalı.");
}
