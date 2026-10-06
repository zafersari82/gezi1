# VADO API imajı. Derleme bağlamı depo köküdür:
#   docker build -f apps/api/Dockerfile -t vado-api .

FROM node:22-bookworm-slim AS base
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

# Derleme: çalışma alanı kodu (@vado/contracts) tek dosyaya gömülür.
FROM base AS build
RUN npm ci --workspace @vado/api --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/api apps/api
RUN npm run build --workspace @vado/api

# Çalışma zamanı bağımlılıkları: yalnızca API'nin npm paketleri.
FROM base AS dependencies
RUN npm ci --omit=dev --workspace @vado/api && mkdir -p apps/api/node_modules

FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /repo/apps/api
COPY --from=dependencies /repo/node_modules /repo/node_modules
COPY --from=dependencies /repo/apps/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
COPY apps/api/migrations ./migrations
COPY apps/api/package.json ./
# Yüklenen fotoğraflar `storage`, mini uygulama paketleri `package-store` klasörüne yazılır;
# ikisi de kalıcı bir birime bağlanmalıdır.
RUN mkdir -p storage package-store && chown node:node storage package-store
VOLUME /repo/apps/api/storage
VOLUME /repo/apps/api/package-store
USER node
EXPOSE 4000
# Sağlık denetimi, PORT değiştirilmişse de API'nin dinlediği porta bakar.
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 4000) + '/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "dist/main.js"]
