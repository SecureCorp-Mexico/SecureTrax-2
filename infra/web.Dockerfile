# Build the Vite SPA and serve it with nginx.
FROM node:20-alpine AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app
COPY pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/core/package.json packages/core/
COPY packages/module-contracts/package.json packages/module-contracts/
RUN pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @securetrax/module-contracts build \
 && pnpm --filter @securetrax/core build \
 && pnpm --filter @securetrax/web build

FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY infra/nginx/web.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
