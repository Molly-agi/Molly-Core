FROM node:18-alpine

LABEL maintainer="Molly Labs Inc."
LABEL description="Family Bridge - Real-time AI Agent Communication"
LABEL version="1.0.0"

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY daemon/ ./daemon/
COPY lib/ ./lib/
COPY scripts/ ./scripts/
COPY README.md .

# Create data directory
RUN mkdir -p data

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:9099/health').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

# Use dumb-init to handle signals properly
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start bridge daemon
CMD ["node", "daemon/bridge-daemon.mjs"]

EXPOSE 9099
