# VADO Control (yönetim paneli) imajı. Derleme bağlamı depo köküdür:
#   docker build -f apps/portal/Dockerfile -t vado-portal .

FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
# npm, kilit dosyasını doğrulayabilmek için tüm çalışma alanı paketlerinin tanımını ister.
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/miniapp-sdk/package.json packages/miniapp-sdk/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/portal/package.json apps/portal/
COPY apps/business/package.json apps/business/
COPY miniapps/appointment/package.json miniapps/appointment/
COPY miniapps/restaurant/package.json miniapps/restaurant/
RUN npm ci --workspace @vado/portal --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/portal apps/portal
RUN npm run build --workspace @vado/portal

# Next.js'in bağımsız (standalone) çıktısı gereken node_modules dosyalarını kendi içinde taşır.
FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/portal/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/portal/.next/static ./apps/portal/.next/static
USER node
EXPOSE 3000
# Sağlık denetimi, PORT değiştirilmişse de panelin dinlediği porta bakar.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3000) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/portal/server.js"]
