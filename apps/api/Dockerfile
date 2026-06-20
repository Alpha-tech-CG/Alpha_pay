FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# Install dependencies
FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/
COPY packages/database/package*.json ./packages/database/
COPY packages/connectors/package*.json ./packages/connectors/
RUN npm ci

# Build
FROM deps AS builder
COPY . .
RUN npx prisma generate --schema=packages/database/prisma/schema.prisma
RUN npm run build --workspace @paybrain/shared \
  && npm run build --workspace @paybrain/database \
  && npm run build --workspace @paybrain/connectors \
  && npm run build --workspace @paybrain/api

# Production image
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# CA bundle RDS pour TLS verify-full sur PostgreSQL (ALP-165).
# En prod, DATABASE_URL = ...?sslmode=verify-full&sslrootcert=/etc/ssl/rds-ca-bundle.pem
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds-ca-bundle.pem
RUN chmod 644 /etc/ssl/rds-ca-bundle.pem

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
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
