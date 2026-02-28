# ── COSMEON FS-LITE Orchestrator ──
FROM oven/bun:1-alpine AS base

WORKDIR /app

# Install dependencies
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile || bun install

# Copy source
COPY . .

# Build Next.js
ARG MONGODB_URI
ENV MONGODB_URI=$MONGODB_URI
RUN bun run build

# Production stage
FROM oven/bun:1-alpine AS runner
WORKDIR /app

ARG MONGODB_URI
ENV MONGODB_URI=$MONGODB_URI
ENV NODE_ENV=production
ENV STORAGE_MODE=docker
ENV HOSTNAME="0.0.0.0"

COPY --from=base /app/.next/standalone ./
COPY --from=base /app/.next/static ./.next/static
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["bun", "run", "server.js"]
