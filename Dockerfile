FROM node:20-bookworm-slim

WORKDIR /app

# better-sqlite3 compiles from source when no matching prebuild exists (common on newer Node
# or non-default platforms). bookworm-slim omits python/make/g++, which breaks node-gyp.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
  && rm -rf /var/lib/apt/lists/*

# .npmrc must be present before `npm ci` (legacy-peer-deps for OpenAI/zod peer mismatch).
COPY package.json package-lock.json .npmrc ./
RUN npm ci --legacy-peer-deps

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

CMD ["npm", "run", "start"]
