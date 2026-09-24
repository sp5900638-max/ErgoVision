# ==============================================================================
# Stage 1: Build Single Page Application (SPA)
# ==============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Enable secure package resolution
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# ==============================================================================
# Stage 2: Unprivileged Static Server (Nginx Unprivileged)
# ==============================================================================
FROM nginxinc/nginx-unprivileged:1.25-alpine-slim AS runner

# Hardened minimal Nginx configuration serving compiled assets on port 8080
COPY --chown=101:101 ./nginx/spa.conf /etc/nginx/conf.d/default.conf
COPY --from=builder --chown=101:101 /app/dist /usr/share/nginx/html

USER 101

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
