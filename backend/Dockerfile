# ============================================================
# Mi Carrito POS Backend - Dockerfile multi-stage
# Stage 1: build (deps de desarrollo + compilacion TypeScript)
# Stage 2: runtime (solo dependencias de produccion)
# ============================================================
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --from=builder /app/dist ./dist
# Directorios para XML UBL y CDR de facturacion electronica
RUN mkdir -p /app/storage/fe/xml /app/storage/fe/cdr
EXPOSE 3000
CMD ["node", "dist/main.js"]
