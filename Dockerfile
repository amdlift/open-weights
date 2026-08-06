# syntax=docker/dockerfile:1.7
ARG NODE_VERSION=24

# ---------------------------------------------------------------------------
# deps — install every dependency and compile the native ones (better-sqlite3).
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
	&& rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---------------------------------------------------------------------------
# build — produce the adapter-node server bundle.
# ---------------------------------------------------------------------------
FROM deps AS build
COPY . .
RUN npm run build

# ---------------------------------------------------------------------------
# prod-deps — same compiled native modules, dev dependencies stripped out.
# ---------------------------------------------------------------------------
FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund

# ---------------------------------------------------------------------------
# runtime
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
	PORT=3000 \
	HOST=0.0.0.0 \
	DATABASE_PATH=/data/openweights.db \
	BODY_SIZE_LIMIT=2M

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --chown=root:root drizzle ./drizzle
COPY --chown=root:root docker/entrypoint.sh /usr/local/bin/entrypoint.sh
COPY package.json ./

# The named volume created for /data inherits this ownership, so the
# unprivileged runtime user can write the database without a chown at boot.
RUN chmod +x /usr/local/bin/entrypoint.sh \
	&& mkdir -p /data \
	&& chown -R node:node /data

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["node", "build/index.js"]

LABEL org.opencontainers.image.title="OpenWeights" \
	org.opencontainers.image.description="Self-hosted weightlifting, bodyweight and cardio tracker" \
	org.opencontainers.image.source="https://github.com/amdlift/open-weights" \
	org.opencontainers.image.licenses="MIT"
