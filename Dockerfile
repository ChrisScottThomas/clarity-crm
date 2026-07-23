# syntax=docker/dockerfile:1

# The provider is a BUILD INPUT, not a runtime choice. Next inlines the
# generated Prisma client — schema text included — into .next/server/chunks at
# build time, so one image serves exactly one provider. Regenerating at boot was
# tried and proven useless:
# docs/superpowers/spikes/2026-07-23-phase-3-docker-spike.md (R1)
ARG DB_PROVIDER=sqlite

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# A self-contained tooling tree: just the prisma CLI and tsx, which the
# entrypoint's `db push` needs and the traced standalone bundle lacks. Versions
# come from the lockfile, never a floating range — an unresolvable `npx prisma`
# once silently fetched 7.9.0 against a 7.8.0 baked client.
FROM node:22-slim AS tooling
WORKDIR /opt/tooling
COPY package-lock.json /tmp/package-lock.json
RUN PRISMA_V="$(node -p "require('/tmp/package-lock.json').packages['node_modules/prisma'].version")" \
 && TSX_V="$(node -p "require('/tmp/package-lock.json').packages['node_modules/tsx'].version")" \
 && npm init -y > /dev/null \
 && npm install --omit=dev "prisma@${PRISMA_V}" "tsx@${TSX_V}"

FROM node:22-slim AS builder
ARG DB_PROVIDER
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# A dummy URL of the correct scheme. next build instantiates PrismaClient during
# page-data collection, so DATABASE_URL must be set — but it never connects, so
# the URL can and must be unreachable: a real one would bake credentials into
# image history. Port 1 is closed by definition.
RUN case "$DB_PROVIDER" in \
      sqlite)   echo 'file:./data/build.db' > /tmp/build-url ;; \
      postgres) echo 'postgres://build:build@127.0.0.1:1/build' > /tmp/build-url ;; \
      *) echo "FATAL: DB_PROVIDER must be sqlite or postgres, got '$DB_PROVIDER'" >&2; exit 1 ;; \
    esac
RUN DATABASE_URL="$(cat /tmp/build-url)" npm run db:generate
RUN DATABASE_URL="$(cat /tmp/build-url)" npx next build

FROM node:22-slim AS runner
ARG DB_PROVIDER
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
# Read by docker-entrypoint.sh to reject a mismatched DATABASE_URL at boot.
ENV CLARITY_DB_PROVIDER=${DB_PROVIDER}
# npm's update-notifier prints a "New major version of npm available!" banner
# into the boot log. CI dumps container logs on a failed boot smoke, and that is
# precisely when the reader needs signal rather than noise.
ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Without this every Prisma invocation warns it cannot detect libssl.
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*

# ORDER IS LOAD-BEARING. The tooling tree goes down first so the traced
# standalone tree lands on top and wins every filename conflict; reversed, the
# CLI's transitive react-dom and next overwrite the app's own.
# It must also merge INTO ./node_modules rather than sit beside it: `npx`
# ignores PATH, and prisma.config.ts's `import "dotenv/config"` resolves from
# /app. Both were observed failures, not hypotheticals.
COPY --from=tooling --chown=node:node /opt/tooling/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder --chown=node:node /app/scripts ./scripts
COPY --from=builder --chown=node:node /app/lib ./lib
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --chown=node:node docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Every COPY above sets ownership inline, deliberately. A `RUN chown -R` over
# /app rewrites every file's metadata and so writes a second complete copy into
# the layer — measured at 819 MB, turning a 1.13 GB image into 1.95 GB. Only the
# small, initially-empty data directory is chowned here.
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/data \
 && chown node:node /app/data

USER node
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
