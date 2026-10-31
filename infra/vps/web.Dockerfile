# Image « web » de production : Caddy (TLS) qui sert le tableau de bord marchand
# (PWA) et le back-office construits en statique, et relaie l'API.
#   docker compose -f docker-compose.prod.yml build caddy
# Contexte : racine du dépôt ; exclusions dans web.Dockerfile.dockerignore.

FROM node:22-alpine AS dashboard
WORKDIR /app
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dashboard/ ./
RUN npm run build

FROM node:22-alpine AS admin
WORKDIR /app
COPY admin/package.json admin/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY admin/ ./
RUN npm run build

FROM caddy:2.8-alpine
COPY infra/vps/Caddyfile /etc/caddy/Caddyfile
COPY --from=dashboard /app/dist /srv/dashboard
COPY --from=admin /app/dist /srv/admin
