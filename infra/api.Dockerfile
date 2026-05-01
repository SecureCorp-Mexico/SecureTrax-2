# Multi-stage Node 20 build for the SecureTrax-2 NestJS API.
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY packages/core/package.json packages/core/
COPY packages/module-contracts/package.json packages/module-contracts/
COPY modules/tracking-traccar/package.json modules/tracking-traccar/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @securetrax/module-contracts build \
 && pnpm --filter @securetrax/core build \
 && pnpm --filter @securetrax/module-tracking-traccar build \
 && pnpm --filter @securetrax/api build

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
COPY --from=build /app/packages ./packages
COPY --from=build /app/modules ./modules
EXPOSE 3000
CMD ["node", "apps/api/dist/main.js"]
