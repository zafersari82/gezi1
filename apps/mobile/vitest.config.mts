import { defineConfig } from "vitest/config";

// Yalnızca telefona ve tarayıcıya bağlı olmayan mantık (köprü, biçimlendirme, sohbet listesi) sınanır.
// Expo paketi ES modülü olarak işaretlenmediği için dosya uzantısı .mts'dir.
export default defineConfig({
  // `@/` kısayolu tsconfig.json'daki `paths` ayarından okunur.
  resolve: { tsconfigPaths: true },
  test: {
    include: ["test/**/*.test.ts"],
  },
});
