FROM node:22-alpine AS base
WORKDIR /app
# libc6-compat : compat glibc ; python3/make/g++ : toolchain pour compiler les
# modules natifs (argon2) si aucun binaire prébuilt musl n'est disponible.
# Ce toolchain reste dans les étapes de build — l'image runner ne l'embarque pas.
RUN apk add --no-cache libc6-compat python3 make g++

# 1. Prune : ne garde que le sous-arbre de l'API (api + shared + database +
# connectors) avec un package-lock élagué. Exclut tout le frontend (next,
# posthog-js, @img…) qui n'a rien à faire dans l'image API.
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.5.4 prune @paybrain/api --docker

# 2. Install des dépendances du sous-arbre élagué (lockfile pruné → pas de deps frontend).
FROM base AS deps
COPY --from=pruner /app/out/json/ ./
RUN npm ci

# 3. Build des 4 packages + génération du client Prisma.
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=pruner /app/out/full/ ./
# tsconfig.base.json (racine) est hérité par les tsconfig des packages mais n'est
# pas inclus par `turbo prune` — on le copie depuis le contexte de build.
COPY tsconfig.base.json ./tsconfig.base.json
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build --workspace @paybrain/shared \
  && npm run build --workspace @paybrain/database \
  && npm run build --workspace @paybrain/connectors \
  && npm run build --workspace @paybrain/api

# 4. Dépendances de production uniquement : on élague les devDeps (typescript,
# jest, @nestjs/cli…) de l'arbre déjà installé. argon2 (déjà compilé) et le
# client Prisma généré sont conservés ; le CLI prisma reste (passé en dependency)
# pour `migrate deploy` dans la tâche de migration.
FROM builder AS prod-deps
RUN npm prune --omit=dev && npm cache clean --force

# 5. Image de production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# CA bundle RDS pour TLS verify-full sur PostgreSQL (ALP-165).
# En prod, DATABASE_URL = ...?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca-bundle.pem
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-ca-bundle.pem
RUN chmod 644 /etc/ssl/rds-ca-bundle.pem

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
# node_modules ÉLAGUÉ (prod-deps, sans devDeps ni frontend) — image bien plus légère.
COPY --from=prod-deps --chown=nestjs:nodejs /app/node_modules ./node_modules
# npm workspaces sont des liens dans node_modules/@paybrain. Copier leurs
# artefacts garde ces liens valides dans l'image finale.
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/sql ./packages/database/sql
COPY --from=builder --chown=nestjs:nodejs /app/packages/connectors/package.json ./packages/connectors/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/connectors/dist ./packages/connectors/dist

USER nestjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main"]
