FROM node:22-alpine AS base
WORKDIR /app
# libc6-compat : compat glibc ; python3/make/g++ : toolchain pour compiler les
# modules natifs (argon2) si aucun binaire prébuilt musl n'est disponible.
# Ce toolchain reste dans les étapes de build — l'image runner ne l'embarque pas.
RUN apk add --no-cache libc6-compat python3 make g++
# pnpm via corepack (fourni avec Node). Version pilotée par le champ
# "packageManager" du package.json racine (copié plus bas).
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

# 1. Prune : ne garde que le sous-arbre de l'API (api + shared + database +
# connectors) avec un lockfile élagué. Exclut tout le frontend (next,
# posthog-js, @img…) qui n'a rien à faire dans l'image API.
FROM base AS pruner
COPY . .
RUN npx --yes turbo@2.5.4 prune @paybrain/api --docker

# 2+3. Install + build dans le MÊME contexte (out/full).
# On installe directement contre les manifestes complets : sinon, installer
# contre les manifestes prunés (out/json) puis poser out/full par-dessus crée une
# « dérive » que pnpm tente de réconcilier par un install non-frozen (qui casse).
# node_modules aligné → `pnpm exec`/`pnpm --filter` résolvent les binaires
# correctement sans re-vérification. On copie pnpm-workspace.yaml (nodeLinker +
# allowBuilds) : pnpm 11 y lit tous ses réglages (le .npmrc est ignoré).
FROM base AS builder
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
# out/json = manifestes + pnpm-lock.yaml prunés → install (couche cache stable).
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile
# out/full = sources complètes (MÊMES manifestes) posées par-dessus, dans le même
# stage : node_modules n'est pas recopié entre stages, donc pnpm ne détecte pas
# de dérive et ne relance pas d'install au moment des `pnpm exec`/`--filter`.
COPY --from=pruner /app/out/full/ ./
# tsconfig.base.json (racine) est hérité par les tsconfig des packages mais n'est
# pas inclus par `turbo prune` — on le copie depuis le contexte de build.
COPY tsconfig.base.json ./tsconfig.base.json
# prisma est une dép de @paybrain/database (pas de la racine) : on génère le
# client dans le contexte du paquet, où le binaire et le schéma sont résolus.
RUN pnpm --filter @paybrain/database db:generate
RUN pnpm --filter @paybrain/shared build \
  && pnpm --filter @paybrain/database build \
  && pnpm --filter @paybrain/connectors build \
  && pnpm --filter @paybrain/api build

# 4. Déploiement autonome de l'API (hors workspace, /prod). `pnpm deploy` produit
# un node_modules PROD APLATI (nodeLinker=hoisted) avec les paquets workspace
# @paybrain/* INLINÉS (vrais dossiers + leur dist) et @prisma/client déjà généré
# (copié depuis le store). Ça remplace `pnpm prune --prod`, qui détruisait les
# liens workspace, et l'assemblage manuel fragile de l'image.
# --legacy : déploie depuis le node_modules déjà installé (les paquets workspace
# sont bâtis, dist présent). Évite `injectWorkspacePackages` qui, en global,
# copierait les paquets internes au lieu de les symlinker (régression en dev local).
RUN pnpm --filter=@paybrain/api deploy --prod --legacy /prod
# `deploy` ne transporte PAS le client Prisma généré (.prisma/client) — seulement
# le stub. On le régénère DANS le déploiement, où @prisma/client et le schéma
# (inliné avec @paybrain/database) sont résolus, sinon `new PrismaClient()` jette
# « did not initialize » au démarrage.
RUN cd /prod && node_modules/.bin/prisma generate --schema=node_modules/@paybrain/database/prisma/schema.prisma

# 5. Image de production
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Threadpool libuv (argon2 / PDF / I/O fichier) — défaut 4 = goulot sous pic d'auth.
ENV UV_THREADPOOL_SIZE=16

# CA bundle RDS pour TLS verify-full sur PostgreSQL (ALP-165).
# En prod, DATABASE_URL = ...?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca-bundle.pem
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-ca-bundle.pem
RUN chmod 644 /etc/ssl/rds-ca-bundle.pem

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# node_modules autonome issu de `pnpm deploy` (prod, @paybrain/* inlinés, client
# Prisma généré) + bundle de l'API. Plus de symlinks workspace à recoller.
COPY --from=builder --chown=nestjs:nodejs /prod/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /prod/package.json ./package.json
# Schéma + SQL conservés au même chemin pour la tâche de migration
# (`prisma migrate deploy --schema=packages/database/prisma/schema.prisma`).
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/prisma ./packages/database/prisma
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/sql ./packages/database/sql

USER nestjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/main"]
