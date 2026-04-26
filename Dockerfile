# ════════════════════════════════════════════════════════
# SENTINEL ATLAS OS — Multi-Stage Production Dockerfile
# ════════════════════════════════════════════════════════

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm ci --include=dev

# Copy source code
COPY src ./src

# Build the project
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install PM2 globally for process management
RUN npm install -g pm2

# Install curl for healthcheck
RUN apk add --no-cache curl

# Copy production files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy PM2 ecosystem config
COPY ecosystem.config.js ./

# Create logs directory
RUN mkdir -p ./logs

# Expose port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start via PM2 runtime (cluster mode, auto-restart)
CMD ["pm2-runtime", "ecosystem.config.js", "--env", "production"]
