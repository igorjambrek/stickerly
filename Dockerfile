# Build the frontend, then ship it alongside the API in one small image.
# No Chromium anywhere: PDFs are drawn with pdf-lib, which is what keeps this
# runnable on the cheapest VPS available.

# ---------------------------------------------------------------------------
# Runtime dependencies. better-sqlite3 has no prebuilt binary for this Node
# ABI, so it is compiled here and the result is copied forward — the runtime
# image never gets a compiler.
# ---------------------------------------------------------------------------
FROM node:24-slim AS deps
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Frontend build. Reuses the deps layer, then adds the dev dependencies.
# ---------------------------------------------------------------------------
FROM deps AS build
RUN npm ci
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime.
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/server ./apps/server
# The fonts are shared with the editor and are the only source of Cyrillic in
# the PDFs, so they must be in the image.
COPY assets ./assets
COPY --from=build /app/apps/web/dist ./apps/web/dist

ENV DATA_DIR=/data PORT=3000 HOST=0.0.0.0
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "node_modules/tsx/dist/cli.mjs", "apps/server/src/index.ts"]
