# ── Node Storage Service ──
FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install --frozen-lockfile || bun install

COPY server.ts ./

# Data stored at /data/chunks (mount a volume here)
RUN mkdir -p /data/chunks

EXPOSE 4000

CMD ["bun", "run", "server.ts"]
