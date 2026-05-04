FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 compiles from source when no matching prebuild exists (common on newer Node
# or non-default platforms). bookworm-slim omits python/make/g++, which breaks node-gyp.
# Keep this even when DB_DRIVER=pg at runtime — the dependency is still installed and may need compile.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# .npmrc must be present before `npm ci` (legacy-peer-deps for OpenAI/zod peer mismatch).
# --include=dev: CI / Cloud Build often sets NODE_ENV=production; without this, npm ci skips
# devDependencies and `npm run lint` (tsc) fails because typescript is not installed.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps --include=dev

COPY . .

# Fail fast if the Git/archive context is missing the Vite entry (common when
# `src/` was never pushed or a wrong build context is used).
RUN test -f index.html && test -f src/main.tsx && test -f vite.config.ts

ENV NODE_ENV=production
# Cloud Run sets PORT (default 8080). Do not bake PORT=3000 here — it can prevent the
# process from binding the port the platform health-checks.
EXPOSE 8080

# Type-check then bundle (matches local `npm run lint` + `npm run build`).
RUN npm run lint && npm run build

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
