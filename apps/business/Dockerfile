# VADO Business imajı; derleme bağlamı depo köküdür.
FROM node:22-bookworm-slim AS build
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages/contracts/package.json packages/contracts/
COPY packages/miniapp-sdk/package.json packages/miniapp-sdk/
COPY apps/api/package.json apps/api/
COPY apps/mobile/package.json apps/mobile/
COPY apps/portal/package.json apps/portal/
COPY apps/business/package.json apps/business/
COPY miniapps/appointment/package.json miniapps/appointment/
COPY miniapps/restaurant/package.json miniapps/restaurant/
RUN npm ci --workspace @vado/business --include-workspace-root
COPY tsconfig.base.json ./
COPY packages/contracts packages/contracts
COPY apps/business apps/business
RUN npm run build --workspace @vado/business

FROM node:22-bookworm-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/business/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/business/.next/static ./apps/business/.next/static
COPY --from=build --chown=node:node /repo/apps/business/public ./apps/business/public
USER node
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 3001) + '/healthz').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
CMD ["node", "apps/business/server.js"]
