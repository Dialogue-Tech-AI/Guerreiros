# Multi-stage build for optimization

# Stage 1: Dependencies
FROM node:20-alpine AS deps
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Stage 2: Build
FROM node:20-alpine AS builder
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# Stage 3: Production
FROM node:20-alpine AS runner
WORKDIR /app

# ffmpeg para conversão de áudio WebM -> OGG (envio de áudios pela plataforma)
RUN apk add --no-cache ffmpeg

# Set environment
ENV NODE_ENV=production

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 altese

# Copy built app and dependencies
COPY --from=deps --chown=altese:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=altese:nodejs /app/dist ./dist
COPY --from=builder --chown=altese:nodejs /app/package*.json ./

# Criar diretório logs e garantir permissões para o logger Winston
RUN mkdir -p /app/logs && chown -R altese:nodejs /app

# Switch to non-root user
USER altese

# Expose application port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "dist/main.js"]
