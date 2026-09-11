# syntax=docker/dockerfile:1

# Node 24 runs the TypeScript sources directly by stripping types, so there is
# no build step and no compiled output to carry between stages. The only thing
# worth splitting out is the dependency install.
FROM node:24-slim AS deps

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

# Reads the `packageManager` field, so the image gets the same pnpm the repo
# is pinned to rather than whatever is latest on the day it is built.
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

# Production dependencies only: React and every payload library are resolved
# out of `node_modules` at compile time, so they have to ship — typescript and
# the @types packages do not. esbuild's postinstall, allowlisted in
# package.json, is what fetches the platform binary for this image's arch.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod

FROM node:24-slim AS runner

ENV NODE_ENV=production \
    PORT=4000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

# package.json is read at runtime by GET /libraries, not only at install time.
COPY package.json ./
COPY src ./src
COPY mocks ./mocks
COPY public ./public

# This process bundles untrusted model output, so it runs with no more than it
# needs: an unprivileged user and nothing writable. esbuild writes no files —
# the bundle is returned in memory — so `--read-only` works.
USER node

EXPOSE 4000

# No curl in the slim image; Node's global fetch is enough.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT ?? 4000) + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

# Node is PID 1 here and `main.ts` handles SIGTERM itself, so the container
# stops cleanly without an init shim.
CMD ["node", "src/main.ts"]
