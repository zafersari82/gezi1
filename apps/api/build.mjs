import { cp, readFile, rm } from "node:fs/promises";

import { build } from "esbuild";

/**
 * API'yi canlı ortam için derler.
 * Çalışma alanı paketleri (@vado/*) çıktıya gömülür; npm bağımlılıkları dışarıda bırakılır
 * ve çalışma zamanında node_modules klasöründen yüklenir.
 */
const manifest = JSON.parse(await readFile(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(manifest.dependencies).filter((name) => !name.startsWith("@vado/"));

await rm(new URL("./dist", import.meta.url), { recursive: true, force: true });

await build({
  entryPoints: [
    "src/main.ts",
    "src/cli/migrate.ts",
    "src/cli/import-location.ts",
    "src/cli/database-roles.ts",
    "src/cli/keys.ts",
    "src/cli/packages.ts",
    "src/cli/admins.ts",
  ],
  outdir: "dist",
  outbase: "src",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  external,
  logLevel: "info",
});

await cp(new URL("./data", import.meta.url), new URL("./dist/data", import.meta.url), {
  recursive: true,
});
