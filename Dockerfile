# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies
RUN npm install

# Copy source code
COPY src ./src

# Build the project
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy production files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Expose port (default 3000)
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the bot
CMD ["npm", "start"]
