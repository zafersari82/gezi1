import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  // Paket, VADO'da uygulama kaydına özel bir klasörün altından sunulur; dosyalar birbirine göreli
  // adreslerle bağlanır.
  base: "./",
  plugins: [react()],
  server: {
    // Telefonla denerken aynı ağdaki cihazların erişebilmesi için tüm arayüzlerden dinler.
    host: true,
    port: 5173,
    strictPort: true,
  },
});
