FROM node:20-bookworm-slim AS build

ENV CI=1
WORKDIR /workspace

RUN corepack enable && corepack prepare pnpm@10.33.2 --activate
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY patches ./patches
COPY packages/server/package.json ./packages/server/package.json
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm --filter @miaomiao-search/server deploy --prod --legacy /opt/miaomiao-search/api
RUN cp lzc/run-open-websearch.mjs /opt/miaomiao-search/api/run-open-websearch.mjs

FROM node:20-bookworm-slim

ENV NODE_ENV=production
ENV PLAYWRIGHT_PACKAGE=playwright-core
ENV PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /opt/miaomiao-search

COPY --from=build /workspace/.next/standalone ./web
COPY --from=build /workspace/.next/static ./web/.next/static
COPY --from=build /workspace/public ./web/public
COPY --from=build /opt/miaomiao-search/api ./api
COPY lzc/run-api.sh lzc/run-web.sh ./lzc/

RUN apt-get update \
  && apt-get install -y --no-install-recommends chromium \
  && rm -rf /var/lib/apt/lists/*

RUN chmod 755 /opt/miaomiao-search/lzc/run-api.sh /opt/miaomiao-search/lzc/run-web.sh

LABEL org.opencontainers.image.title="miaomiao-search" \
      org.opencontainers.image.description="Miaomiao Search web portal, API, and Open-WebSearch daemon"
