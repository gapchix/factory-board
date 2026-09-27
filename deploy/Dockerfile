# The hosted copy: a static export, built clean on Linux, served by nginx.
#
# Built on Linux on purpose. A Windows `next build` names the segment prefetch
# files with a backslash, and every link prefetch 404s (ROADMAP, K).
#
#   docker compose -f deploy/compose.yml up -d --build
#
# The recipe book arrives as a build secret, from a file kept on the server and
# never committed (ADR 38): it ends up in the export, which serves it anyway,
# but not in the repository or in any image layer's history.

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/planner/package.json packages/planner/
COPY packages/game-data/package.json packages/game-data/
COPY packages/save-reader/package.json packages/save-reader/
COPY packages/layout/package.json packages/layout/
RUN npm ci --no-audit --no-fund

COPY . .

# The demo base, never the maintainer's save (AGENTS: a hosted build is built clean).
ENV FACTORY_BOARD_DEMO=1
ENV NEXT_TELEMETRY_DISABLED=1
# The build shares a box with a live trading bot. BuildKit ignores
# `docker build --memory`, so the cap is on Node's heap instead.
ENV NODE_OPTIONS=--max-old-space-size=1536

ARG NEXT_PUBLIC_SITE_URL=https://factory-board.gapchix.io
ARG FACTORY_BOARD_UMAMI_ID=
ARG FACTORY_BOARD_DONATE_URL=
ENV NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    FACTORY_BOARD_UMAMI_ID=$FACTORY_BOARD_UMAMI_ID \
    FACTORY_BOARD_DONATE_URL=$FACTORY_BOARD_DONATE_URL

RUN --mount=type=secret,id=book,required=true \
    FACTORY_BOARD_BOOK=/run/secrets/book npm run build

FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/out /usr/share/nginx/html
