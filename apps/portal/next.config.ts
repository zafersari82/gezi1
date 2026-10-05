import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

const PACKAGE_UPLOAD_LIMIT = "52mb";

const config: NextConfig = {
  // Paylaşılan sözleşme paketi derlenmeden, TypeScript kaynağı olarak tüketilir.
  transpilePackages: ["@vado/contracts"],
  // Docker imajı için yalnızca gereken dosyaları içeren bağımsız çıktı üretilir.
  output: "standalone",
  outputFileTracingRoot: fileURLToPath(new URL("../..", import.meta.url)),
  poweredByHeader: false,
  typedRoutes: true,
  // Next.js'in proje klasörüne yapay zekâ araçları için yönerge dosyaları yazmasını kapatır.
  agentRules: false,
  // Geliştirme göstergesi varsayılan yerinde (sol alt) kenar çubuğundaki durum yazılarını örter.
  devIndicators: { position: "bottom-right" },
  experimental: {
    // Mini uygulama paketleri panelden yüklenir. API en çok 50 MB'lık arşiv kabul edecek şekilde
    // ayarlanabilir (VADO_PACKAGE_MAX_MB); panel bu boyuttaki isteği ne giriş denetiminde ne de
    // sunucu işlevinde kesmemelidir. Asıl sınırı API uygular.
    proxyClientMaxBodySize: PACKAGE_UPLOAD_LIMIT,
    serverActions: { bodySizeLimit: PACKAGE_UPLOAD_LIMIT },
  },
};

export default config;
